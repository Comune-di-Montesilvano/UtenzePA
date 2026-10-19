import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { BaseService } from '@apis/shared/base.service';
import { AuditAction } from '@apis/audit-log/entity/audit-log.entity';
import { partyName } from '@apis/third-parties/third-party.name';
import { UtilitySupplyEvent } from './entity/utility-supply-event.entity';
import { SupplyEventType } from './enum/supply-event-type.enum';
import { sequenceWarnings, validateEvent } from './supply-state';
import { grantLabel } from './grant-label';
import { SupplyReconcileService, dbDay, romeDay, toEventLike } from './supply-reconcile.service';
import { CreateSupplyEventDto } from './dto/create-supply-event.dto';
import { UpdateSupplyEventDto } from './dto/update-supply-event.dto';

export const AUTOMATIC_ROW_MESSAGE =
  'Riga gestita dal contratto immobiliare: cambia la decisione sul contratto.';

export type SupplyEventView = Omit<
  UtilitySupplyEvent,
  'thirdParty' | 'grant' | 'utility' | 'created_by' | 'updated_by'
> & {
  third_party_name: string | null;
  grant_label: string | null;
};

export interface SupplyEventsList {
  events: SupplyEventView[];
  warnings: string[];
}

// Campi modificabili di una riga.
const EDITABLE = [
  'type',
  'third_party_id_fk',
  'requested_on',
  'effective_on',
  'date_unknown',
  'notes',
] as const;
// Su una riga automatica (collegata a un contratto immobiliare) l'utente
// registra solo quando è avvenuta: così una voltura diventa effettiva.
const AUTOMATIC_EDITABLE = new Set<string>(['effective_on', 'notes']);
const DATE_FIELDS = new Set<string>(['requested_on', 'effective_on']);

type EventFields = Pick<UtilitySupplyEvent, (typeof EDITABLE)[number]>;

// Storico di un'utenza (roadmap voce 22): una riga per cambiamento. Ogni
// scrittura è validata con validateEvent (400) e seguita dalla riconciliazione
// dell'utenza, che ricalcola le colonne di stato.
@Injectable()
export class SupplyEventsService extends BaseService<
  UtilitySupplyEvent,
  CreateSupplyEventDto,
  UpdateSupplyEventDto
> {
  protected readonly entityName = 'utility_supply_events';
  protected readonly relations = ['thirdParty', 'grant'];
  now: () => Date = () => new Date();

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(UtilitySupplyEvent)
    protected readonly repo: Repository<UtilitySupplyEvent>,
    private readonly reconcileService: SupplyReconcileService,
  ) {
    super();
  }

  async listByUtility(utilityId: number): Promise<SupplyEventsList> {
    const rows = await this.repo.find({
      where: { utility_id_fk: utilityId, deleted: false },
      relations: { thirdParty: true, grant: true },
    });
    // Come le funzioni di stato: «data non nota» prima, poi per data
    // effettiva, in sospeso in fondo; a parità id.
    const rank = (e: UtilitySupplyEvent) => (e.date_unknown ? 0 : e.effective_on ? 1 : 2);
    rows.sort((a, b) => {
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      const da = dbDay(a.effective_on) ?? '';
      const db = dbDay(b.effective_on) ?? '';
      if (da !== db) return da < db ? -1 : 1;
      return a.id - b.id;
    });
    const events = rows.map((row) => {
      const { thirdParty, grant, ...rest } = row as UtilitySupplyEvent & Record<string, unknown>;
      delete (rest as Record<string, unknown>).utility;
      delete (rest as Record<string, unknown>).created_by;
      delete (rest as Record<string, unknown>).updated_by;
      return {
        ...rest,
        // Solo il nome: niente codice fiscale a chi legge.
        third_party_name: thirdParty ? partyName(thirdParty) || null : null,
        grant_label: grant ? grantLabel(grant) : null,
      } as SupplyEventView;
    });
    return { events, warnings: sequenceWarnings(rows.map(toEventLike)) };
  }

  async create(dto: CreateSupplyEventDto, userId?: number): Promise<UtilitySupplyEvent> {
    const utilityId = dto.utility_id_fk;
    const fields = this.normalize({
      type: dto.type,
      third_party_id_fk: dto.third_party_id_fk ?? null,
      requested_on: dto.requested_on ?? null,
      effective_on: dto.effective_on ?? null,
      date_unknown: !!dto.date_unknown,
      notes: dto.notes ?? null,
    });
    const saved = await this.dataSource.transaction(async (m) => {
      const utility = await this.reconcileService.lockUtility(m, utilityId);
      if (!utility || utility.deleted) throw new BadRequestException('Utenza non trovata.');
      await this.validate(m, utilityId, fields, null);
      const repo = m.getRepository(UtilitySupplyEvent);
      const row = await this.persist(() =>
        repo.save(
          repo.create({
            ...fields,
            utility_id_fk: utilityId,
            utilizer_grant_id_fk: null,
            ...(userId !== undefined
              ? { created_by_user_id: userId, updated_by_user_id: userId }
              : {}),
          }),
        ),
      );
      await this.reconcileService.reconcileWith(m, utilityId, userId);
      return row;
    });
    await this.recordAudit(AuditAction.CREATE, saved.id, userId, []);
    return saved;
  }

  // Riga di partenza di un'utenza nuova: attiva (data indicata o non nota)
  // oppure attivazione in sospeso.
  createInitial(
    utilityId: number,
    init: { active: boolean; effective_on?: string | null; requested_on?: string | null },
    userId: number,
  ): Promise<UtilitySupplyEvent> {
    const effective = init.active ? (init.effective_on ?? null) : null;
    return this.create(
      {
        utility_id_fk: utilityId,
        type: SupplyEventType.ACTIVATION,
        effective_on: effective,
        date_unknown: init.active && !effective,
        requested_on: init.requested_on ?? null,
      },
      userId,
    );
  }

  async update(id: number, dto: UpdateSupplyEventDto, userId?: number): Promise<UtilitySupplyEvent> {
    const patch = Object.fromEntries(
      Object.entries(dto).filter(
        ([k, v]) => v !== undefined && (EDITABLE as readonly string[]).includes(k),
      ),
    ) as Partial<EventFields>;
    const { saved, before, after } = await this.locked(id, async (m, current) => {
      if (current.cancelled_on) {
        throw new BadRequestException('Cambiamento annullato: non si può modificare.');
      }
      if (current.utilizer_grant_id_fk != null) {
        for (const [k, v] of Object.entries(patch)) {
          if (!AUTOMATIC_EDITABLE.has(k) && !sameValue(k, current[k as keyof EventFields], v)) {
            throw new BadRequestException(AUTOMATIC_ROW_MESSAGE);
          }
        }
      }
      const previous = pickFields(current);
      const merged = this.normalize({ ...previous, ...patch });
      await this.validate(m, current.utility_id_fk, merged, current);
      const row = await this.persist(() =>
        m.getRepository(UtilitySupplyEvent).save({
          ...current,
          ...merged,
          ...(userId !== undefined ? { updated_by_user_id: userId } : {}),
        }),
      );
      await this.reconcileService.reconcileWith(m, current.utility_id_fk, userId);
      return { saved: row, before: previous, after: merged };
    });
    await this.auditUpdate(id, userId, before, after);
    return saved;
  }

  // Annulla un cambiamento in sospeso inserito a mano: resta nello storico.
  async cancel(id: number, userId: number): Promise<UtilitySupplyEvent> {
    const today = romeDay(this.now());
    const saved = await this.locked(id, async (m, current) => {
      if (current.utilizer_grant_id_fk != null) {
        throw new BadRequestException(AUTOMATIC_ROW_MESSAGE);
      }
      if (current.cancelled_on) throw new BadRequestException('Cambiamento già annullato.');
      if (current.date_unknown || current.effective_on) {
        throw new BadRequestException('Solo un cambiamento in sospeso si può annullare.');
      }
      const row = await m
        .getRepository(UtilitySupplyEvent)
        .save({ ...current, cancelled_on: today, updated_by_user_id: userId });
      await this.reconcileService.reconcileWith(m, current.utility_id_fk, userId);
      return row;
    });
    await this.auditUpdate(id, userId, { cancelled_on: null }, { cancelled_on: today });
    return saved;
  }

  async remove(id: number, userId: number): Promise<void> {
    await this.locked(id, async (m, current) => {
      if (current.utilizer_grant_id_fk != null) {
        throw new BadRequestException(AUTOMATIC_ROW_MESSAGE);
      }
      await m
        .getRepository(UtilitySupplyEvent)
        .save({ ...current, deleted: true, updated_by_user_id: userId });
      await this.reconcileService.reconcileWith(m, current.utility_id_fk, userId);
    });
    await this.recordAudit(AuditAction.DELETE, id, userId, []);
  }

  // Una transazione per scrittura: blocco dell'utenza, rilettura della riga,
  // validazione, salvataggio e riconciliazione. Se la riconciliazione fallisce
  // la riga non resta salvata; due salvataggi in parallelo si mettono in coda.
  // L'utenza della riga si cerca FUORI dalla transazione: in REPEATABLE READ
  // la prima lettura semplice fissa la fotografia della transazione, quindi il
  // blocco deve essere la prima istruzione e tutto il resto si legge dopo.
  private async locked<T>(
    id: number,
    fn: (m: EntityManager, current: UtilitySupplyEvent) => Promise<T>,
  ): Promise<T> {
    const first = await this.repo.findOne({ where: { id, deleted: false } });
    if (!first) throw new BadRequestException('Cambiamento non trovato.');
    const utilityId = first.utility_id_fk;
    return this.dataSource.transaction(async (m) => {
      await this.reconcileService.lockUtility(m, utilityId);
      const current = await m
        .getRepository(UtilitySupplyEvent)
        .findOne({ where: { id, deleted: false } });
      // Cancellata o spostata nel frattempo.
      if (!current || current.utility_id_fk !== utilityId) {
        throw new BadRequestException('Riga non trovata.');
      }
      return fn(m, current);
    });
  }

  private async persist<T>(save: () => Promise<T>): Promise<T> {
    try {
      return await save();
    } catch (error) {
      this.manageErrors(error, `Errore durante il salvataggio di ${this.entityName}`);
    }
  }

  // Audit dopo il commit, best-effort come in BaseService.
  private async auditUpdate(
    id: number,
    userId: number | undefined,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ): Promise<void> {
    try {
      const changes = await this.diffFields(before, after, after);
      await this.recordAudit(AuditAction.UPDATE, id, userId, changes);
    } catch (error) {
      console.error(`[SupplyEventsService] Errore audit per ${this.entityName}`, error);
    }
  }

  // Data non nota solo per attivazioni/cessazioni (e senza data effettiva);
  // intestatario solo per le volture.
  private normalize(f: EventFields): EventFields {
    const out = { ...f };
    const datable = out.type === SupplyEventType.ACTIVATION || out.type === SupplyEventType.CESSATION;
    if (out.date_unknown && !datable) {
      throw new BadRequestException('La data non nota vale solo per attivazioni e cessazioni.');
    }
    if (out.date_unknown) out.effective_on = null;
    if (out.type !== SupplyEventType.TRANSFER) out.third_party_id_fk = null;
    out.requested_on = dbDay(out.requested_on);
    out.effective_on = dbDay(out.effective_on);
    return out;
  }

  private async validate(
    m: EntityManager,
    utilityId: number,
    fields: EventFields,
    current: UtilitySupplyEvent | null,
  ): Promise<void> {
    const others = (
      await m
        .getRepository(UtilitySupplyEvent)
        .find({ where: { utility_id_fk: utilityId, deleted: false } })
    ).filter((e) => e.id !== current?.id);
    const candidate = toEventLike({
      ...(current ?? {
        id: Number.MAX_SAFE_INTEGER,
        cancelled_on: null,
        deleted: false,
        utilizer_grant_id_fk: null,
        create_date: this.now(),
      }),
      ...fields,
    } as UtilitySupplyEvent);
    const message = validateEvent(candidate, others.map(toEventLike), romeDay(this.now()));
    if (message) throw new BadRequestException(message);
  }
}

function pickFields(e: UtilitySupplyEvent): EventFields {
  return {
    type: e.type,
    third_party_id_fk: e.third_party_id_fk ?? null,
    requested_on: dbDay(e.requested_on),
    effective_on: dbDay(e.effective_on),
    date_unknown: !!e.date_unknown,
    notes: e.notes ?? null,
  };
}

// Valore invariato rispetto alla riga (il client rimanda spesso il record intero).
function sameValue(key: string, a: unknown, b: unknown): boolean {
  if (DATE_FIELDS.has(key)) return dbDay(a) === dbDay(b);
  if (key === 'date_unknown') return !!a === !!b;
  const norm = (v: unknown) => (v === null || v === undefined || v === '' ? '' : String(v));
  return norm(a) === norm(b);
}

import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseService } from '@apis/shared/base.service';
import { Utility } from '@apis/utility/entity/utility.entity';
import { partyName } from '@apis/third-parties/third-party.name';
import { UtilitySupplyEvent } from './entity/utility-supply-event.entity';
import { SupplyEventType } from './enum/supply-event-type.enum';
import { sequenceWarnings, validateEvent } from './supply-state';
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
    @InjectRepository(UtilitySupplyEvent)
    protected readonly repo: Repository<UtilitySupplyEvent>,
    @InjectRepository(Utility)
    private readonly utilityRepo: Repository<Utility>,
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
        grant_label: grant ? (grant.subject ?? grant.concession_act ?? `#${grant.id}`) : null,
      } as SupplyEventView;
    });
    return { events, warnings: sequenceWarnings(rows.map(toEventLike)) };
  }

  async create(dto: CreateSupplyEventDto, userId?: number): Promise<UtilitySupplyEvent> {
    const utilityId = dto.utility_id_fk;
    const utility = await this.utilityRepo.findOne({ where: { id: utilityId } });
    if (!utility || utility.deleted) throw new BadRequestException('Utenza non trovata.');
    const fields = this.normalize({
      type: dto.type,
      third_party_id_fk: dto.third_party_id_fk ?? null,
      requested_on: dto.requested_on ?? null,
      effective_on: dto.effective_on ?? null,
      date_unknown: !!dto.date_unknown,
      notes: dto.notes ?? null,
    });
    await this.validate(utilityId, fields, null);
    const saved = await super.create(
      { ...fields, utility_id_fk: utilityId, utilizer_grant_id_fk: null } as never,
      userId,
    );
    await this.reconcileService.reconcile(utilityId, userId);
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
    const current = await this.current(id);
    if (current.cancelled_on) {
      throw new BadRequestException('Cambiamento annullato: non si può modificare.');
    }
    const patch = Object.fromEntries(
      Object.entries(dto).filter(([k, v]) => v !== undefined && (EDITABLE as readonly string[]).includes(k)),
    ) as Partial<EventFields>;
    if (current.utilizer_grant_id_fk != null) {
      for (const [k, v] of Object.entries(patch)) {
        if (!AUTOMATIC_EDITABLE.has(k) && !sameValue(k, current[k as keyof EventFields], v)) {
          throw new BadRequestException(AUTOMATIC_ROW_MESSAGE);
        }
      }
    }
    const merged = this.normalize({ ...pickFields(current), ...patch });
    await this.validate(current.utility_id_fk, merged, current);
    const saved = await super.update(id, merged as never, userId);
    await this.reconcileService.reconcile(current.utility_id_fk, userId);
    return saved;
  }

  // Annulla un cambiamento in sospeso inserito a mano: resta nello storico.
  async cancel(id: number, userId: number): Promise<UtilitySupplyEvent> {
    const current = await this.current(id);
    if (current.utilizer_grant_id_fk != null) throw new BadRequestException(AUTOMATIC_ROW_MESSAGE);
    if (current.cancelled_on) throw new BadRequestException('Cambiamento già annullato.');
    if (current.date_unknown || current.effective_on) {
      throw new BadRequestException('Solo un cambiamento in sospeso si può annullare.');
    }
    const saved = await super.update(id, { cancelled_on: romeDay(this.now()) } as never, userId);
    await this.reconcileService.reconcile(current.utility_id_fk, userId);
    return saved;
  }

  async remove(id: number, userId: number): Promise<void> {
    const current = await this.current(id);
    if (current.utilizer_grant_id_fk != null) throw new BadRequestException(AUTOMATIC_ROW_MESSAGE);
    await super.remove(id, userId);
    await this.reconcileService.reconcile(current.utility_id_fk, userId);
  }

  private async current(id: number): Promise<UtilitySupplyEvent> {
    const row = await this.repo.findOne({ where: { id, deleted: false } });
    if (!row) throw new BadRequestException('Cambiamento non trovato.');
    return row;
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
    utilityId: number,
    fields: EventFields,
    current: UtilitySupplyEvent | null,
  ): Promise<void> {
    const others = (
      await this.repo.find({ where: { utility_id_fk: utilityId, deleted: false } })
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

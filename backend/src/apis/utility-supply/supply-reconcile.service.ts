import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Utility } from '@apis/utility/entity/utility.entity';
import {
  ContractDirection,
  ContractStatus,
} from '@apis/utilizer-grant/enum/real-estate-contract.enum';
import { UtilitySupplyEvent } from './entity/utility-supply-event.entity';
import { GrantUtilityDecision } from './entity/grant-utility-decision.entity';
import { GrantUtilityDecisionValue, SupplyEventType } from './enum/supply-event-type.enum';
import { SupplyEventLike, currentSnapshot } from './supply-state';
import {
  DecisionLike,
  GrantLike,
  ReconcilePlan,
  isGrantActive,
  planReconcile,
} from './supply-reconcile';

// Giorno 'AAAA-MM-GG' a Roma (il container gira in UTC).
const ROME_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Rome',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function romeDay(value: Date | string): string {
  return typeof value === 'string' ? value.slice(0, 10) : ROME_DATE.format(value);
}

// Colonna DATE da una query grezza: mysql2 la restituisce come Date a
// mezzanotte locale, l'entity come stringa.
export function dbDay(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${value.getFullYear()}-${p(value.getMonth() + 1)}-${p(value.getDate())}`;
  }
  return String(value).slice(0, 10);
}

export function toEventLike(e: UtilitySupplyEvent): SupplyEventLike {
  return {
    id: e.id,
    type: e.type,
    third_party_id_fk: e.third_party_id_fk ?? null,
    requested_on: dbDay(e.requested_on),
    effective_on: dbDay(e.effective_on),
    date_unknown: !!e.date_unknown,
    cancelled_on: dbDay(e.cancelled_on),
    deleted: !!e.deleted,
    utilizer_grant_id_fk: e.utilizer_grant_id_fk ?? null,
    create_date: romeDay(e.create_date ?? new Date()),
  };
}

export interface GrantDecisionRow {
  utility_id: number;
  decision: GrantUtilityDecisionValue | null;
  third_party_id: number | null;
  // Proposta di partenza: FOLLOWS se il contratto ha «Utenze da volturare».
  proposal: GrantUtilityDecisionValue | null;
  // Contratto FOLLOWS scavalcato da uno più recente con un'altra controparte.
  overridden: boolean;
}

interface Loaded {
  utility: Utility;
  events: UtilitySupplyEvent[];
  decisions: GrantUtilityDecision[];
  grants: GrantLike[];
  plan: ReconcilePlan;
  snapshot: ReturnType<typeof currentSnapshot>;
  // Nessuna riga di storico (nemmeno cancellata): utenza non ancora migrata.
  noHistory: boolean;
}

const GRANT_FIELDS =
  'g.id, g.start_date, g.end_date, g.direction, g.status, g.tacit_renewal, g.renewal_months, ' +
  'g.notice_months, g.utilities_to_be_taken_over, g.update_date, g.deleted';

// Contratto che copre l'utenza da un immobile non cancellato.
const COVERS_SQL =
  'EXISTS (SELECT 1 FROM utility_assets ua JOIN assets a ON a.id = ua.asset_id AND a.deleted = 0 ' +
  'JOIN utilizer_grant_assets uga ON uga.asset_id = ua.asset_id ' +
  'WHERE uga.utilizer_grant_id = g.id AND ua.utility_id = ?)';

// Riconciliazione dello storico di un'utenza con i contratti immobiliari
// (roadmap voce 22). Carica i dati, chiama planReconcile (puro) e applica il
// piano. Le colonne di stato su utilities si scrivono come ricalcolo di
// sistema: niente audit e update_date invariato (come ConsumptionRecalcService).
@Injectable()
export class SupplyReconcileService {
  private readonly logger = new Logger(SupplyReconcileService.name);
  private running = false;
  now: () => Date = () => new Date();

  constructor(private readonly dataSource: DataSource) {}

  private today(): string {
    return romeDay(this.now());
  }

  async reconcile(utilityId: number, userId?: number): Promise<void> {
    await this.dataSource.transaction((m) => this.reconcileWith(m, utilityId, userId));
  }

  async reconcileMany(utilityIds: number[], userId?: number): Promise<void> {
    for (const id of [...new Set(utilityIds)]) await this.reconcile(id, userId);
  }

  // Dopo un salvataggio già confermato (contratto, immobili dell'utenza): un
  // errore su un'utenza non deve far fallire la richiesta né fermare le altre.
  // Il giro notturno riallinea quello che è rimasto indietro.
  async reconcileManySafe(utilityIds: number[], userId?: number): Promise<void> {
    for (const id of [...new Set(utilityIds)]) {
      try {
        await this.reconcile(id, userId);
      } catch (error) {
        this.logger.error(`Riconciliazione fallita per utenza ${id}`, error as Error);
      }
    }
  }

  // Tutte le utenze (job notturno e avvio): i contratti finiscono per data
  // senza che nessuno li salvi.
  async reconcileAll(): Promise<{ processed: number; changed: number; failed: number }> {
    if (this.running) {
      this.logger.warn('Riconciliazione storico utenze saltata: già in corso');
      return { processed: 0, changed: 0, failed: 0 };
    }
    this.running = true;
    let processed = 0;
    let changed = 0;
    let failed = 0;
    try {
      const rows: { id: number }[] = await this.dataSource.manager.query(
        'SELECT id FROM utilities WHERE deleted = 0 ORDER BY id',
      );
      for (const { id } of rows) {
        try {
          const didChange = await this.dataSource.transaction((m) =>
            this.reconcileWith(m, Number(id)),
          );
          processed++;
          if (didChange) changed++;
        } catch (error) {
          failed++;
          this.logger.error(`Riconciliazione fallita per utenza ${id}`, error as Error);
        }
      }
    } finally {
      this.running = false;
    }
    this.logger.log(
      `Riconciliazione storico utenze: ${processed} utenze, ${changed} cambiate, ${failed} errori`,
    );
    return { processed, changed, failed };
  }

  // Utenze toccate da un contratto: coperte dai suoi immobili, con una riga di
  // decisione o con righe di storico collegate. Da chiamare prima e dopo il
  // salvataggio del contratto (un immobile tolto esce dalla prima query).
  async utilityIdsOfGrant(grantId: number): Promise<number[]> {
    const rows: { utility_id: number }[] = await this.dataSource.manager.query(
      'SELECT ua.utility_id AS utility_id FROM utility_assets ua ' +
        'JOIN assets a ON a.id = ua.asset_id AND a.deleted = 0 ' +
        'JOIN utilizer_grant_assets uga ON uga.asset_id = ua.asset_id AND uga.utilizer_grant_id = ? ' +
        'JOIN utilities u ON u.id = ua.utility_id AND u.deleted = 0 ' +
        'UNION SELECT d.utility_id_fk FROM utilizer_grant_utility_decisions d ' +
        'JOIN utilities u ON u.id = d.utility_id_fk AND u.deleted = 0 WHERE d.utilizer_grant_id_fk = ? ' +
        'UNION SELECT e.utility_id_fk FROM utility_supply_events e ' +
        'JOIN utilities u ON u.id = e.utility_id_fk AND u.deleted = 0 ' +
        'WHERE e.utilizer_grant_id_fk = ? AND e.deleted = 0',
      [grantId, grantId, grantId],
    );
    return [...new Set(rows.map((r) => Number(r.utility_id)))];
  }

  // ---- Decisioni per contratto -------------------------------------------

  async listDecisions(grantId: number): Promise<GrantDecisionRow[]> {
    return this.listDecisionsWith(this.dataSource.manager, grantId);
  }

  async setDecision(
    grantId: number,
    utilityId: number,
    dto: { decision: GrantUtilityDecisionValue; third_party_id?: number | null },
    userId: number,
  ): Promise<GrantDecisionRow[]> {
    await this.dataSource.transaction(async (m) => {
      await this.lockUtility(m, utilityId);
      const grant = await this.activeGrant(m, grantId);
      const covered = await this.coveredUtilityIds(m, grantId);
      if (!covered.includes(utilityId)) {
        throw new BadRequestException("L'utenza non è collegata al contratto immobiliare.");
      }
      let partyId: number | null = null;
      if (dto.decision === GrantUtilityDecisionValue.FOLLOWS) {
        if (dto.third_party_id != null) {
          if (!grant.party_ids.includes(dto.third_party_id)) {
            throw new BadRequestException('La parte indicata non è tra le parti del contratto.');
          }
          partyId = dto.third_party_id;
        } else if (grant.party_ids.length === 1) {
          partyId = grant.party_ids[0];
        } else if (grant.party_ids.length === 0) {
          throw new BadRequestException('Il contratto immobiliare non ha controparti.');
        } else {
          throw new BadRequestException("Indicare a quale parte va volturata l'utenza.");
        }
      }
      await this.saveDecision(m, grantId, utilityId, dto.decision, partyId, userId);
      await this.reconcileWith(m, utilityId, userId);
    });
    return this.listDecisions(grantId);
  }

  // Decisioni vuote → proposta del contratto (FOLLOWS con l'unica parte).
  // Con più parti la scelta resta all'ufficio, riga per riga.
  // Contratto e utenze si cercano fuori dalla transazione; dentro, prima
  // istruzione: blocco di tutte le utenze in ordine di id (niente stallo tra
  // due proposte in parallelo), poi si ricontrolla il contratto.
  async applyProposal(grantId: number, userId: number): Promise<GrantDecisionRow[]> {
    await this.activeGrant(this.dataSource.manager, grantId);
    const utilityIds = [...(await this.coveredUtilityIds(this.dataSource.manager, grantId))].sort(
      (a, b) => a - b,
    );
    await this.dataSource.transaction(async (m) => {
      for (const utilityId of utilityIds) await this.lockUtility(m, utilityId);
      const grant = await this.activeGrant(m, grantId);
      if (!grant.utilities_to_be_taken_over || grant.party_ids.length !== 1) return;
      const covered = new Set(await this.coveredUtilityIds(m, grantId));
      const decisionRepo = m.getRepository(GrantUtilityDecision);
      // Solo le utenze bloccate: una collegata nel frattempo resta da decidere.
      for (const utilityId of utilityIds.filter((id) => covered.has(id))) {
        // Utenza cessata: non è da decidere, la proposta non la tocca.
        const loaded = await this.load(m, utilityId);
        if (!loaded || !loaded.snapshot.supply_active) continue;
        const row = await decisionRepo.findOne({
          where: { utilizer_grant_id_fk: grantId, utility_id_fk: utilityId },
        });
        if (row && row.decision !== null) continue;
        await this.saveDecision(
          m,
          grantId,
          utilityId,
          GrantUtilityDecisionValue.FOLLOWS,
          grant.party_ids[0],
          userId,
        );
        await this.reconcileWith(m, utilityId, userId);
      }
    });
    return this.listDecisions(grantId);
  }

  // Blocca la riga dell'utenza fino alla fine della transazione: tutte le
  // scritture sullo storico e sulle decisioni di un'utenza (riconciliazione,
  // job, salvataggi concorrenti) si mettono in coda, e le letture che seguono
  // vedono le righe scritte da chi è passato prima. null = utenza inesistente.
  async lockUtility(
    m: EntityManager,
    utilityId: number,
  ): Promise<{ id: number; deleted: boolean } | null> {
    const rows: { id: number; deleted: number | boolean }[] = await m.query(
      'SELECT id, deleted FROM utilities WHERE id = ? FOR UPDATE',
      [utilityId],
    );
    return rows.length ? { id: Number(rows[0].id), deleted: !!Number(rows[0].deleted) } : null;
  }

  // ---- Interni -----------------------------------------------------------

  private async listDecisionsWith(m: EntityManager, grantId: number): Promise<GrantDecisionRow[]> {
    const grant = await this.loadGrant(m, grantId);
    if (!grant) throw new BadRequestException('Contratto immobiliare non trovato.');
    const proposal = grant.utilities_to_be_taken_over ? GrantUtilityDecisionValue.FOLLOWS : null;
    const out: GrantDecisionRow[] = [];
    for (const utilityId of await this.coveredUtilityIds(m, grantId)) {
      const loaded = await this.load(m, utilityId);
      // Utenza cessata: non c'è nulla da decidere.
      if (!loaded || !loaded.snapshot.supply_active) continue;
      const row = loaded.decisions.find((d) => d.utilizer_grant_id_fk === grantId);
      // Senza riga: la decisione che la riconciliazione creerebbe (rinnovo).
      const planned = loaded.plan.createDecisions.find((d) => d.grant_id === grantId);
      out.push({
        utility_id: utilityId,
        decision: row ? row.decision : (planned?.decision ?? null),
        third_party_id: row ? (row.third_party_id_fk ?? null) : (planned?.third_party_id ?? null),
        proposal,
        overridden: loaded.plan.overriddenGrantIds.includes(grantId),
      });
    }
    return out;
  }

  private async activeGrant(m: EntityManager, grantId: number): Promise<GrantLike> {
    const grant = await this.loadGrant(m, grantId);
    if (!grant) throw new BadRequestException('Contratto immobiliare non trovato.');
    if (!isGrantActive(grant, this.today())) {
      throw new BadRequestException('Il contratto immobiliare non è in corso.');
    }
    return grant;
  }

  private async saveDecision(
    m: EntityManager,
    grantId: number,
    utilityId: number,
    decision: GrantUtilityDecisionValue,
    partyId: number | null,
    userId: number,
  ): Promise<void> {
    const repo = m.getRepository(GrantUtilityDecision);
    const row = await repo.findOne({
      where: { utilizer_grant_id_fk: grantId, utility_id_fk: utilityId },
    });
    if (row) {
      await repo.update(row.id, {
        decision,
        third_party_id_fk: partyId,
        updated_by_user_id: userId,
      });
    } else {
      await repo.save(
        repo.create({
          utilizer_grant_id_fk: grantId,
          utility_id_fk: utilityId,
          decision,
          third_party_id_fk: partyId,
          updated_by_user_id: userId,
        }),
      );
    }
  }

  private async coveredUtilityIds(m: EntityManager, grantId: number): Promise<number[]> {
    const rows: { utility_id: number }[] = await m.query(
      'SELECT DISTINCT ua.utility_id AS utility_id FROM utility_assets ua ' +
        'JOIN assets a ON a.id = ua.asset_id AND a.deleted = 0 ' +
        'JOIN utilizer_grant_assets uga ON uga.asset_id = ua.asset_id AND uga.utilizer_grant_id = ? ' +
        'JOIN utilities u ON u.id = ua.utility_id AND u.deleted = 0 ORDER BY ua.utility_id',
      [grantId],
    );
    return rows.map((r) => Number(r.utility_id));
  }

  private async loadGrant(m: EntityManager, grantId: number): Promise<GrantLike | null> {
    const rows: Record<string, unknown>[] = await m.query(
      `SELECT ${GRANT_FIELDS}, 1 AS covers_utility FROM utilizer_grant g ` +
        "WHERE g.id = ? AND g.deleted = 0 AND g.direction = 'ACTIVE'",
      [grantId],
    );
    if (!rows.length) return null;
    return (await this.toGrants(m, rows))[0];
  }

  // Contratti concessi dal Comune che riguardano l'utenza: coperti da un suo
  // immobile, oppure legati solo da una decisione o da righe di storico
  // (immobile tolto, utenza scollegata) → covers_utility = false. Questi
  // ultimi anche se eliminati o passati a passivi: valgono come finiti, così
  // l'utenza volturata con quel contratto torna al Comune.
  private async loadGrants(m: EntityManager, utilityId: number): Promise<GrantLike[]> {
    const covers = `(g.deleted = 0 AND g.direction = 'ACTIVE' AND ${COVERS_SQL})`;
    const rows: Record<string, unknown>[] = await m.query(
      `SELECT ${GRANT_FIELDS}, ${covers} AS covers_utility FROM utilizer_grant g ` +
        `WHERE ${covers} ` +
        'OR EXISTS (SELECT 1 FROM utilizer_grant_utility_decisions d WHERE d.utilizer_grant_id_fk = g.id AND d.utility_id_fk = ?) ' +
        'OR EXISTS (SELECT 1 FROM utility_supply_events e WHERE e.utilizer_grant_id_fk = g.id AND e.utility_id_fk = ? AND e.deleted = 0)',
      [utilityId, utilityId, utilityId, utilityId],
    );
    return this.toGrants(m, rows);
  }

  private async toGrants(m: EntityManager, rows: Record<string, unknown>[]): Promise<GrantLike[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => Number(r.id));
    const parties: { utilizer_grant_id: number; third_party_id: number }[] = await m.query(
      'SELECT gp.utilizer_grant_id, gp.third_party_id FROM utilizer_grant_parties gp ' +
        'JOIN third_parties tp ON tp.id = gp.third_party_id AND tp.deleted = 0 ' +
        'WHERE gp.utilizer_grant_id IN (?)',
      [ids],
    );
    const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
    return rows.map((r) => {
      const status = r.status as ContractStatus;
      const direction = r.direction as ContractDirection;
      const deleted = !!Number(r.deleted ?? 0);
      return {
        id: Number(r.id),
        start_date: dbDay(r.start_date),
        end_date: dbDay(r.end_date),
        direction,
        status,
        tacit_renewal: !!Number(r.tacit_renewal),
        renewal_months: num(r.renewal_months),
        notice_months: num(r.notice_months),
        utilities_to_be_taken_over: !!Number(r.utilities_to_be_taken_over),
        party_ids: parties
          .filter((p) => Number(p.utilizer_grant_id) === Number(r.id))
          .map((p) => Number(p.third_party_id)),
        // Eliminazione o passaggio a passivo: fine dal giorno della modifica.
        status_changed_on:
          (status !== ContractStatus.ACTIVE || deleted || direction !== ContractDirection.ACTIVE) &&
          r.update_date
            ? romeDay(r.update_date as Date | string)
            : null,
        covers_utility: !!Number(r.covers_utility),
        deleted,
      };
    });
  }

  private async load(m: EntityManager, utilityId: number): Promise<Loaded | null> {
    const utility = await m.getRepository(Utility).findOne({ where: { id: utilityId } });
    if (!utility || utility.deleted) return null;
    const allEvents = await m
      .getRepository(UtilitySupplyEvent)
      .find({ where: { utility_id_fk: utilityId } });
    const events = allEvents.filter((e) => !e.deleted);
    const decisions = await m
      .getRepository(GrantUtilityDecision)
      .find({ where: { utility_id_fk: utilityId } });
    const grants = await this.loadGrants(m, utilityId);
    const today = this.today();
    const likes = events.map(toEventLike);
    const snapshot = currentSnapshot(likes, today);
    const decisionLikes: DecisionLike[] = decisions.map((d) => ({
      grant_id: d.utilizer_grant_id_fk,
      decision: d.decision ?? null,
      third_party_id: d.third_party_id_fk ?? null,
      create_date: romeDay(d.create_date ?? this.now()),
    }));
    const plan = planReconcile({
      today,
      utilityActive: snapshot.supply_active,
      grants,
      decisions: decisionLikes,
      events: likes,
    });
    return {
      utility,
      events,
      decisions,
      grants,
      plan,
      snapshot,
      noHistory: allEvents.length === 0,
    };
  }

  // Riconciliazione dentro una transazione già aperta (anche da
  // SupplyEventsService). true se una colonna di stato dell'utenza è cambiata.
  async reconcileWith(m: EntityManager, utilityId: number, userId?: number): Promise<boolean> {
    // Il blocco viene prima di ogni lettura (rientrante nella stessa transazione).
    await this.lockUtility(m, utilityId);
    const loaded = await this.load(m, utilityId);
    if (!loaded) return false;
    // Utenza senza storico: nessun dato da cui ricalcolare (lo stato
    // resterebbe «non attiva»), si lascia com'è.
    if (loaded.noHistory) {
      this.logger.warn(`Utenza ${utilityId} senza storico: riconciliazione saltata`);
      return false;
    }
    const { plan, utility, snapshot, events } = loaded;
    const today = this.today();
    const writes =
      plan.createDecisions.length + plan.createEvents.length + plan.cancelEvents.length;
    const actor = writes ? (userId ?? (await this.fallbackUserId(m))) : null;

    const decisionRepo = m.getRepository(GrantUtilityDecision);
    for (const d of plan.createDecisions) {
      await decisionRepo.save(
        decisionRepo.create({
          utilizer_grant_id_fk: d.grant_id,
          utility_id_fk: utilityId,
          decision: d.decision,
          third_party_id_fk: d.third_party_id,
          updated_by_user_id: actor,
        }),
      );
    }
    const eventRepo = m.getRepository(UtilitySupplyEvent);
    for (const e of plan.createEvents) {
      await eventRepo.save(
        eventRepo.create({
          utility_id_fk: utilityId,
          type: e.type as SupplyEventType,
          third_party_id_fk: e.type === 'TRANSFER' ? e.third_party_id : null,
          requested_on: null,
          effective_on: null,
          date_unknown: false,
          cancelled_on: null,
          utilizer_grant_id_fk: e.grant_id,
          notes: null,
          created_by_user_id: actor as number,
          updated_by_user_id: actor as number,
        }),
      );
    }
    for (const c of plan.cancelEvents) {
      const current = events.find((e) => e.id === c.id);
      const note = `Annullato in automatico: ${c.reason}`;
      await eventRepo.update(c.id, {
        cancelled_on: today,
        notes: current?.notes ? `${current.notes}\n${note}` : note,
        updated_by_user_id: actor as number,
      });
    }

    const next = {
      ...snapshot,
      cost_status: plan.costStatus,
      pending_since: plan.pendingSince,
    };
    const day = (v: unknown) => dbDay(v);
    const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
    const changed =
      !!utility.supply_active !== next.supply_active ||
      day(utility.activated_on) !== next.activated_on ||
      day(utility.ceased_on) !== next.ceased_on ||
      num(utility.transferred_to_third_party_id) !== next.transferred_to_third_party_id ||
      day(utility.transferred_on) !== next.transferred_on ||
      utility.cost_status !== next.cost_status ||
      day(utility.pending_since) !== next.pending_since;
    if (changed) {
      await m.getRepository(Utility).update(utilityId, {
        ...next,
        update_date: () => '`update_date`',
      } as never);
    }
    return changed;
  }

  // Autore delle righe automatiche dei giri di sistema (job, avvio): il primo
  // utente, cioè l'utente di sistema (SYSTEM_USER_ID = -1) dove esiste. Non in
  // cache: l'utente può essere eliminato tra un giro e l'altro.
  private async fallbackUserId(m: EntityManager): Promise<number> {
    const rows: { id: number | null }[] = await m.query(
      'SELECT MIN(id) AS id FROM system_users',
    );
    const id = rows[0]?.id;
    if (id === null || id === undefined) {
      throw new Error('Nessun utente in system_users: impossibile registrare le righe automatiche');
    }
    return Number(id);
  }
}

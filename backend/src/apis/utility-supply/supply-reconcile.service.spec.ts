import { BadRequestException } from '@nestjs/common';
import { SupplyReconcileService } from './supply-reconcile.service';
import { UtilitySupplyEvent } from './entity/utility-supply-event.entity';
import { GrantUtilityDecision } from './entity/grant-utility-decision.entity';
import { Utility } from '@apis/utility/entity/utility.entity';
import { GrantUtilityDecisionValue, SupplyEventType } from './enum/supply-event-type.enum';
import { CANCEL_GRANT_ENDED } from './supply-reconcile';
import { dbDay } from './supply-reconcile.service';

const NOW = new Date('2026-10-19T10:00:00Z');
const TODAY = '2026-10-19';

type Row = Record<string, any>;

// DB finto in memoria: repository via manager.getRepository, query grezze
// smistate dal testo SQL.
function fakeDb(init: {
  utilities?: Row[];
  events?: Row[];
  decisions?: Row[];
  grants?: Row[];
  parties?: { utilizer_grant_id: number; third_party_id: number }[];
  covered?: { grant_id: number; utility_id: number }[];
}) {
  const utilities = init.utilities ?? [];
  const events = init.events ?? [];
  const decisions = init.decisions ?? [];
  const grants = init.grants ?? [];
  const parties = init.parties ?? [];
  const covered = init.covered ?? [];
  let nextId = 1000;
  // Ordine delle chiamate: verifica che il blocco venga prima delle letture.
  const calls: string[] = [];

  const repoOf = (name: string, rows: Row[]) => ({
    find: jest.fn(async ({ where }: { where: Row }) => {
      calls.push(`find:${name}`);
      return rows
        .filter((r) => Object.entries(where).every(([k, v]) => r[k] === v))
        .map((r) => ({ ...r }));
    }),
    findOne: jest.fn(async ({ where }: { where: Row }) => {
      calls.push(`findOne:${name}`);
      const r = rows.find((x) => Object.entries(where).every(([k, v]) => x[k] === v));
      return r ? { ...r } : null;
    }),
    create: jest.fn((r: Row) => ({ ...r })),
    save: jest.fn(async (r: Row) => {
      const saved = { create_date: NOW, ...r, id: r.id ?? nextId++ };
      const i = rows.findIndex((x) => x.id === saved.id);
      if (i >= 0) rows[i] = saved;
      else rows.push(saved);
      return { ...saved };
    }),
    update: jest.fn(async (id: number, patch: Row) => {
      const r = rows.find((x) => x.id === id);
      if (r) {
        for (const [k, v] of Object.entries(patch)) if (typeof v !== 'function') r[k] = v;
      }
    }),
  });

  const repos = new Map<unknown, ReturnType<typeof repoOf>>([
    [Utility, repoOf('utility', utilities)],
    [UtilitySupplyEvent, repoOf('event', events)],
    [GrantUtilityDecision, repoOf('decision', decisions)],
  ]);

  const grantRow = (g: Row, utilityId?: number) => ({
    direction: 'ACTIVE',
    status: 'ACTIVE',
    start_date: '2026-01-01',
    end_date: null,
    tacit_renewal: 0,
    renewal_months: null,
    notice_months: null,
    utilities_to_be_taken_over: 0,
    update_date: NOW,
    ...g,
    covers_utility:
      utilityId === undefined
        ? 1
        : covered.some((c) => c.grant_id === g.id && c.utility_id === utilityId)
          ? 1
          : 0,
  });

  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('FOR UPDATE')) {
      calls.push(`lock:${params[0]}`);
      const u = utilities.find((x) => x.id === params[0]);
      return u ? [{ id: u.id, deleted: u.deleted ? 1 : 0 }] : [];
    }
    if (sql.includes('system_users')) {
      calls.push('system_user');
      return [{ id: 1 }];
    }
    if (sql.includes('utilizer_grant_parties')) {
      const ids = (params[0] as number[]) ?? [];
      return parties.filter((p) => ids.includes(p.utilizer_grant_id));
    }
    if (sql.includes('AS utility_id')) {
      const grantId = params[0] as number;
      const ids = covered.filter((c) => c.grant_id === grantId).map((c) => c.utility_id);
      if (sql.includes('utilizer_grant_utility_decisions')) {
        for (const d of decisions) if (d.utilizer_grant_id_fk === grantId) ids.push(d.utility_id_fk);
      }
      return [...new Set(ids)].map((utility_id) => ({ utility_id }));
    }
    if (sql.includes('FROM utilizer_grant g')) {
      if (sql.includes('g.id = ?')) {
        const g = grants.find((x) => x.id === params[0]);
        return g ? [grantRow(g)] : [];
      }
      const utilityId = params[0] as number;
      return grants
        .filter(
          (g) =>
            covered.some((c) => c.grant_id === g.id && c.utility_id === utilityId) ||
            decisions.some((d) => d.utilizer_grant_id_fk === g.id && d.utility_id_fk === utilityId) ||
            events.some((e) => e.utilizer_grant_id_fk === g.id && e.utility_id_fk === utilityId),
        )
        .map((g) => grantRow(g, utilityId));
    }
    if (sql.includes('FROM utilities')) {
      return utilities.filter((u) => !u.deleted).map((u) => ({ id: u.id }));
    }
    throw new Error(`query non prevista: ${sql}`);
  });

  const manager = { getRepository: (e: unknown) => repos.get(e), query };
  const dataSource = {
    manager,
    transaction: jest.fn(async (fn: (m: typeof manager) => Promise<unknown>) => fn(manager)),
  };
  return {
    dataSource,
    calls,
    query,
    utilities,
    events,
    decisions,
    repo: (e: unknown) => repos.get(e) as ReturnType<typeof repoOf>,
  };
}

const utility = (o: Row = {}) => ({
  id: 7,
  deleted: false,
  supply_active: true,
  activated_on: null,
  ceased_on: null,
  transferred_to_third_party_id: null,
  transferred_on: null,
  cost_status: 'COMUNE',
  pending_since: null,
  ...o,
});

const event = (o: Row) => ({
  utility_id_fk: 7,
  third_party_id_fk: null,
  requested_on: null,
  effective_on: null,
  date_unknown: false,
  cancelled_on: null,
  utilizer_grant_id_fk: null,
  notes: null,
  deleted: false,
  create_date: new Date('2026-01-01T10:00:00Z'),
  ...o,
});

const activation = event({ id: 1, type: SupplyEventType.ACTIVATION, date_unknown: true });

function build(db: ReturnType<typeof fakeDb>) {
  const service = new SupplyReconcileService(db.dataSource as never);
  service.now = () => NOW;
  return service;
}

describe('SupplyReconcileService.reconcile', () => {
  it('FOLLOWS senza voltura: crea il TRANSFER in sospeso collegato al contratto, autore di sistema', async () => {
    const db = fakeDb({
      utilities: [utility()],
      events: [activation],
      grants: [{ id: 10 }],
      parties: [{ utilizer_grant_id: 10, third_party_id: 5 }],
      covered: [{ grant_id: 10, utility_id: 7 }],
      decisions: [
        {
          id: 50,
          utilizer_grant_id_fk: 10,
          utility_id_fk: 7,
          decision: GrantUtilityDecisionValue.FOLLOWS,
          third_party_id_fk: 5,
          create_date: new Date('2026-01-01T10:00:00Z'),
        },
      ],
    });
    await build(db).reconcile(7);

    const created = db.events.find((e) => e.type === SupplyEventType.TRANSFER);
    expect(created).toMatchObject({
      utility_id_fk: 7,
      third_party_id_fk: 5,
      utilizer_grant_id_fk: 10,
      requested_on: null,
      effective_on: null,
      created_by_user_id: 1,
      updated_by_user_id: 1,
    });
    const [id, patch] = db.repo(Utility).update.mock.calls[0];
    expect(id).toBe(7);
    expect(patch).toMatchObject({ cost_status: 'TO_TRANSFER', pending_since: TODAY, supply_active: true });
    expect(patch.update_date()).toBe('`update_date`');
  });

  it("autore dell'utente quando passato", async () => {
    const db = fakeDb({
      utilities: [utility()],
      events: [activation],
      grants: [{ id: 10 }],
      parties: [{ utilizer_grant_id: 10, third_party_id: 5 }],
      covered: [{ grant_id: 10, utility_id: 7 }],
      decisions: [
        { id: 50, utilizer_grant_id_fk: 10, utility_id_fk: 7, decision: 'FOLLOWS', third_party_id_fk: 5, create_date: NOW },
      ],
    });
    await build(db).reconcile(7, 42);
    expect(db.events.find((e) => e.type === SupplyEventType.TRANSFER)).toMatchObject({
      created_by_user_id: 42,
      updated_by_user_id: 42,
    });
  });

  it('contratto nuovo senza decisione: inserisce la decisione vuota e scrive TO_DECIDE', async () => {
    const db = fakeDb({
      utilities: [utility()],
      events: [activation],
      grants: [{ id: 10 }],
      parties: [{ utilizer_grant_id: 10, third_party_id: 5 }],
      covered: [{ grant_id: 10, utility_id: 7 }],
    });
    await build(db).reconcile(7);
    expect(db.decisions).toHaveLength(1);
    expect(db.decisions[0]).toMatchObject({
      utilizer_grant_id_fk: 10,
      utility_id_fk: 7,
      decision: null,
      third_party_id_fk: null,
    });
    expect(db.repo(Utility).update.mock.calls[0][1]).toMatchObject({ cost_status: 'TO_DECIDE' });
  });

  it('contratto finito con TRANSFER in sospeso: annulla oggi con la nota del motivo', async () => {
    const db = fakeDb({
      utilities: [utility({ cost_status: 'TO_TRANSFER', pending_since: '2026-01-01' })],
      events: [
        activation,
        event({
          id: 2,
          type: SupplyEventType.TRANSFER,
          third_party_id_fk: 5,
          utilizer_grant_id_fk: 10,
          notes: 'nota esistente',
        }),
      ],
      grants: [{ id: 10, status: 'TERMINATED' }],
      parties: [{ utilizer_grant_id: 10, third_party_id: 5 }],
      covered: [{ grant_id: 10, utility_id: 7 }],
      decisions: [
        { id: 50, utilizer_grant_id_fk: 10, utility_id_fk: 7, decision: 'FOLLOWS', third_party_id_fk: 5, create_date: NOW },
      ],
    });
    await build(db).reconcile(7);
    const cancelled = db.events.find((e) => e.id === 2);
    expect(cancelled?.cancelled_on).toBe(TODAY);
    expect(cancelled?.notes).toBe(`nota esistente\nAnnullato in automatico: ${CANCEL_GRANT_ENDED}`);
    expect(cancelled?.updated_by_user_id).toBe(1);
    expect(db.repo(Utility).update.mock.calls[0][1]).toMatchObject({
      cost_status: 'COMUNE',
      pending_since: null,
    });
  });

  it('scrive le colonne di stato dallo storico', async () => {
    const db = fakeDb({
      utilities: [utility({ supply_active: false })],
      events: [
        event({ id: 1, type: SupplyEventType.ACTIVATION, effective_on: '2025-03-01' }),
        event({ id: 2, type: SupplyEventType.TRANSFER, third_party_id_fk: 9, effective_on: '2025-04-01' }),
      ],
    });
    await build(db).reconcile(7);
    expect(db.repo(Utility).update.mock.calls[0][1]).toMatchObject({
      supply_active: true,
      activated_on: '2025-03-01',
      ceased_on: null,
      transferred_to_third_party_id: 9,
      transferred_on: '2025-04-01',
      cost_status: 'TRANSFERRED',
    });
  });

  it('due reconcile di fila: al secondo nessun insert e nessuna scrittura', async () => {
    const db = fakeDb({
      utilities: [utility()],
      events: [activation],
      grants: [{ id: 10 }, { id: 11, start_date: '2026-02-01' }],
      parties: [
        { utilizer_grant_id: 10, third_party_id: 5 },
        { utilizer_grant_id: 11, third_party_id: 6 },
      ],
      covered: [
        { grant_id: 10, utility_id: 7 },
        { grant_id: 11, utility_id: 7 },
      ],
      decisions: [
        { id: 50, utilizer_grant_id_fk: 10, utility_id_fk: 7, decision: 'FOLLOWS', third_party_id_fk: 5, create_date: NOW },
      ],
    });
    const service = build(db);
    await service.reconcile(7);
    const eventSaves = db.repo(UtilitySupplyEvent).save.mock.calls.length;
    const decisionSaves = db.repo(GrantUtilityDecision).save.mock.calls.length;
    const eventUpdates = db.repo(UtilitySupplyEvent).update.mock.calls.length;
    const utilityUpdates = db.repo(Utility).update.mock.calls.length;
    expect(eventSaves + decisionSaves).toBeGreaterThan(0);

    await service.reconcile(7);
    expect(db.repo(UtilitySupplyEvent).save.mock.calls.length).toBe(eventSaves);
    expect(db.repo(GrantUtilityDecision).save.mock.calls.length).toBe(decisionSaves);
    expect(db.repo(UtilitySupplyEvent).update.mock.calls.length).toBe(eventUpdates);
    expect(db.repo(Utility).update.mock.calls.length).toBe(utilityUpdates);
  });

  it('utenza senza nessuna riga di storico: non tocca le colonne', async () => {
    const db = fakeDb({ utilities: [utility()] });
    await build(db).reconcile(7);
    expect(db.repo(Utility).update).not.toHaveBeenCalled();
  });

  it('utenza cancellata: nessuna azione', async () => {
    const db = fakeDb({ utilities: [utility({ deleted: true })], events: [activation] });
    await build(db).reconcile(7);
    expect(db.repo(Utility).update).not.toHaveBeenCalled();
  });

  it('reconcileAll conta le utenze cambiate', async () => {
    const db = fakeDb({
      utilities: [utility(), utility({ id: 8, supply_active: false })],
      events: [activation, event({ id: 3, utility_id_fk: 8, type: SupplyEventType.ACTIVATION, date_unknown: true })],
    });
    const result = await build(db).reconcileAll();
    expect(result).toEqual({ processed: 2, changed: 1, failed: 0 });
  });
});

describe('SupplyReconcileService decisioni', () => {
  const base = (o: { parties?: number[]; grant?: Row; decisions?: Row[] } = {}) =>
    fakeDb({
      utilities: [utility()],
      events: [activation],
      grants: [{ id: 10, ...(o.grant ?? {}) }],
      parties: (o.parties ?? [5]).map((p) => ({ utilizer_grant_id: 10, third_party_id: p })),
      covered: [{ grant_id: 10, utility_id: 7 }],
      decisions: o.decisions ?? [],
    });

  it('FOLLOWS con una sola parte salva sempre la parte e crea il TRANSFER', async () => {
    const db = base();
    await build(db).setDecision(10, 7, { decision: GrantUtilityDecisionValue.FOLLOWS }, 42);
    expect(db.decisions[0]).toMatchObject({ decision: 'FOLLOWS', third_party_id_fk: 5, updated_by_user_id: 42 });
    expect(db.events.find((e) => e.type === SupplyEventType.TRANSFER)).toMatchObject({
      third_party_id_fk: 5,
      created_by_user_id: 42,
    });
  });

  it('FOLLOWS con più parti senza parte: 400', async () => {
    const db = base({ parties: [5, 6] });
    await expect(
      build(db).setDecision(10, 7, { decision: GrantUtilityDecisionValue.FOLLOWS }, 42),
    ).rejects.toThrow(new BadRequestException("Indicare a quale parte va volturata l'utenza."));
  });

  it('STAYS aggiorna la riga esistente senza parte', async () => {
    const db = base({
      decisions: [{ id: 50, utilizer_grant_id_fk: 10, utility_id_fk: 7, decision: null, third_party_id_fk: null, create_date: NOW }],
    });
    await build(db).setDecision(10, 7, { decision: GrantUtilityDecisionValue.STAYS, third_party_id: 5 }, 42);
    expect(db.decisions).toHaveLength(1);
    expect(db.decisions[0]).toMatchObject({ id: 50, decision: 'STAYS', third_party_id_fk: null });
  });

  it('contratto non in corso: 400', async () => {
    const db = base({ grant: { status: 'TERMINATED' } });
    await expect(
      build(db).setDecision(10, 7, { decision: GrantUtilityDecisionValue.STAYS }, 42),
    ).rejects.toThrow(new BadRequestException('Il contratto immobiliare non è in corso.'));
    await expect(build(db).applyProposal(10, 42)).rejects.toThrow(
      new BadRequestException('Il contratto immobiliare non è in corso.'),
    );
  });

  it('elenco decisioni: proposta dalla spunta e contratto scavalcato', async () => {
    const db = fakeDb({
      utilities: [utility()],
      events: [activation],
      grants: [
        { id: 10, utilities_to_be_taken_over: 1, start_date: '2025-01-01' },
        { id: 11, start_date: '2026-01-01' },
      ],
      parties: [
        { utilizer_grant_id: 10, third_party_id: 5 },
        { utilizer_grant_id: 11, third_party_id: 6 },
      ],
      covered: [
        { grant_id: 10, utility_id: 7 },
        { grant_id: 11, utility_id: 7 },
      ],
      decisions: [
        { id: 50, utilizer_grant_id_fk: 10, utility_id_fk: 7, decision: 'FOLLOWS', third_party_id_fk: 5, create_date: NOW },
        { id: 51, utilizer_grant_id_fk: 11, utility_id_fk: 7, decision: 'FOLLOWS', third_party_id_fk: 6, create_date: NOW },
      ],
    });
    const service = build(db);
    expect(await service.listDecisions(10)).toEqual([
      { utility_id: 7, decision: 'FOLLOWS', third_party_id: 5, proposal: 'FOLLOWS', overridden: true },
    ]);
    expect(await service.listDecisions(11)).toEqual([
      { utility_id: 7, decision: 'FOLLOWS', third_party_id: 6, proposal: null, overridden: false },
    ]);
  });

  it('apply-proposal: decisioni vuote → FOLLOWS con la parte, poi riconcilia', async () => {
    const db = base({
      grant: { utilities_to_be_taken_over: 1 },
      decisions: [{ id: 50, utilizer_grant_id_fk: 10, utility_id_fk: 7, decision: null, third_party_id_fk: null, create_date: NOW }],
    });
    await build(db).applyProposal(10, 42);
    expect(db.decisions[0]).toMatchObject({ decision: 'FOLLOWS', third_party_id_fk: 5 });
    expect(db.events.some((e) => e.type === SupplyEventType.TRANSFER)).toBe(true);
  });

  it('apply-proposal con più parti: righe saltate', async () => {
    const db = base({
      parties: [5, 6],
      grant: { utilities_to_be_taken_over: 1 },
      decisions: [{ id: 50, utilizer_grant_id_fk: 10, utility_id_fk: 7, decision: null, third_party_id_fk: null, create_date: NOW }],
    });
    await build(db).applyProposal(10, 42);
    expect(db.decisions[0].decision).toBeNull();
  });

  it('utilityIdsOfGrant: utenze coperte e con riga di decisione', async () => {
    const db = fakeDb({
      covered: [{ grant_id: 10, utility_id: 7 }],
      decisions: [{ id: 50, utilizer_grant_id_fk: 10, utility_id_fk: 8, decision: null }],
    });
    expect((await build(db).utilityIdsOfGrant(10)).sort()).toEqual([7, 8]);
  });
});

describe('SupplyReconcileService concorrenza e dati grezzi', () => {
  const followsDb = () =>
    fakeDb({
      utilities: [utility()],
      events: [activation],
      grants: [{ id: 10 }],
      parties: [{ utilizer_grant_id: 10, third_party_id: 5 }],
      covered: [{ grant_id: 10, utility_id: 7 }],
      decisions: [
        { id: 50, utilizer_grant_id_fk: 10, utility_id_fk: 7, decision: 'FOLLOWS', third_party_id_fk: 5, create_date: NOW },
      ],
    });

  it("reconcile blocca la riga dell'utenza prima di ogni lettura", async () => {
    const db = followsDb();
    await build(db).reconcile(7);
    expect(db.calls[0]).toBe('lock:7');
    expect(db.calls.filter((c) => c.startsWith('lock')).length).toBeGreaterThan(0);
  });

  it('setDecision blocca la riga prima di cercare la decisione', async () => {
    const db = fakeDb({
      utilities: [utility()],
      events: [activation],
      grants: [{ id: 10 }],
      parties: [{ utilizer_grant_id: 10, third_party_id: 5 }],
      covered: [{ grant_id: 10, utility_id: 7 }],
    });
    await build(db).setDecision(10, 7, { decision: GrantUtilityDecisionValue.STAYS }, 42);
    expect(db.dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(db.calls[0]).toBe('lock:7');
    expect(db.calls.indexOf('lock:7')).toBeLessThan(db.calls.indexOf('findOne:decision'));
  });

  it("utente di sistema riletto a ogni giro (nessuna cache)", async () => {
    const a = followsDb();
    const service = build(a);
    await service.reconcile(7);
    const b = followsDb();
    (service as unknown as { dataSource: unknown }).dataSource = b.dataSource;
    await service.reconcile(7);
    expect(a.calls.filter((c) => c === 'system_user')).toHaveLength(1);
    expect(b.calls.filter((c) => c === 'system_user')).toHaveLength(1);
  });

  it('dbDay: Date di mysql2 (mezzanotte locale) e stringhe', () => {
    expect(dbDay(new Date(2026, 0, 1))).toBe('2026-01-01');
    expect(dbDay(new Date(2026, 11, 31))).toBe('2026-12-31');
    expect(dbDay('2026-03-05')).toBe('2026-03-05');
    expect(dbDay(null)).toBeNull();
  });

  const grantDates = (o: Row) =>
    fakeDb({
      utilities: [utility()],
      events: [
        activation,
        event({ id: 2, type: SupplyEventType.TRANSFER, third_party_id_fk: 5, utilizer_grant_id_fk: 10 }),
      ],
      grants: [{ id: 10, start_date: new Date(2025, 0, 1), ...o }],
      parties: [{ utilizer_grant_id: 10, third_party_id: 5 }],
      covered: [{ grant_id: 10, utility_id: 7 }],
      decisions: [
        { id: 50, utilizer_grant_id_fk: 10, utility_id_fk: 7, decision: 'FOLLOWS', third_party_id_fk: 5, create_date: NOW },
      ],
    });

  it('contratto con fine (Date grezza) passata: TRANSFER annullato', async () => {
    const db = grantDates({ end_date: new Date(2026, 0, 31), tacit_renewal: 0 });
    await build(db).reconcile(7);
    expect(db.events.find((e) => e.id === 2)?.cancelled_on).toBe(TODAY);
  });

  it('rinnovo tacito (tinyint 1) e fine (Date grezza) passata: contratto in corso, TRANSFER resta', async () => {
    const db = grantDates({ end_date: new Date(2026, 0, 31), tacit_renewal: 1, renewal_months: 12 });
    await build(db).reconcile(7);
    expect(db.events.find((e) => e.id === 2)?.cancelled_on).toBeNull();
    expect(db.repo(Utility).update.mock.calls[0][1]).toMatchObject({ cost_status: 'TO_TRANSFER' });
  });
});

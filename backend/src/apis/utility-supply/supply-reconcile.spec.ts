import {
  ContractDirection,
  ContractStatus,
} from '@apis/utilizer-grant/enum/real-estate-contract.enum';
import { CostStatus } from '@apis/utility/cost-status';
import { GrantUtilityDecisionValue, SupplyEventType } from './enum/supply-event-type.enum';
import { SupplyEventLike, stateAt } from './supply-state';
import {
  DecisionLike,
  GrantLike,
  ReconcilePlan,
  isGrantActive,
  planReconcile,
} from './supply-reconcile';

const TODAY = '2026-10-19';
const T = SupplyEventType;
const D = GrantUtilityDecisionValue;

let seq = 100;
function ev(p: Partial<SupplyEventLike> & { type: SupplyEventType }): SupplyEventLike {
  seq += 1;
  return {
    id: seq,
    third_party_id_fk: null,
    requested_on: null,
    effective_on: null,
    date_unknown: false,
    cancelled_on: null,
    deleted: false,
    utilizer_grant_id_fk: null,
    create_date: '2026-01-01',
    ...p,
  };
}

function grant(p: Partial<GrantLike> & { id: number }): GrantLike {
  return {
    start_date: '2025-01-01',
    end_date: null,
    tacit_renewal: false,
    renewal_months: null,
    notice_months: null,
    status: ContractStatus.ACTIVE,
    direction: ContractDirection.ACTIVE,
    utilities_to_be_taken_over: true,
    party_ids: [10],
    status_changed_on: null,
    covers_utility: true,
    ...p,
  };
}

function dec(p: Partial<DecisionLike> & { grant_id: number }): DecisionLike {
  return {
    decision: D.FOLLOWS,
    third_party_id: null,
    create_date: '2026-01-01',
    ...p,
  };
}

const active = ev({ type: T.ACTIVATION, date_unknown: true });

function plan(p: {
  grants?: GrantLike[];
  decisions?: DecisionLike[];
  events?: SupplyEventLike[];
  utilityActive?: boolean;
}): ReconcilePlan {
  return planReconcile({
    today: TODAY,
    utilityActive: p.utilityActive ?? true,
    grants: p.grants ?? [],
    decisions: p.decisions ?? [],
    events: p.events ?? [active],
  });
}

function expectNoActions(r: ReconcilePlan): void {
  expect(r.createDecisions).toEqual([]);
  expect(r.createEvents).toEqual([]);
  expect(r.cancelEvents).toEqual([]);
}

// Applica il piano come farebbe il servizio (task 4).
function apply(
  p: { grants: GrantLike[]; decisions: DecisionLike[]; events: SupplyEventLike[] },
  r: ReconcilePlan,
): { decisions: DecisionLike[]; events: SupplyEventLike[] } {
  const cancelled = new Set(r.cancelEvents.map((c) => c.id));
  return {
    decisions: [...p.decisions, ...r.createDecisions.map((d) => ({ ...d, create_date: TODAY }))],
    events: [
      ...p.events.map((e) => (cancelled.has(e.id) ? { ...e, cancelled_on: TODAY } : e)),
      ...r.createEvents.map((c) =>
        ev({
          type: c.type === 'TRANSFER' ? T.TRANSFER : T.RETURN,
          third_party_id_fk: c.third_party_id,
          utilizer_grant_id_fk: c.grant_id,
          create_date: TODAY,
        }),
      ),
    ],
  };
}

// Piano + verifica che ripianificare dopo averlo applicato non faccia nulla.
function stable(p: {
  grants?: GrantLike[];
  decisions?: DecisionLike[];
  events?: SupplyEventLike[];
  utilityActive?: boolean;
}): ReconcilePlan {
  const r = plan(p);
  const input = {
    grants: p.grants ?? [],
    decisions: p.decisions ?? [],
    events: p.events ?? [active],
  };
  const next = apply(input, r);
  const again = plan({ ...p, ...next });
  expectNoActions(again);
  expect(again.costStatus).toBe(r.costStatus);
  expect(again.pendingSince).toBe(r.pendingSince);
  return r;
}

describe('supply-reconcile', () => {
  describe('isGrantActive', () => {
    it('end_date passata ma rinnovo tacito di 12 mesi: attivo', () => {
      expect(
        isGrantActive(
          grant({ id: 1, end_date: '2026-01-31', tacit_renewal: true, renewal_months: 12 }),
          TODAY,
        ),
      ).toBe(true);
    });

    it('scaduto senza rinnovo, chiuso o passivo: non attivo', () => {
      expect(isGrantActive(grant({ id: 1, end_date: '2026-01-31' }), TODAY)).toBe(false);
      expect(isGrantActive(grant({ id: 1, status: ContractStatus.TERMINATED }), TODAY)).toBe(false);
      expect(isGrantActive(grant({ id: 1, direction: ContractDirection.PASSIVE }), TODAY)).toBe(
        false,
      );
      expect(isGrantActive(grant({ id: 1, end_date: TODAY }), TODAY)).toBe(true);
    });
  });

  it('contratto nuovo: decisione vuota e da decidere', () => {
    const r = stable({ grants: [grant({ id: 1, start_date: '2026-10-01' })] });
    expect(r.createDecisions).toEqual([{ grant_id: 1, decision: null, third_party_id: null }]);
    expect(r.createEvents).toEqual([]);
    expect(r.cancelEvents).toEqual([]);
    expect(r.costStatus).toBe(CostStatus.TO_DECIDE);
  });

  it('FOLLOWS con una parte: voltura in sospeso verso la parte', () => {
    const r = stable({ grants: [grant({ id: 1 })], decisions: [dec({ grant_id: 1 })] });
    expect(r.createDecisions).toEqual([]);
    expect(r.createEvents).toEqual([{ type: 'TRANSFER', third_party_id: 10, grant_id: 1 }]);
    expect(r.cancelEvents).toEqual([]);
    expect(r.costStatus).toBe(CostStatus.TO_TRANSFER);
    expect(r.pendingSince).toBe(TODAY);
  });

  it('rinnovo con la stessa parte: copia FOLLOWS, nessun evento', () => {
    const r = stable({
      grants: [
        grant({ id: 1, start_date: '2020-01-01', status: ContractStatus.RETURNED }),
        grant({ id: 2, start_date: '2026-09-01' }),
      ],
      decisions: [dec({ grant_id: 1 })],
      events: [
        active,
        ev({
          type: T.TRANSFER,
          third_party_id_fk: 10,
          effective_on: '2020-02-01',
          utilizer_grant_id_fk: 1,
        }),
      ],
    });
    expect(r.createDecisions).toEqual([{ grant_id: 2, decision: D.FOLLOWS, third_party_id: 10 }]);
    expect(r.createEvents).toEqual([]);
    expect(r.cancelEvents).toEqual([]);
    expect(r.costStatus).toBe(CostStatus.TRANSFERRED);
    expect(r.pendingSince).toBeNull();
  });

  it('controparte diversa: da decidere, poi voltura diretta alla nuova', () => {
    const events = [
      active,
      ev({
        type: T.TRANSFER,
        third_party_id_fk: 10,
        effective_on: '2020-02-01',
        utilizer_grant_id_fk: 1,
      }),
    ];
    const grants = [
      grant({ id: 1, start_date: '2020-01-01', status: ContractStatus.RETURNED }),
      grant({ id: 2, start_date: '2026-09-01', party_ids: [20] }),
    ];
    const undecided = stable({ grants, decisions: [dec({ grant_id: 1 })], events });
    expect(undecided.createDecisions).toEqual([
      { grant_id: 2, decision: null, third_party_id: null },
    ]);
    // c'è un contratto nuovo che la riguarda: nessun RETURN
    expect(undecided.createEvents).toEqual([]);
    expect(undecided.costStatus).toBe(CostStatus.TO_DECIDE);

    const r = stable({ grants, decisions: [dec({ grant_id: 1 }), dec({ grant_id: 2 })], events });
    expect(r.createEvents).toEqual([{ type: 'TRANSFER', third_party_id: 20, grant_id: 2 }]);
    expect(r.costStatus).toBe(CostStatus.TO_TRANSFER);
    // fino alla data effettiva resta intestata alla vecchia parte
    expect(stateAt(events, TODAY).holderId).toBe(10);
  });

  it('fine contratto con utenza volturata: reintestazione in sospeso', () => {
    const grants = [grant({ id: 1, end_date: '2026-06-30' })];
    const transfer = ev({
      type: T.TRANSFER,
      third_party_id_fk: 10,
      effective_on: '2025-02-01',
      utilizer_grant_id_fk: 1,
    });
    const r = stable({ grants, decisions: [dec({ grant_id: 1 })], events: [active, transfer] });
    expect(r.createEvents).toEqual([{ type: 'RETURN', third_party_id: null, grant_id: 1 }]);
    expect(r.cancelEvents).toEqual([]);
    expect(r.costStatus).toBe(CostStatus.TO_RECOVER);
    expect(r.pendingSince).toBe(TODAY);

    // RETURN già creato: nessuna azione, data evento = fine contratto (non prima della riga)
    const ret = ev({ type: T.RETURN, utilizer_grant_id_fk: 1, create_date: '2026-06-15' });
    const again = stable({
      grants,
      decisions: [dec({ grant_id: 1 })],
      events: [active, transfer, ret],
    });
    expectNoActions(again);
    expect(again.costStatus).toBe(CostStatus.TO_RECOVER);
    expect(again.pendingSince).toBe('2026-06-30');
  });

  it('contratto chiuso con voltura in sospeso: voltura annullata con motivo', () => {
    const pendingTransfer = ev({
      type: T.TRANSFER,
      third_party_id_fk: 10,
      utilizer_grant_id_fk: 1,
    });
    const r = stable({
      grants: [
        grant({ id: 1, status: ContractStatus.TERMINATED, status_changed_on: '2026-10-10' }),
      ],
      decisions: [dec({ grant_id: 1 })],
      events: [active, pendingTransfer],
    });
    expect(r.createEvents).toEqual([]);
    expect(r.cancelEvents).toEqual([
      { id: pendingTransfer.id, reason: 'Contratto immobiliare non più attivo' },
    ]);
    expect(r.costStatus).toBe(CostStatus.COMUNE);
    expect(r.pendingSince).toBeNull();
  });

  it('decisione STAYS con voltura in sospeso: voltura annullata con motivo', () => {
    const pendingTransfer = ev({
      type: T.TRANSFER,
      third_party_id_fk: 10,
      utilizer_grant_id_fk: 1,
    });
    const r = stable({
      grants: [grant({ id: 1 })],
      decisions: [dec({ grant_id: 1, decision: D.STAYS })],
      events: [active, pendingTransfer],
    });
    expect(r.cancelEvents).toEqual([
      { id: pendingTransfer.id, reason: 'Decisione: resta al Comune' },
    ]);
    expect(r.costStatus).toBe(CostStatus.COMUNE);
  });

  it('da FOLLOWS a STAYS su utenza già volturata: reintestazione in sospeso', () => {
    const r = stable({
      grants: [grant({ id: 1 })],
      decisions: [dec({ grant_id: 1, decision: D.STAYS })],
      events: [
        active,
        ev({
          type: T.TRANSFER,
          third_party_id_fk: 10,
          effective_on: '2025-02-01',
          utilizer_grant_id_fk: 1,
        }),
      ],
    });
    expect(r.createEvents).toEqual([{ type: 'RETURN', third_party_id: null, grant_id: 1 }]);
    expect(r.costStatus).toBe(CostStatus.TO_RECOVER);
  });

  it('due contratti FOLLOWS: vince la data di inizio più recente', () => {
    const oldTransfer = ev({ type: T.TRANSFER, third_party_id_fk: 10, utilizer_grant_id_fk: 1 });
    const r = stable({
      grants: [
        grant({ id: 1, start_date: '2024-01-01', party_ids: [10] }),
        grant({ id: 2, start_date: '2026-03-01', party_ids: [20] }),
      ],
      decisions: [dec({ grant_id: 1 }), dec({ grant_id: 2 })],
      events: [active, oldTransfer],
    });
    expect(r.createEvents).toEqual([{ type: 'TRANSFER', third_party_id: 20, grant_id: 2 }]);
    expect(r.cancelEvents.map((c) => c.id)).toEqual([oldTransfer.id]);
    expect(r.overriddenGrantIds).toEqual([1]);
    expect(r.costStatus).toBe(CostStatus.TO_TRANSFER);
  });

  it('FOLLOWS con più parti senza scelta: nessuna voltura, resta da decidere', () => {
    const r = stable({
      grants: [grant({ id: 1, party_ids: [10, 20] })],
      decisions: [dec({ grant_id: 1 })],
    });
    expect(r.createEvents).toEqual([]);
    expect(r.costStatus).toBe(CostStatus.TO_DECIDE);

    const chosen = stable({
      grants: [grant({ id: 1, party_ids: [10, 20] })],
      decisions: [dec({ grant_id: 1, third_party_id: 20 })],
    });
    expect(chosen.createEvents).toEqual([{ type: 'TRANSFER', third_party_id: 20, grant_id: 1 }]);
  });

  it('utenza cessata: nessuna decisione né evento, annullati gli automatici', () => {
    const autoTransfer = ev({ type: T.TRANSFER, third_party_id_fk: 10, utilizer_grant_id_fk: 1 });
    const manualActivation = ev({ type: T.ACTIVATION, requested_on: '2026-09-01' });
    const r = stable({
      utilityActive: false,
      grants: [grant({ id: 1 }), grant({ id: 2, party_ids: [30] })],
      decisions: [dec({ grant_id: 1 })],
      events: [autoTransfer, manualActivation],
    });
    expect(r.createDecisions).toEqual([]);
    expect(r.createEvents).toEqual([]);
    expect(r.cancelEvents.map((c) => c.id)).toEqual([autoTransfer.id]);
    expect(r.costStatus).toBe(CostStatus.COMUNE);
    // attivazioni/cessazioni in sospeso hanno segnalazioni proprie
    expect(r.pendingSince).toBeNull();
  });

  it('cambiamenti in sospeso manuali mai toccati', () => {
    const manual = ev({
      type: T.TRANSFER,
      third_party_id_fk: 30,
      requested_on: '2026-03-01',
      create_date: '2026-02-01',
    });
    const r = stable({
      grants: [grant({ id: 1, status: ContractStatus.TERMINATED })],
      decisions: [dec({ grant_id: 1 })],
      events: [active, manual],
    });
    expectNoActions(r);
    expect(r.costStatus).toBe(CostStatus.TO_TRANSFER);
    expect(r.pendingSince).toBe('2026-03-01');
  });

  it('piano su stato già allineato: nessuna azione', () => {
    const grants = [grant({ id: 1 })];
    const decisions = [dec({ grant_id: 1 })];
    const pendingTransfer = ev({
      type: T.TRANSFER,
      third_party_id_fk: 10,
      utilizer_grant_id_fk: 1,
    });
    const first = stable({ grants, decisions, events: [active, pendingTransfer] });
    expectNoActions(first);
    expect(first.costStatus).toBe(CostStatus.TO_TRANSFER);

    const done = stable({
      grants,
      decisions,
      events: [
        active,
        ev({
          type: T.TRANSFER,
          third_party_id_fk: 10,
          effective_on: '2025-02-01',
          utilizer_grant_id_fk: 1,
        }),
      ],
    });
    expectNoActions(done);
    expect(done.costStatus).toBe(CostStatus.TRANSFERRED);

    const undecided = stable({ grants, decisions: [dec({ grant_id: 1, decision: null })] });
    expectNoActions(undecided);
    expect(undecided.costStatus).toBe(CostStatus.TO_DECIDE);

    const none = stable({});
    expectNoActions(none);
    expect(none.costStatus).toBe(CostStatus.COMUNE);
    expect(none.overriddenGrantIds).toEqual([]);
  });

  it('pendingSince di una decisione creata oggi su contratto del 2019 = oggi', () => {
    const grants = [grant({ id: 1, start_date: '2019-05-01' })];
    expect(stable({ grants }).pendingSince).toBe(TODAY);
    const existing = stable({
      grants,
      decisions: [dec({ grant_id: 1, decision: null, create_date: '2026-01-10 08:00:00' })],
    });
    expect(existing.pendingSince).toBe('2026-01-10');
  });

  it('rinnovo di un FOLLOWS con voltura in sospeso: decisione copiata, voltura tenuta', () => {
    const pendingTransfer = ev({
      type: T.TRANSFER,
      third_party_id_fk: 10,
      utilizer_grant_id_fk: 1,
      create_date: '2026-02-01',
    });
    const r = stable({
      grants: [
        grant({ id: 1, start_date: '2025-01-01', status: ContractStatus.RETURNED }),
        grant({ id: 2, start_date: '2026-09-01', party_ids: [10, 20] }),
      ],
      decisions: [dec({ grant_id: 1 })],
      events: [active, pendingTransfer],
    });
    expect(r.createDecisions).toEqual([{ grant_id: 2, decision: D.FOLLOWS, third_party_id: 10 }]);
    expect(r.createEvents).toEqual([]);
    expect(r.cancelEvents).toEqual([]);
    expect(r.costStatus).toBe(CostStatus.TO_TRANSFER);
    expect(r.pendingSince).toBe('2026-02-01');
  });

  it('rinnovo di un STAYS: decisione STAYS copiata, a carico del Comune', () => {
    const r = stable({
      grants: [
        grant({ id: 1, start_date: '2025-01-01', status: ContractStatus.RETURNED }),
        grant({ id: 2, start_date: '2026-09-01' }),
      ],
      decisions: [dec({ grant_id: 1, decision: D.STAYS })],
    });
    expect(r.createDecisions).toEqual([{ grant_id: 2, decision: D.STAYS, third_party_id: null }]);
    expect(r.createEvents).toEqual([]);
    expect(r.costStatus).toBe(CostStatus.COMUNE);
    expect(r.pendingSince).toBeNull();
  });

  it('parte scelta tolta dal contratto FOLLOWS in corso: nessuna azione', () => {
    const grants = [grant({ id: 1, party_ids: [20] })];
    const decisions = [dec({ grant_id: 1, third_party_id: 10 })];
    const r = stable({
      grants,
      decisions,
      events: [
        active,
        ev({
          type: T.TRANSFER,
          third_party_id_fk: 10,
          effective_on: '2025-02-01',
          utilizer_grant_id_fk: 1,
        }),
      ],
    });
    expectNoActions(r);
    expect(r.costStatus).toBe(CostStatus.TRANSFERRED);

    // anche con un contratto finito della stessa parte: l'intestazione resta
    const withOld = stable({
      grants: [
        ...grants,
        grant({ id: 2, start_date: '2020-01-01', status: ContractStatus.RETURNED }),
      ],
      decisions,
      events: [
        active,
        ev({
          type: T.TRANSFER,
          third_party_id_fk: 10,
          effective_on: '2025-02-01',
          utilizer_grant_id_fk: 1,
        }),
      ],
    });
    expectNoActions(withOld);

    // voltura in sospeso verso la parte tolta: non annullata
    const pendingTransfer = ev({
      type: T.TRANSFER,
      third_party_id_fk: 10,
      utilizer_grant_id_fk: 1,
    });
    const p = stable({ grants, decisions, events: [active, pendingTransfer] });
    expectNoActions(p);
    expect(p.costStatus).toBe(CostStatus.TO_TRANSFER);
  });

  it('voltura manuale a un soggetto estraneo ai contratti: nessuna reintestazione', () => {
    const r = stable({
      grants: [grant({ id: 1, status: ContractStatus.TERMINATED })],
      decisions: [dec({ grant_id: 1 })],
      events: [active, ev({ type: T.TRANSFER, third_party_id_fk: 30, effective_on: '2025-02-01' })],
    });
    expectNoActions(r);
    expect(r.costStatus).toBe(CostStatus.TRANSFERRED);
  });

  it("contratto che non riguarda più l'utenza: vale come finito", () => {
    const uncovered = grant({ id: 1, covers_utility: false });
    const r = stable({
      grants: [uncovered, grant({ id: 2, covers_utility: false, party_ids: [30] })],
      decisions: [dec({ grant_id: 1 })],
      events: [
        active,
        ev({
          type: T.TRANSFER,
          third_party_id_fk: 10,
          effective_on: '2025-02-01',
          utilizer_grant_id_fk: 1,
        }),
      ],
    });
    expect(r.createDecisions).toEqual([]);
    expect(r.createEvents).toEqual([{ type: 'RETURN', third_party_id: null, grant_id: 1 }]);
    expect(r.costStatus).toBe(CostStatus.TO_RECOVER);

    const pendingTransfer = ev({
      type: T.TRANSFER,
      third_party_id_fk: 10,
      utilizer_grant_id_fk: 1,
    });
    const p = stable({
      grants: [uncovered],
      decisions: [dec({ grant_id: 1 })],
      events: [active, pendingTransfer],
    });
    expect(p.cancelEvents).toEqual([
      { id: pendingTransfer.id, reason: 'Utenza non più collegata al contratto immobiliare' },
    ]);
    expect(p.costStatus).toBe(CostStatus.COMUNE);
  });
});

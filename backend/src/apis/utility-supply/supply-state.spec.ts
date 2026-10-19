import { SupplyEventType } from './enum/supply-event-type.enum';
import {
  SupplyEventLike,
  activeIntervals,
  currentSnapshot,
  pending,
  sequenceWarnings,
  stateAt,
  validateEvent,
} from './supply-state';

let seq = 0;
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
const T = SupplyEventType;

describe('supply-state', () => {
  describe('stateAt', () => {
    it('riga date_unknown vale prima di ogni data', () => {
      const e = [ev({ type: T.ACTIVATION, date_unknown: true })];
      expect(stateAt(e, '1990-01-01').active).toBe(true);
    });

    it('nessuna riga effettiva o solo in sospeso: non attiva', () => {
      expect(stateAt([], '2026-01-01').active).toBe(false);
      const e = [ev({ type: T.ACTIVATION, requested_on: '2025-01-01' })];
      expect(stateAt(e, '2026-01-01').active).toBe(false);
    });

    it('ordina per effective_on, non per id', () => {
      const e = [
        ev({ id: 1, type: T.CESSATION, effective_on: '2025-07-07' }),
        ev({ id: 2, type: T.ACTIVATION, effective_on: '2025-01-01' }),
      ];
      expect(stateAt(e, '2025-03-01').active).toBe(true);
      expect(stateAt(e, '2025-08-01').active).toBe(false);
    });

    it('intestatario: voltura e ritorno al Comune', () => {
      const e = [
        ev({ type: T.TRANSFER, third_party_id_fk: 5, effective_on: '2024-01-10' }),
        ev({ type: T.RETURN, effective_on: '2025-02-01' }),
      ];
      expect(stateAt(e, '2024-06-01').holderId).toBe(5);
      expect(stateAt(e, '2025-03-01').holderId).toBeNull();
    });

    it('ignora righe annullate o cancellate', () => {
      const e = [
        ev({ type: T.ACTIVATION, effective_on: '2025-01-01', cancelled_on: '2025-02-01' }),
        ev({ type: T.ACTIVATION, effective_on: '2025-01-01', deleted: true }),
      ];
      expect(stateAt(e, '2026-01-01').active).toBe(false);
    });
  });

  describe('currentSnapshot', () => {
    it('date dell ultimo ACTIVATION/CESSATION, null se date_unknown', () => {
      const e = [
        ev({ type: T.ACTIVATION, effective_on: '2024-01-01' }),
        ev({ type: T.CESSATION, effective_on: '2025-07-07' }),
        ev({ type: T.ACTIVATION, effective_on: '2026-01-10' }),
      ];
      expect(currentSnapshot(e, '2026-06-01')).toEqual({
        supply_active: true,
        activated_on: '2026-01-10',
        ceased_on: '2025-07-07',
        transferred_to_third_party_id: null,
        transferred_on: null,
      });
      const u = [ev({ type: T.ACTIVATION, date_unknown: true })];
      const s = currentSnapshot(u, '2026-06-01');
      expect(s.supply_active).toBe(true);
      expect(s.activated_on).toBeNull();
    });

    it('voltura corrente', () => {
      const e = [ev({ type: T.TRANSFER, third_party_id_fk: 5, effective_on: '2024-01-10' })];
      const s = currentSnapshot(e, '2026-06-01');
      expect(s.transferred_to_third_party_id).toBe(5);
      expect(s.transferred_on).toBe('2024-01-10');
    });
  });

  it('activeIntervals', () => {
    const e = [
      ev({ type: T.ACTIVATION, date_unknown: true }),
      ev({ type: T.CESSATION, effective_on: '2025-07-07' }),
      ev({ type: T.ACTIVATION, effective_on: '2026-01-10' }),
    ];
    expect(activeIntervals(e)).toEqual([
      { start: null, end: '2025-07-07' },
      { start: '2026-01-10', end: null },
    ]);
  });

  it('pending', () => {
    const p = ev({ type: T.CESSATION, requested_on: '2026-01-01' });
    const e = [
      p,
      ev({ type: T.CESSATION, effective_on: '2026-01-01' }),
      ev({ type: T.CESSATION, requested_on: '2026-01-01', cancelled_on: '2026-02-01' }),
      ev({ type: T.CESSATION, requested_on: '2026-01-01', deleted: true }),
    ];
    expect(pending(e)).toEqual([p]);
  });

  describe('validateEvent', () => {
    const today = '2026-06-01';
    it('secondo pending dello stesso tipo', () => {
      const others = [ev({ type: T.CESSATION, requested_on: '2026-05-01' })];
      const c = ev({ id: 0, type: T.CESSATION, requested_on: '2026-05-10' });
      expect(validateEvent(c, others, today)).toBe("C'è già una richiesta in sospeso di questo tipo.");
    });
    it('voltura verso l intestatario attuale', () => {
      const others = [ev({ type: T.TRANSFER, third_party_id_fk: 5, effective_on: '2024-01-10' })];
      const c = ev({ id: 0, type: T.TRANSFER, third_party_id_fk: 5, effective_on: '2025-01-10' });
      expect(validateEvent(c, others, today)).toBe("L'utenza è già intestata a questo soggetto.");
    });
    it('ritorno con intestatario Comune', () => {
      const c = ev({ id: 0, type: T.RETURN, effective_on: '2025-01-10' });
      expect(validateEvent(c, [], today)).toBe("L'utenza è già intestata al Comune.");
    });
    it('data effettiva nel futuro', () => {
      const c = ev({ id: 0, type: T.ACTIVATION, effective_on: '2026-06-02' });
      expect(validateEvent(c, [], today)).toBe('La data effettiva non può essere nel futuro.');
    });
    it('data effettiva prima della richiesta', () => {
      const c = ev({ id: 0, type: T.ACTIVATION, requested_on: '2026-03-01', effective_on: '2026-02-01' });
      expect(validateEvent(c, [], today)).toBe('La data effettiva non può precedere la richiesta.');
    });
    it('voltura senza soggetto', () => {
      const c = ev({ id: 0, type: T.TRANSFER, effective_on: '2026-02-01' });
      expect(validateEvent(c, [], today)).toBe("Indicare a chi va volturata l'utenza.");
    });
    it('due attivazioni di fila: accettato con avviso', () => {
      const others = [ev({ type: T.ACTIVATION, effective_on: '2025-01-01' })];
      const c = ev({ id: 0, type: T.ACTIVATION, effective_on: '2026-01-01' });
      expect(validateEvent(c, others, today)).toBeNull();
      expect(sequenceWarnings([...others, c])).toContain('Due attivazioni di fila: manca una cessazione?');
    });
  });

  describe('sequenceWarnings', () => {
    it('due cessazioni di fila', () => {
      const e = [
        ev({ type: T.CESSATION, effective_on: '2025-01-01' }),
        ev({ type: T.CESSATION, effective_on: '2026-01-01' }),
      ];
      expect(sequenceWarnings(e)).toContain("Due cessazioni di fila: manca un'attivazione?");
    });
    it('voltura su utenza cessata', () => {
      const e = [
        ev({ type: T.ACTIVATION, effective_on: '2024-01-01' }),
        ev({ type: T.CESSATION, effective_on: '2025-01-01' }),
        ev({ type: T.TRANSFER, third_party_id_fk: 5, effective_on: '2025-06-01' }),
      ];
      expect(sequenceWarnings(e)).toEqual(["Voltura registrata su un'utenza cessata."]);
    });
    it('storia coerente: nessun avviso', () => {
      const e = [
        ev({ type: T.ACTIVATION, effective_on: '2024-01-01' }),
        ev({ type: T.CESSATION, effective_on: '2025-01-01' }),
      ];
      expect(sequenceWarnings(e)).toEqual([]);
    });
  });
});

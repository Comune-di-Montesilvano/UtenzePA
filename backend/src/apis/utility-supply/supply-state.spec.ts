import { SupplyEventType } from './enum/supply-event-type.enum';
import {
  SupplyEventLike,
  activeIntervals,
  currentSnapshot,
  holderIntervals,
  inChargeIntervals,
  subtractIntervals,
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
    describe('data non nota con righe già datate', () => {
      const msg =
        "L'utenza ha già date note: indica una data effettiva, anche stimata, e scrivilo nelle note.";
      const dated = [ev({ type: T.ACTIVATION, effective_on: '2025-01-01' })];

      it('cessazione o attivazione a data non nota: 400', () => {
        expect(validateEvent(ev({ id: 0, type: T.CESSATION, date_unknown: true }), dated, today)).toBe(msg);
        expect(validateEvent(ev({ id: 0, type: T.ACTIVATION, date_unknown: true }), dated, today)).toBe(msg);
      });

      it('conta anche una voltura datata; non contano righe annullate, eliminate, in sospeso o a data non nota', () => {
        const c = ev({ id: 0, type: T.CESSATION, date_unknown: true });
        expect(
          validateEvent(c, [ev({ type: T.TRANSFER, third_party_id_fk: 5, effective_on: '2025-01-01' })], today),
        ).toBe(msg);
        const ignored = [
          ev({ type: T.ACTIVATION, date_unknown: true }),
          ev({ type: T.CESSATION, effective_on: '2025-01-01', cancelled_on: '2025-02-01' }),
          ev({ type: T.CESSATION, effective_on: '2025-01-01', deleted: true }),
          ev({ type: T.TRANSFER, third_party_id_fk: 5, requested_on: '2025-01-01' }),
        ];
        expect(validateEvent(c, ignored, today)).toBeNull();
      });

      it('una riga già a data non nota dello stesso tipo resta modificabile', () => {
        const before = ev({ id: 0, type: T.ACTIVATION, date_unknown: true });
        const edited = { ...before, notes: 'x' } as SupplyEventLike;
        expect(validateEvent(edited, dated, today, before)).toBeNull();
        // Cambio di tipo o da datata a non nota: vale la regola.
        expect(validateEvent({ ...before, type: T.CESSATION }, dated, today, before)).toBe(msg);
        const wasDated = ev({ id: 0, type: T.ACTIVATION, effective_on: '2024-01-01' });
        expect(
          validateEvent({ ...wasDated, effective_on: null, date_unknown: true }, dated, today, wasDated),
        ).toBe(msg);
      });

      it('voltura a data non nota senza volture datate: ammessa anche con attivazioni datate', () => {
        expect(
          validateEvent(ev({ id: 0, type: T.TRANSFER, third_party_id_fk: 5, date_unknown: true }), dated, today),
        ).toBeNull();
      });

      describe('volture già datate', () => {
        const vmsg =
          "L'utenza ha già volture con date note: indica una data effettiva, anche stimata, e scrivilo nelle note.";
        const transfer = ev({ type: T.TRANSFER, third_party_id_fk: 5, effective_on: '2025-02-01' });

        it('voltura datata poi reintestazione a data non nota: 400', () => {
          expect(validateEvent(ev({ id: 0, type: T.RETURN, date_unknown: true }), [...dated, transfer], today)).toBe(vmsg);
        });

        it('voltura e reintestazione datate poi voltura a data non nota: 400', () => {
          const others = [...dated, transfer, ev({ type: T.RETURN, effective_on: '2025-06-01' })];
          expect(
            validateEvent(ev({ id: 0, type: T.TRANSFER, third_party_id_fk: 6, date_unknown: true }), others, today),
          ).toBe(vmsg);
        });

        it('volture in sospeso o annullate non contano; riga già a data non nota resta modificabile', () => {
          const others = [
            ...dated,
            ev({ type: T.TRANSFER, third_party_id_fk: 5, requested_on: '2025-02-01' }),
            ev({ type: T.TRANSFER, third_party_id_fk: 6, effective_on: '2025-02-01', cancelled_on: '2025-03-01' }),
          ];
          expect(
            validateEvent(ev({ id: 0, type: T.TRANSFER, third_party_id_fk: 7, date_unknown: true }), others, today),
          ).toBeNull();
          const before = ev({ id: 0, type: T.TRANSFER, third_party_id_fk: 5, date_unknown: true });
          const rest = [...dated, ev({ type: T.RETURN, effective_on: '2025-06-01' })];
          expect(validateEvent({ ...before, notes: 'x' } as SupplyEventLike, rest, today, before)).toBeNull();
        });
      });
    });

    it('due attivazioni di fila: accettato con avviso', () => {
      const others = [ev({ type: T.ACTIVATION, effective_on: '2025-01-01' })];
      const c = ev({ id: 0, type: T.ACTIVATION, effective_on: '2026-01-01' });
      expect(validateEvent(c, others, today)).toBeNull();
      expect(sequenceWarnings([...others, c])).toContain('Due attivazioni di fila: manca una cessazione?');
    });
  });

  describe('periodi in carico al Comune', () => {
    const history = () => [
      ev({ type: T.ACTIVATION, effective_on: '2020-01-01' }),
      ev({ type: T.TRANSFER, third_party_id_fk: 5, effective_on: '2023-03-01' }),
      ev({ type: T.TRANSFER, third_party_id_fk: 6, effective_on: '2023-09-01' }),
      ev({ type: T.RETURN, effective_on: '2024-02-01' }),
      ev({ type: T.TRANSFER, third_party_id_fk: 7, effective_on: '2025-05-01' }),
    ];

    it('holderIntervals: dalla voltura alla reintestazione, voltura diretta senza interruzioni', () => {
      expect(holderIntervals(history())).toEqual([
        { start: '2023-03-01', end: '2024-02-01' },
        { start: '2025-05-01', end: null },
      ]);
    });

    it('holderIntervals: voltura «data non nota» = da prima; righe in sospeso ignorate', () => {
      const e = [
        ev({ type: T.TRANSFER, third_party_id_fk: 5, date_unknown: true }),
        ev({ type: T.RETURN, effective_on: '2024-02-01' }),
        ev({ type: T.TRANSFER, third_party_id_fk: 5 }),
      ];
      expect(holderIntervals(e)).toEqual([{ start: null, end: '2024-02-01' }]);
    });

    it('subtractIntervals: spezza, taglia e rispetta i limiti aperti', () => {
      expect(
        subtractIntervals([{ start: null, end: null }], [{ start: '2023-01-01', end: '2023-06-01' }]),
      ).toEqual([
        { start: null, end: '2023-01-01' },
        { start: '2023-06-01', end: null },
      ]);
      expect(
        subtractIntervals([{ start: '2023-02-01', end: '2023-03-01' }], [{ start: '2023-01-01', end: null }]),
      ).toEqual([]);
      expect(
        subtractIntervals([{ start: '2023-02-01', end: '2023-03-01' }], [{ start: '2023-03-01', end: null }]),
      ).toEqual([{ start: '2023-02-01', end: '2023-03-01' }]);
    });

    it('inChargeIntervals: attiva meno i periodi di voltura', () => {
      expect(inChargeIntervals(history())).toEqual([
        { start: '2020-01-01', end: '2023-03-01' },
        { start: '2024-02-01', end: '2025-05-01' },
      ]);
      expect(activeIntervals(history())).toEqual([{ start: '2020-01-01', end: null }]);
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

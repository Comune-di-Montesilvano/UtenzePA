import { InvoiceLine } from '@apis/invoices/entity/invoice-line.entity';
import { UtilityConsumption } from '@apis/utility-consumptions/entity/utility-consumption.entity';
import {
  ConsumptionKind,
  ConsumptionSource,
} from '@apis/utility-consumptions/enum/consumption-kind.enum';
import { ConsumptionLinker } from './consumption-linker.service';
import { ImportIssueType } from './enum/import-issue-type.enum';

type Handler = (params: unknown[]) => unknown[];

const line = (id: number, over: Partial<InvoiceLine> = {}) =>
  ({
    id,
    invoice_id_fk: 500,
    utility_id_fk: 812,
    period_start: '2026-06-01',
    period_end: '2026-06-30',
    consumption: 100,
    consumption_id_fk: null,
    ...over,
  }) as InvoiceLine;

function fakeManager(lines: InvoiceLine[], handlers: Record<string, Handler> = {}) {
  return {
    find: jest.fn(async () => lines),
    query: jest.fn(async (sql: string, params: unknown[]) => {
      const marker = /\/\* (c_\w+) \*\//.exec(sql)?.[1] ?? '';
      return handlers[marker]?.(params) ?? [];
    }),
    save: jest.fn(async (_e: unknown, data: object) => ({ id: 900, ...data })),
    update: jest.fn(),
  };
}

describe('ConsumptionLinker.link', () => {
  const linker = new ConsumptionLinker();

  it('due righe stessa utenza e periodo: una rilevazione col consumo sommato', async () => {
    const manager = fakeManager([line(1, { consumption: 100 }), line(2, { consumption: 42.5 })]);
    const result = await linker.link(manager as never, 500, 7, []);
    expect(manager.save).toHaveBeenCalledWith(
      UtilityConsumption,
      expect.objectContaining({
        utility_id_fk: 812,
        kind: ConsumptionKind.PERIOD,
        source: ConsumptionSource.INVOICE,
        period_start: '2026-06-01',
        period_end: '2026-06-30',
        consumption: 142.5,
        is_estimated: false,
        created_by_user_id: 7,
      }),
    );
    expect(manager.update).toHaveBeenCalledWith(
      InvoiceLine,
      { id: expect.anything() },
      { consumption_id_fk: 900 },
    );
    expect(result).toEqual({ issues: [], utilityIds: [812] });
  });

  it('rilevazione da fattura scollegata sullo stesso periodo: adottata, nessun doppione', async () => {
    const manager = fakeManager([line(1)], { c_adopt: () => [{ id: 55 }] });
    await linker.link(manager as never, 500, 7, []);
    expect(manager.save).not.toHaveBeenCalled();
    expect(manager.update).toHaveBeenCalledWith(
      UtilityConsumption,
      55,
      expect.objectContaining({ consumption: 100 }),
    );
    expect(manager.update).toHaveBeenCalledWith(
      InvoiceLine,
      { id: expect.anything() },
      { consumption_id_fk: 55 },
    );
  });

  it('periodo già coperto da un’altra rilevazione: nessuna creazione e segnalazione', async () => {
    const manager = fakeManager([line(1)], {
      c_overlap: () => [{ id: 31, period_start: '2026-05-15', period_end: '2026-06-15' }],
    });
    const result = await linker.link(manager as never, 500, 7, []);
    expect(manager.save).not.toHaveBeenCalled();
    expect(result.issues).toEqual([
      expect.objectContaining({ type: ImportIssueType.PERIOD_COVERED, lineIndex: 0 }),
    ]);
  });

  it('rielaborazione con periodi sovrapposti nella stessa fattura: la rilevazione riusata copre ancora', async () => {
    // Primo giro: X (1-31/03) creata, il conguaglio 01-28/02 coperto da X.
    const lines = [
      line(1, { period_start: '2026-01-01', period_end: '2026-03-31' }),
      line(2, { period_start: '2026-02-01', period_end: '2026-02-28', consumption: 5 }),
    ];
    const manager = fakeManager(lines, {
      c_owned: () => [
        { id: 70, utility_id_fk: 812, period_start: '2026-01-01', period_end: '2026-03-31' },
      ],
      c_overlap: (params) =>
        (params[3] as number[]).includes(70)
          ? []
          : [{ id: 70, period_start: '2026-01-01', period_end: '2026-03-31' }],
    });
    const result = await linker.link(manager as never, 500, 7, [70]);
    expect(manager.save).not.toHaveBeenCalled();
    expect(result.issues).toEqual([
      expect.objectContaining({ type: ImportIssueType.PERIOD_COVERED, lineIndex: 1 }),
    ]);
  });

  it('consumo stimato dal fornitore: rilevazione nuova stimata, adottata accesa a stimata', async () => {
    const created = fakeManager([line(1)]);
    await linker.link(created as never, 500, 7, [], new Map(), new Set([812]));
    expect(created.save).toHaveBeenCalledWith(
      UtilityConsumption,
      expect.objectContaining({ is_estimated: true }),
    );
    const adopted = fakeManager([line(1)], { c_adopt: () => [{ id: 55 }] });
    await linker.link(adopted as never, 500, 7, [], new Map(), new Set([812]));
    const update = adopted.update.mock.calls.find(
      (c: unknown[]) => c[0] === UtilityConsumption && c[1] === 55,
    );
    expect(update?.[2]).toEqual(expect.objectContaining({ is_estimated: true }));
  });

  it('consumo per fasce: la rilevazione nuova o adottata prende le fasce della fattura', async () => {
    const bands = new Map([[812, { consumption_f1: 60, consumption_f2: 25, consumption_f3: 38 }]]);
    const created = fakeManager([line(1)]);
    await linker.link(created as never, 500, 7, [], new Map(), new Set(), bands);
    expect(created.save).toHaveBeenCalledWith(
      UtilityConsumption,
      expect.objectContaining({ consumption_f1: 60, consumption_f2: 25, consumption_f3: 38 }),
    );
    const adopted = fakeManager([line(1)], { c_adopt: () => [{ id: 55 }] });
    await linker.link(adopted as never, 500, 7, [], new Map(), new Set(), bands);
    const update = adopted.update.mock.calls.find(
      (c: unknown[]) => c[0] === UtilityConsumption && c[1] === 55,
    );
    expect(update?.[2]).toEqual(
      expect.objectContaining({ consumption_f1: 60, consumption_f3: 38 }),
    );
  });

  it('rilevazione adottata o riusata: il flag stimata resta quello impostato', async () => {
    const manager = fakeManager([line(1)], { c_adopt: () => [{ id: 55 }] });
    await linker.link(manager as never, 500, 7, []);
    const update = manager.update.mock.calls.find(
      (c: unknown[]) => c[0] === UtilityConsumption && c[1] === 55,
    );
    expect(update?.[2]).not.toHaveProperty('is_estimated');
  });

  it('solo le rilevazioni reali coprono il periodo: una stima non blocca il consumo della fattura', async () => {
    const manager = fakeManager([line(1)]);
    await linker.link(manager as never, 500, 7, []);
    const sql = manager.query.mock.calls
      .map((c: unknown[]) => String(c[0]))
      .find((q: string) => q.includes('c_overlap'));
    expect(sql).toContain('c.is_estimated = 0');
  });

  it('rielaborazione: aggiorna la propria rilevazione e cancella quelle non più usate', async () => {
    const manager = fakeManager([line(1)], {
      c_owned: () => [
        { id: 60, utility_id_fk: 812, period_start: '2026-06-01', period_end: '2026-06-30' },
        { id: 61, utility_id_fk: 813, period_start: '2026-05-01', period_end: '2026-05-31' },
      ],
    });
    const result = await linker.link(manager as never, 500, 7, [60, 61]);
    expect(manager.save).not.toHaveBeenCalled();
    expect(manager.update).toHaveBeenCalledWith(
      UtilityConsumption,
      60,
      expect.objectContaining({ consumption: 100 }),
    );
    expect(manager.update).toHaveBeenCalledWith(
      UtilityConsumption,
      { id: expect.anything(), source: ConsumptionSource.INVOICE },
      { deleted: true },
    );
    expect(result.utilityIds.sort()).toEqual([812, 813]);
  });

  it('righe senza consumo, utenza o periodo completo: nessuna rilevazione', async () => {
    const manager = fakeManager([
      line(1, { consumption: null }),
      line(2, { utility_id_fk: null }),
      line(3, { period_end: null }),
    ]);
    expect(await linker.link(manager as never, 500, 7, [])).toEqual({ issues: [], utilityIds: [] });
    expect(manager.save).not.toHaveBeenCalled();
  });
});

describe('ConsumptionLinker.unlink', () => {
  it('cancella le rilevazioni della fattura e restituisce le utenze', async () => {
    const manager = fakeManager([], {
      c_linked: () => [
        { id: 60, utility_id_fk: 812 },
        { id: 61, utility_id_fk: 812 },
      ],
    });
    expect(await new ConsumptionLinker().unlink(manager as never, 500)).toEqual([812]);
    expect(manager.update).toHaveBeenCalledWith(
      UtilityConsumption,
      { id: expect.anything(), source: ConsumptionSource.INVOICE },
      { deleted: true },
    );
    expect(manager.update).toHaveBeenCalledWith(
      InvoiceLine,
      { invoice_id_fk: 500 },
      { consumption_id_fk: null },
    );
  });
});

describe('ConsumptionLinker.follow', () => {
  const linker = new ConsumptionLinker();

  it('riga modificata a mano con stessa utenza e periodo: la rilevazione segue il nuovo consumo', async () => {
    const previous = [line(1, { consumption_id_fk: 70 })];
    const manager = fakeManager([line(5, { consumption: 120 }), line(6, { consumption: null })]);
    const utilities = await linker.follow(manager as never, 500, previous);
    expect(manager.update).toHaveBeenCalledWith(
      InvoiceLine,
      { id: expect.anything() },
      { consumption_id_fk: 70 },
    );
    expect(manager.update).toHaveBeenCalledWith(UtilityConsumption, 70, { consumption: 120 });
    expect(manager.update).not.toHaveBeenCalledWith(
      UtilityConsumption,
      expect.objectContaining({ id: expect.anything() }),
      { deleted: true },
    );
    expect(utilities).toEqual([812]);
  });

  it('riga tolta o cambiata di periodo: la sua rilevazione da fattura si toglie', async () => {
    const previous = [line(1, { consumption_id_fk: 70 })];
    const manager = fakeManager([
      line(5, { period_start: '2026-07-01', period_end: '2026-07-31' }),
    ]);
    const utilities = await linker.follow(manager as never, 500, previous);
    expect(manager.update).toHaveBeenCalledWith(
      UtilityConsumption,
      { id: expect.anything(), source: ConsumptionSource.INVOICE },
      { deleted: true },
    );
    expect(utilities).toEqual([812]);
  });

  it('righe senza rilevazioni collegate: nessuna scrittura', async () => {
    const manager = fakeManager([line(5)]);
    expect(await linker.follow(manager as never, 500, [line(1)])).toEqual([]);
    expect(manager.update).not.toHaveBeenCalled();
  });
});

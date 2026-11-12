import { BadRequestException } from '@nestjs/common';
import { HardTypeEnum } from '@apis/utility-types/enum/hard-type.enum';
import { AgreementForecastService } from './agreement-forecast.service';
import * as sql from './agreement-forecast.sql';
import { ConsipAgreementForecast } from './entity/agreement-forecast.entity';

describe('AgreementForecastService', () => {
  let service: AgreementForecastService;
  let dataSource: { query: jest.Mock; transaction: jest.Mock };
  let manager: { delete: jest.Mock; insert: jest.Mock };
  let priceRepo: { find: jest.Mock; delete: jest.Mock; upsert: jest.Mock };
  let answers: Map<string, Record<string, unknown>[]>;

  // Un ordine sul 2026 con un'utenza luce sul capitolo 7, consumo 10 al
  // giorno dal 2025, una bolletta su gennaio 2026 e una arrivata dopo.
  const seed = () => {
    answers = new Map<string, Record<string, unknown>[]>([
      [sql.AGREEMENT_SQL, [{ id: 3 }]],
      [
        sql.ORDERS_SQL,
        [{ id: 1, draft: 0, closed: 0, supply_start: '2026-01-01', supply_end: '2026-12-31' }],
      ],
      [sql.ORDER_UTILITIES_SQL, [{ contract_id: 1, utility_id: 11 }]],
      [
        sql.UTILITIES_SQL,
        [
          {
            id: 11,
            utility_code: 'POD11',
            hard_type: 'LIGHT',
            chapter_id: 7,
            estimated_annual_consumption: null,
          },
        ],
      ],
      [
        sql.LINES_SQL,
        [
          {
            utility_id: 11,
            amount: '310.00',
            period_start: '2026-01-01',
            period_end: '2026-01-31',
            invoice_date: '2026-02-10',
          },
        ],
      ],
      [
        sql.CONSUMPTIONS_SQL,
        [
          {
            id: 1,
            utility_id: 11,
            kind: 'PERIOD',
            reading_date: null,
            reading_value: null,
            meter_number: null,
            period_start: '2025-01-01',
            period_end: '2026-01-31',
            consumption: '3960',
            is_estimated: 0,
          },
        ],
      ],
      [sql.EVENTS_SQL, []],
      [
        sql.COMMITTED_SQL,
        [{ chapter_id: 7, year: 2026, committed: '3000.00', remaining: '2690.00', without_amount: '0' }],
      ],
      [sql.SHARED_COMMITMENTS_SQL, []],
      [sql.SHARES_WITHOUT_LINES_SQL, []],
      [sql.CHAPTERS_SQL, [{ id: 7, chapter_code: '1234', article: '0', description: 'Capitolo di prova' }]],
    ]);
  };

  beforeEach(() => {
    seed();
    manager = { delete: jest.fn(), insert: jest.fn() };
    dataSource = {
      query: jest.fn(async (text: string) => answers.get(text) ?? []),
      transaction: jest.fn(async (cb) => cb(manager)),
    };
    priceRepo = {
      find: jest.fn().mockResolvedValue([{ hard_type: HardTypeEnum.LIGHT, unit_price: '1.000000' }]),
      delete: jest.fn(),
      upsert: jest.fn(),
    };
    service = new AgreementForecastService(dataSource as never, priceRepo as never);
    jest.useFakeTimers().setSystemTime(new Date('2026-02-15T10:00:00Z'));
  });

  afterEach(() => jest.useRealTimers());

  it('compute: calcola e sostituisce in blocco la cache della convenzione', async () => {
    const result = await service.compute(3);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ chapter_id: 7, year: 2026, invoiced: 310, committed: 3000 });
    expect(result.chapters).toEqual([{ id: 7, label: '1234/0 — Capitolo di prova' }]);
    expect(manager.delete).toHaveBeenCalledWith(ConsipAgreementForecast, { consip_agreement_id_fk: 3 });
    const inserted = manager.insert.mock.calls[0][1] as Record<string, unknown>[];
    expect(manager.insert.mock.calls[0][0]).toBe(ConsipAgreementForecast);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      consip_agreement_id_fk: 3,
      budget_chapter_id_fk: 7,
      fiscal_year: 2026,
      utilities: 1,
      invoiced: 310,
      committed: 3000,
      remaining: 2690,
    });
    expect(inserted[0].computed_at).toBeInstanceOf(Date);
    expect(result.computed_at).toBe((inserted[0].computed_at as Date).toISOString());
  });

  it('compute: convenzione senza righe non inserisce nulla ma svuota la cache', async () => {
    answers.set(sql.ORDERS_SQL, []);
    answers.set(sql.ORDER_UTILITIES_SQL, []);
    answers.set(sql.COMMITTED_SQL, []);
    const result = await service.compute(3);
    expect(result.rows).toEqual([]);
    expect(manager.delete).toHaveBeenCalled();
    expect(manager.insert).not.toHaveBeenCalled();
  });

  it('compute: convenzione inesistente → 400', async () => {
    answers.set(sql.AGREEMENT_SQL, []);
    await expect(service.compute(99)).rejects.toThrow(new BadRequestException('Convenzione non trovata'));
  });

  it('compute con asOf: usa quella data come oggi, taglia i dati successivi, non scrive la cache', async () => {
    const result = await service.compute(3, { asOf: '2025-12-31' });
    expect(dataSource.transaction).not.toHaveBeenCalled();
    const linesCall = dataSource.query.mock.calls.find(([text]) => text === sql.LINES_SQL);
    expect(linesCall?.[1]).toEqual([[11], '2025-12-31']);
    const consumptionsCall = dataSource.query.mock.calls.find(([text]) => text === sql.CONSUMPTIONS_SQL);
    expect(consumptionsCall?.[1]).toEqual([[11], '2025-12-31']);
    // Oggi = fine 2025: il 2026 è un esercizio futuro, quindi previsto e senza avviso.
    expect(result.rows[0].alert).toBeNull();
    expect(result.rows[0].to_invoice).toBeGreaterThan(0);
  });

  it('setPrice: valore → upsert con l’utente; null → elimina; poi ricalcola', async () => {
    await service.setPrice(3, HardTypeEnum.LIGHT, 0.3, 5);
    expect(priceRepo.upsert).toHaveBeenCalledWith(
      { consip_agreement_id_fk: 3, hard_type: HardTypeEnum.LIGHT, unit_price: 0.3, updated_by_user_id: 5 },
      ['consip_agreement_id_fk', 'hard_type'],
    );
    await service.setPrice(3, HardTypeEnum.LIGHT, null, 5);
    expect(priceRepo.delete).toHaveBeenCalledWith({ consip_agreement_id_fk: 3, hard_type: HardTypeEnum.LIGHT });
    expect(dataSource.transaction).toHaveBeenCalledTimes(2);
  });

  it('refreshAgreements: un fallimento non blocca le altre convenzioni', async () => {
    const compute = jest
      .spyOn(service, 'compute')
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({} as never);
    await service.refreshAgreements([1, 2, 2]);
    expect(compute).toHaveBeenCalledTimes(2);
    expect(compute).toHaveBeenNthCalledWith(1, 1);
    expect(compute).toHaveBeenNthCalledWith(2, 2);
  });

  it('refreshForContracts: risolve le convenzioni dei contratti; nessuna = nessun calcolo', async () => {
    const compute = jest.spyOn(service, 'compute').mockResolvedValue({} as never);
    answers.set(sql.AGREEMENTS_OF_CONTRACTS_SQL, [{ id: 3 }]);
    await service.refreshForContracts([1, 2]);
    expect(compute).toHaveBeenCalledWith(3);
    compute.mockClear();
    answers.set(sql.AGREEMENTS_OF_CONTRACTS_SQL, []);
    await service.refreshForContracts([1]);
    await service.refreshForContracts([]);
    expect(compute).not.toHaveBeenCalled();
  });

  it('refreshAll: tutte le convenzioni con un ordine non chiuso, con il conteggio', async () => {
    answers.set(sql.OPEN_AGREEMENTS_SQL, [{ id: 3 }, { id: 4 }]);
    jest
      .spyOn(service, 'compute')
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(new Error('boom'));
    await expect(service.refreshAll()).resolves.toEqual({ processed: 1, failed: 1 });
  });

  it('due calcoli insieme sulla stessa convenzione: uno alla volta, le scritture non si accavallano', async () => {
    jest.useRealTimers();
    const events: string[] = [];
    dataSource.transaction.mockImplementation(async (cb) => {
      events.push('inizio');
      await new Promise((resolve) => setTimeout(resolve, 5));
      await cb(manager);
      events.push('fine');
    });
    await Promise.all([service.compute(3), service.compute(3)]);
    expect(events).toEqual(['inizio', 'fine', 'inizio', 'fine']);
  });

  it('un calcolo fallito non blocca il successivo sulla stessa convenzione', async () => {
    dataSource.transaction.mockRejectedValueOnce(new Error('boom'));
    await expect(service.compute(3)).rejects.toThrow('boom');
    await expect(service.compute(3)).resolves.toMatchObject({ rows: [{ chapter_id: 7 }] });
  });
});

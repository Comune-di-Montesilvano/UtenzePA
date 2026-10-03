import { CostStatus, costStatusSql } from '@apis/utility/cost-status';
import { AnomaliesService } from './anomalies.service';

describe('AnomaliesService', () => {
  let query: jest.Mock;
  let service: AnomaliesService;

  beforeEach(() => {
    // Query non mockate esplicitamente: nessuna riga.
    query = jest.fn().mockResolvedValue([]);
    service = new AnomaliesService({ query } as never);
  });

  it('immobili senza natura o funzione, esclusi i cancellati', async () => {
    query.mockImplementation(async (sql: string) =>
      sql.includes('FROM assets a')
        ? [{ id: '5', asset_name: 'Immobile prova', missing: 'natura e funzione' }]
        : [],
    );
    const result = await service.getAnomalies();
    expect(result.assets_without_classification).toEqual({
      count: 1,
      items: [{ id: 5, asset_name: 'Immobile prova', missing: 'natura e funzione' }],
    });
    const sql = query.mock.calls.map(([s]) => String(s)).find((s) => s.includes('FROM assets a'));
    expect(sql).toContain('a.deleted = 0');
    expect(sql).toContain('a.nature_id IS NULL OR a.function_id IS NULL');
  });

  it('aggrega le 5 categorie con conteggio ed elenco, numeri convertiti', async () => {
    query
      .mockResolvedValueOnce([
        {
          id: 7,
          supplier: 'ENGIE',
          agreement: 'luce 3',
          supply_expiry_date: '2027-12-31',
          utilities: '125',
        },
      ])
      .mockResolvedValueOnce([{ id: 11, utility_id: 'IT001', type: 'energia elettrica' }])
      .mockResolvedValueOnce([
        { id: 12, utility_id: 'IT002', type: 'energia elettrica', contracts: '#7 ENGIE' },
        { id: 13, utility_id: 'IT003', type: 'energia elettrica', contracts: '#7 ENGIE' },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ cig: 'ABC', contracts: '3,4' }])
      .mockResolvedValueOnce([]);

    const result = await service.getAnomalies();

    expect(result.contracts_without_cig).toEqual({
      count: 1,
      items: [
        {
          id: 7,
          supplier: 'ENGIE',
          agreement: 'luce 3',
          supply_expiry_date: '2027-12-31',
          utilities: 125,
        },
      ],
    });
    expect(result.active_utilities_without_contract.count).toBe(1);
    expect(result.active_utilities_without_cig_contract.count).toBe(2);
    expect(result.utilities_with_overlapping_contracts).toEqual({ count: 0, items: [] });
    expect(result.duplicate_cigs).toEqual({ count: 1, items: [{ cig: 'ABC', contracts: [3, 4] }] });
    expect(query).toHaveBeenCalledTimes(15);
    // Fornitore = nome del soggetto terzo, non più la sigla.
    expect(query.mock.calls[0][0]).toContain('LEFT JOIN third_parties s');
    // I contratti chiusi non sono né correnti né anomalie "senza CIG"
    // (le prime 5 query riguardano i contratti di fornitura).
    for (const [sql] of query.mock.calls.slice(0, 5)) {
      expect(sql).toContain('closed = 0');
    }
  });

  it('elenca i contratti immobiliari senza immobile', async () => {
    // Le 5 query dei contratti di fornitura restano in testa, la nuova è la sesta.
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: '4', counterparty: 'SPRAR', subject: null }]);
    const a = await service.getAnomalies();
    expect(a.real_estate_contracts_without_assets).toEqual({
      count: 1,
      items: [{ id: 4, counterparty: 'SPRAR', subject: null }],
    });
    expect(query.mock.calls[5][0]).toContain('utilizer_grant_assets');
  });

  it('elenca gli impianti senza posizione (né propria, né geocodificata, né dell’immobile)', async () => {
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: '7', code: 'fon_2', name: 'Fontana', type: 'FOUNTAIN' }]);
    const a = await service.getAnomalies();
    expect(a.plants_without_position).toEqual({
      count: 1,
      items: [{ id: 7, code: 'fon_2', name: 'Fontana', type: 'FOUNTAIN' }],
    });
    expect(query.mock.calls[6][0]).toContain('FROM plants');
  });

  it('elenca ascensori, antincendio e termici senza immobile collegato', async () => {
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: '9', code: 'ANT-57', name: 'Antincendio materna', type: 'FIRE_PROTECTION' },
      ]);
    const a = await service.getAnomalies();
    expect(a.plants_without_asset).toEqual({
      count: 1,
      items: [{ id: 9, code: 'ANT-57', name: 'Antincendio materna', type: 'FIRE_PROTECTION' }],
    });
    const sql = query.mock.calls[7][0] as string;
    expect(sql).toContain('plant_assets');
    expect(sql).toContain("'THERMAL', 'ELEVATOR', 'FIRE_PROTECTION'");
  });

  it('elenca i contratti immobiliari senza parti e i soggetti senza identificativo fiscale', async () => {
    for (let i = 0; i < 8; i++) query.mockResolvedValueOnce([]);
    query
      .mockResolvedValueOnce([{ id: '12', subject: 'Chiosco' }])
      .mockResolvedValueOnce([{ id: '1207', name: 'Rossi Mario', type: 'LEGAL' }]);
    const a = await service.getAnomalies();
    expect(a.real_estate_contracts_without_parties).toEqual({
      count: 1,
      items: [{ id: 12, subject: 'Chiosco' }],
    });
    expect(a.third_parties_without_identifier).toEqual({
      count: 1,
      items: [{ id: 1207, name: 'Rossi Mario', type: 'LEGAL' }],
    });
    expect(query.mock.calls[8][0]).toContain('utilizer_grant_parties');
    const sql = query.mock.calls[9][0] as string;
    expect(sql).toContain("tp.type = 'LEGAL' AND IFNULL(TRIM(tp.vat_number), '') = ''");
    expect(sql).toContain("tp.type = 'NATURAL' AND IFNULL(TRIM(tp.tax_code), '') = ''");
  });

  it('elenca le utenze attive senza tipologia ARERA (Internet escluso)', async () => {
    for (let i = 0; i < 10; i++) query.mockResolvedValueOnce([]);
    query.mockResolvedValueOnce([{ id: 21, utility_id: 'IT004', type: 'gas' }]);
    const a = await service.getAnomalies();
    expect(a.active_utilities_without_arera_category).toEqual({
      count: 1,
      items: [{ id: 21, utility_id: 'IT004', type: 'gas' }],
    });
    const sql = query.mock.calls[10][0] as string;
    expect(sql).toContain('u.supply_active = 1');
    expect(sql).toContain("t.hard_type <> 'INTERNET'");
    expect(sql).toContain('u.arera_category IS NULL');
  });

  it("elenca le utenze gas attive senza categoria d'uso", async () => {
    for (let i = 0; i < 11; i++) query.mockResolvedValueOnce([]);
    query.mockResolvedValueOnce([{ id: 22, utility_id: '0088', type: 'gas' }]);
    const a = await service.getAnomalies();
    expect(a.active_gas_utilities_without_use_category).toEqual({
      count: 1,
      items: [{ id: 22, utility_id: '0088', type: 'gas' }],
    });
    const sql = query.mock.calls[11][0] as string;
    expect(sql).toContain('u.supply_active = 1');
    expect(sql).toContain("t.hard_type = 'GAS'");
    expect(sql).toContain('u.gas_use_category IS NULL');
  });

  it('elenca le utenze da volturare e quelle da riprendere, solo forniture attive', async () => {
    for (let i = 0; i < 12; i++) query.mockResolvedValueOnce([]);
    query
      .mockResolvedValueOnce([
        {
          id: 31,
          utility_id: 'IT005',
          type: 'luce',
          contracts: 'Alfa Srl · dal 01/05/2026',
          since: '2026-05-01',
        },
      ])
      .mockResolvedValueOnce([
        { id: 32, utility_id: 'IT006', type: 'luce', contracts: 'Beta Spa' },
      ]);

    const a = await service.getAnomalies();

    expect(a.utilities_to_transfer).toEqual({
      count: 1,
      items: [
        { id: 31, utility_id: 'IT005', type: 'luce', contracts: 'Alfa Srl · dal 01/05/2026' },
      ],
    });
    expect(a.utilities_to_recover.items[0].contracts).toBe('Beta Spa');
    const toTransfer = query.mock.calls[12][0] as string;
    const toRecover = query.mock.calls[13][0] as string;
    expect(toTransfer).toContain(costStatusSql(CostStatus.TO_TRANSFER, 'u'));
    expect(toRecover).toContain(costStatusSql(CostStatus.TO_RECOVER, 'u'));
    for (const sql of [toTransfer, toRecover]) expect(sql).toContain('u.supply_active = 1');
  });
});

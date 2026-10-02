import { AnomaliesService } from './anomalies.service';

describe('AnomaliesService', () => {
  let query: jest.Mock;
  let service: AnomaliesService;

  beforeEach(() => {
    // Query non mockate esplicitamente: nessuna riga.
    query = jest.fn().mockResolvedValue([]);
    service = new AnomaliesService({ query } as never);
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
    expect(query).toHaveBeenCalledTimes(10);
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
      .mockResolvedValueOnce([{ id: '9', code: 'ANT-57', name: 'Antincendio materna', type: 'FIRE_PROTECTION' }]);
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
});

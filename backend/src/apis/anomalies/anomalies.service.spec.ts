import { AnomaliesService } from './anomalies.service';

describe('AnomaliesService', () => {
  let query: jest.Mock;
  let service: AnomaliesService;

  beforeEach(() => {
    query = jest.fn();
    service = new AnomaliesService({ query } as never);
  });

  it('aggrega le 5 categorie con conteggio ed elenco, numeri convertiti', async () => {
    query
      .mockResolvedValueOnce([{ id: 7, supplier: 'ENGIE', agreement: 'luce 3', supply_expiry_date: '2027-12-31', utilities: '125' }])
      .mockResolvedValueOnce([{ id: 11, utility_id: 'IT001', type: 'energia elettrica' }])
      .mockResolvedValueOnce([
        { id: 12, utility_id: 'IT002', type: 'energia elettrica', contracts: '#7 ENGIE' },
        { id: 13, utility_id: 'IT003', type: 'energia elettrica', contracts: '#7 ENGIE' },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ cig: 'ABC', contracts: '3,4' }]);

    const result = await service.getAnomalies();

    expect(result.contracts_without_cig).toEqual({
      count: 1,
      items: [{ id: 7, supplier: 'ENGIE', agreement: 'luce 3', supply_expiry_date: '2027-12-31', utilities: 125 }],
    });
    expect(result.active_utilities_without_contract.count).toBe(1);
    expect(result.active_utilities_without_cig_contract.count).toBe(2);
    expect(result.utilities_with_overlapping_contracts).toEqual({ count: 0, items: [] });
    expect(result.duplicate_cigs).toEqual({ count: 1, items: [{ cig: 'ABC', contracts: [3, 4] }] });
    expect(query).toHaveBeenCalledTimes(5);
    // I contratti chiusi non sono né correnti né anomalie "senza CIG".
    for (const [sql] of query.mock.calls) {
      expect(sql).toContain('closed = 0');
    }
  });
});

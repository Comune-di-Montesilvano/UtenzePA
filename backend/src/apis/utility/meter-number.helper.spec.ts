import { findMeterConflict } from './meter-number.helper';

describe('findMeterConflict', () => {
  const repoWith = (rows: unknown[]) => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(rows),
    };
    return { repo: { createQueryBuilder: jest.fn().mockReturnValue(qb) }, qb };
  };

  it('riconosce come conflitto una matricola con tab/NBSP o maiuscole diverse', async () => {
    const { repo } = repoWith([{ id: 8, utility_id: 'IT008', meter_number: 'AB12	 ' }]);
    await expect(findMeterConflict(repo as never, ' ab12 ', 7)).resolves.toMatchObject({ id: 8 });
  });

  it('ignora le matricole che contengono il valore senza coincidere', async () => {
    const { repo } = repoWith([{ id: 8, utility_id: 'IT008', meter_number: 'XAB12' }]);
    await expect(findMeterConflict(repo as never, 'AB12', 7)).resolves.toBeNull();
  });

  it('matricola vuota: nessuna query', async () => {
    const { repo } = repoWith([]);
    await expect(findMeterConflict(repo as never, ' 	 ', 7)).resolves.toBeNull();
    expect(repo.createQueryBuilder).not.toHaveBeenCalled();
  });
});

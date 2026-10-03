import { UtilityTypesService } from './utility-types.service';

describe('UtilityTypesService', () => {
  let service: UtilityTypesService;
  let repo: {
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    manager: { query: jest.Mock };
  };
  let qb: { where: jest.Mock; andWhere: jest.Mock; leftJoinAndSelect: jest.Mock; orderBy: jest.Mock; getMany: jest.Mock };

  beforeEach(() => {
    qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    repo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      findOne: jest.fn(),
      create: jest.fn((data) => data),
      save: jest.fn(async (data) => ({ ...data, id: 10 })),
      manager: { query: jest.fn().mockResolvedValue([{ n: '0' }]) },
    };
    service = new UtilityTypesService(repo as never);
  });

  it('findAll filtra i tipi non cancellati e non fa join sulle finalità', async () => {
    await service.findAll();
    expect(qb.where).toHaveBeenCalledWith('utility_types.deleted = :deleted', { deleted: false });
    expect(qb.leftJoinAndSelect).not.toHaveBeenCalled();
  });

  it('findAll filtra nome e descrizione con LIKE e hard_type esatto', async () => {
    await service.findAll({ name: 'gas', hard_type: 'GAS' } as never);
    expect(qb.andWhere).toHaveBeenCalledWith('utility_types.name LIKE :name', { name: '%gas%' });
    expect(qb.andWhere).toHaveBeenCalledWith('utility_types.hard_type = :hard_type', { hard_type: 'GAS' });
  });

  it('create salva il tipo con l’utente', async () => {
    const saved = await service.create({ name: 'Acqua', hard_type: 'WATER' } as never, 5);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Acqua', created_by_user_id: 5, updated_by_user_id: 5 }),
    );
    expect(saved.id).toBe(10);
  });

  it('rifiuta il cambio di hard_type se ci sono utenze con tipologia ARERA non più ammessa', async () => {
    repo.findOne.mockResolvedValue({ id: 33, name: 'acqua', hard_type: 'WATER' });
    repo.manager.query.mockResolvedValue([{ n: '3' }]);
    await expect(service.update(33, { hard_type: 'INTERNET' } as never, 5)).rejects.toThrow(
      /3 utenze hanno una tipologia ARERA o una categoria d'uso non compatibile/,
    );
    expect(repo.save).not.toHaveBeenCalled();
    const [sql, params] = repo.manager.query.mock.calls[0];
    expect(sql).toContain('arera_category IS NOT NULL');
    expect(params[0]).toBe(33);
  });

  it('cambio di hard_type senza utenze incompatibili passa, e solo-nome non interroga le utenze', async () => {
    repo.findOne.mockResolvedValue({ id: 33, name: 'acqua', hard_type: 'WATER' });
    await service.update(33, { hard_type: 'GAS' } as never, 5);
    const [sql, params] = repo.manager.query.mock.calls[0];
    expect(sql).toContain('arera_category NOT IN (?, ?, ?, ?)');
    expect(params).toEqual([33, 'GAS_DOMESTIC', 'GAS_CONDOMINIUM_DOMESTIC', 'GAS_PUBLIC_SERVICE', 'GAS_OTHER']);

    repo.manager.query.mockClear();
    await service.update(33, { name: 'Acqua' } as never, 5);
    expect(repo.manager.query).not.toHaveBeenCalled();
  });

  it("cambio di hard_type da gas ad altro conta anche le utenze con categoria d'uso", async () => {
    repo.findOne.mockResolvedValue({ id: 34, name: 'gas', hard_type: 'GAS' });
    repo.manager.query.mockResolvedValue([{ n: '2' }]);
    await expect(service.update(34, { hard_type: 'WATER' } as never, 5)).rejects.toThrow(
      /2 utenze hanno una tipologia ARERA o una categoria d'uso non compatibile/,
    );
    const [sql] = repo.manager.query.mock.calls[0];
    expect(sql).toContain('gas_use_category IS NOT NULL');
  });

  it("verso il gas la categoria d'uso non blocca", async () => {
    repo.findOne.mockResolvedValue({ id: 33, name: 'acqua', hard_type: 'WATER' });
    await service.update(33, { hard_type: 'GAS' } as never, 5);
    const [sql] = repo.manager.query.mock.calls[0];
    expect(sql).not.toContain('gas_use_category');
  });
});

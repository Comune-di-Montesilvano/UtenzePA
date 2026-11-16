import { UtilityTypesService } from './utility-types.service';

describe('UtilityTypesService', () => {
  let service: UtilityTypesService;
  let repo: {
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    manager: { getRepository: jest.Mock };
  };
  let utilities: { count: jest.Mock };
  let qb: {
    where: jest.Mock;
    andWhere: jest.Mock;
    leftJoinAndSelect: jest.Mock;
    orderBy: jest.Mock;
    getMany: jest.Mock;
  };

  beforeEach(() => {
    qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    utilities = { count: jest.fn().mockResolvedValue(0) };
    repo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      findOne: jest.fn(),
      create: jest.fn((data) => data),
      save: jest.fn(async (data) => ({ ...data, id: 10 })),
      manager: { getRepository: jest.fn(() => utilities) },
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
    expect(qb.andWhere).toHaveBeenCalledWith('utility_types.hard_type = :hard_type', {
      hard_type: 'GAS',
    });
  });

  it('create salva il tipo con l’utente', async () => {
    const saved = await service.create({ name: 'Acqua', hard_type: 'WATER' } as never, 5);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Acqua', created_by_user_id: 5, updated_by_user_id: 5 }),
    );
    expect(saved.id).toBe(10);
  });

  // Le condizioni della conta (categorie ammesse, cancellate, categoria d'uso) sono provate
  // sul database vero in utility-types.int-spec.ts.
  it('rifiuta il cambio di hard_type se ci sono utenze con tipologia ARERA non più ammessa', async () => {
    repo.findOne.mockResolvedValue({ id: 33, name: 'acqua', hard_type: 'WATER' });
    utilities.count.mockResolvedValue(3);
    await expect(service.update(33, { hard_type: 'INTERNET' } as never, 5)).rejects.toThrow(
      /3 utenze hanno una tipologia ARERA o una categoria d'uso non compatibile/,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('cambio di hard_type senza utenze incompatibili passa, e solo-nome non interroga le utenze', async () => {
    repo.findOne.mockResolvedValue({ id: 33, name: 'acqua', hard_type: 'WATER' });
    await service.update(33, { hard_type: 'GAS' } as never, 5);
    expect(utilities.count).toHaveBeenCalledTimes(1);
    expect(repo.save).toHaveBeenCalled();

    utilities.count.mockClear();
    await service.update(33, { name: 'Acqua' } as never, 5);
    expect(utilities.count).not.toHaveBeenCalled();
  });

  it("verso il gas conta solo la tipologia ARERA, verso altro anche la categoria d'uso", async () => {
    repo.findOne.mockResolvedValue({ id: 33, name: 'acqua', hard_type: 'WATER' });
    await service.update(33, { hard_type: 'GAS' } as never, 5);
    expect(utilities.count.mock.calls[0][0].where).toHaveLength(1);
    await service.update(33, { hard_type: 'WATER' } as never, 5);
    expect(utilities.count.mock.calls[1][0].where).toHaveLength(2);
  });
});

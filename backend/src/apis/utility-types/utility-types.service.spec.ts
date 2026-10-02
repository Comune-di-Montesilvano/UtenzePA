import { UtilityTypesService } from './utility-types.service';

describe('UtilityTypesService', () => {
  let service: UtilityTypesService;
  let repo: { createQueryBuilder: jest.Mock; findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
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
});

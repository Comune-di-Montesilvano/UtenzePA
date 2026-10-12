import { ActTypesService } from './act-types.service';

describe('ActTypesService', () => {
  let repo: { find: jest.Mock; findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let acts: { count: jest.Mock };
  let service: ActTypesService;

  beforeEach(() => {
    repo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 1, ...x })),
    };
    acts = { count: jest.fn().mockResolvedValue(0) };
    service = new ActTypesService(repo as never, acts as never);
  });

  it('elenco ordinato, senza cancellati', async () => {
    await service.findAll();
    expect(repo.find).toHaveBeenCalledWith({
      where: { deleted: false },
      order: { sort_order: 'ASC', name: 'ASC' },
    });
  });

  it('nome già usato da un tipo non cancellato: 400', async () => {
    repo.findOne.mockResolvedValue({ id: 5, name: 'Decreto' });
    await expect(service.create({ name: 'decreto' }, 1)).rejects.toThrow(
      'Esiste già un tipo di atto «Decreto»',
    );
  });

  it('non eliminabile se usato', async () => {
    repo.findOne.mockResolvedValue({ id: 5, name: 'Decreto', deleted: false });
    acts.count.mockResolvedValue(3);
    await expect(service.remove(5, 1)).rejects.toThrow('usato da 3 atti');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('eliminabile se non usato: cancellazione logica', async () => {
    repo.findOne.mockResolvedValue({ id: 5, name: 'Decreto', deleted: false });
    await service.remove(5, 1);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 5, deleted: true, updated_by_user_id: 1 }),
    );
  });
});

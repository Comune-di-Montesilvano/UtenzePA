import { SpendingDestinationsService } from './spending-destinations.service';
import * as q from './spending-destinations.queries';

jest.mock('./spending-destinations.queries');
const usage = q.destinationUsage as jest.Mock;

describe('SpendingDestinationsService', () => {
  let repo: { find: jest.Mock; findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let service: SpendingDestinationsService;

  beforeEach(() => {
    repo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 1, ...x })),
    };
    usage.mockReset().mockResolvedValue([]);
    service = new SpendingDestinationsService(repo as never, { manager: {} } as never);
  });

  it('nome già usato da una destinazione non cancellata: 400', async () => {
    repo.findOne.mockResolvedValue({ id: 5, name: 'Scuola materna' });
    await expect(service.create({ name: 'scuola materna' }, 1)).rejects.toThrow(
      'Destinazione già presente: «Scuola materna»',
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rinomina su sé stessa ammessa', async () => {
    repo.findOne.mockResolvedValue({ id: 5, name: 'Scuola materna', deleted: false });
    await expect(service.assertNameFree('Scuola materna', 5)).resolves.toBeUndefined();
  });

  it('non eliminabile se usata da immobili, impianti o capitoli', async () => {
    repo.findOne.mockResolvedValue({ id: 5, name: 'Scuola materna', deleted: false });
    usage.mockResolvedValue([{ id: 5, assets: 2, plants: 0, chapters: 1, utilities: 3 }]);
    await expect(service.remove(5, 1)).rejects.toThrow('Destinazione in uso');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('eliminabile se non usata: cancellazione logica', async () => {
    repo.findOne.mockResolvedValue({ id: 5, name: 'Scuola materna', deleted: false });
    usage.mockResolvedValue([{ id: 5, assets: 0, plants: 0, chapters: 0, utilities: 0 }]);
    jest.spyOn(service as never, 'recordAudit').mockResolvedValue(undefined as never);
    await service.remove(5, 1);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 5, deleted: true, updated_by_user_id: 1 }),
    );
  });

  it('assegna la destinazione agli immobili: audit su quelli che cambiano, poi ricalcolo', async () => {
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const derivation = { requestAllSafe: jest.fn().mockResolvedValue(undefined) };
    service = new SpendingDestinationsService(
      repo as never,
      { manager: {} } as never,
      audit as never,
      derivation as never,
    );
    repo.findOne.mockResolvedValue({ id: 5, name: 'Scuola materna', deleted: false });
    (q.assetDestinationsOf as jest.Mock).mockResolvedValue([
      { id: 1, spending_destination_id: null },
      { id: 2, spending_destination_id: 5 },
    ]);
    expect(await service.assignAssets(5, [1, 2], 9)).toEqual({ assigned: 1 });
    expect(q.setAssetDestination).toHaveBeenCalledWith(expect.anything(), [1], 5, 9);
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityName: 'assets',
        entityId: 1,
        userId: 9,
        fields: [{ fieldName: 'spending_destination_id', oldValue: null, newValue: 5 }],
      }),
    );
    expect(derivation.requestAllSafe).toHaveBeenCalled();
  });

  it('proposte dalle righe delle utenze', async () => {
    (q.suggestionRows as jest.Mock).mockResolvedValue([
      { asset_id: '1', label: 'Scuola Rossi', destination_id: '5' },
    ]);
    expect(await service.suggestions()).toEqual([
      { asset_id: 1, label: 'Scuola Rossi', destination_id: 5, utilities: 1 },
    ]);
  });

  it('elenco con i conteggi di uso', async () => {
    repo.find.mockResolvedValue([
      { id: 5, name: 'Scuola materna' },
      { id: 6, name: 'Nido' },
    ]);
    usage.mockResolvedValue([{ id: 5, assets: '2', plants: '0', chapters: '1', utilities: '3' }]);
    expect(await service.findAll()).toEqual([
      { id: 5, name: 'Scuola materna', assets: 2, plants: 0, chapters: 1, utilities: 3 },
      { id: 6, name: 'Nido', assets: 0, plants: 0, chapters: 0, utilities: 0 },
    ]);
  });
});

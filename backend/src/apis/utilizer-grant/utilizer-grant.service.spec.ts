import { BadRequestException } from '@nestjs/common';
import { BaseService } from '@apis/shared/base.service';
import { UtilizerGrantService } from './utilizer-grant.service';
import { ContractStatus, DisplayStatus, RentPeriod } from './enum/real-estate-contract.enum';

describe('UtilizerGrantService', () => {
  let service: UtilizerGrantService;
  let qb: Record<string, jest.Mock>;
  let repo: {
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
  };
  let assetRepo: { count: jest.Mock };
  let partyRepo: { count: jest.Mock };

  const row = (over: Record<string, unknown> = {}) => ({
    id: 1,
    status: ContractStatus.ACTIVE,
    end_date: null,
    tacit_renewal: false,
    renewal_months: null,
    notice_months: null,
    rent_amount: '100.00',
    rent_period: RentPeriod.MONTHLY,
    direction: 'ACTIVE',
    assets: [{ id: 3 }],
    ...over,
  });

  beforeEach(() => {
    qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    repo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      findOne: jest.fn(),
      create: jest.fn((d) => d),
      save: jest.fn(async (d) => ({ id: 99, ...d })),
      find: jest.fn().mockResolvedValue([]),
    };
    assetRepo = { count: jest.fn().mockResolvedValue(1) };
    partyRepo = { count: jest.fn().mockResolvedValue(1) };
    service = new UtilizerGrantService(repo as never, assetRepo as never, partyRepo as never);
    jest.spyOn(service as never, 'today' as never).mockReturnValue('2026-10-02' as never);
  });

  afterEach(() => jest.restoreAllMocks());

  it('aggiunge canone annuo e stato mostrato a ogni riga', async () => {
    qb.getMany.mockResolvedValue([row({ end_date: '2025-01-01' })]);
    const [r] = await service.findAll({});
    expect(r.annual_rent).toBe(1200);
    expect(r.computed_status).toBe(DisplayStatus.EXPIRED);
  });

  it('filtro alert=expired_active tiene solo gli scaduti dichiarati attivi', async () => {
    qb.getMany.mockResolvedValue([
      row({ id: 1, end_date: '2025-01-01' }),
      row({ id: 2, end_date: '2025-01-01', status: ContractStatus.RETURNED }),
      row({ id: 3, end_date: '2030-01-01' }),
    ]);
    const rows = await service.findAll({ alert: 'expired_active' });
    expect(rows.map((r) => r.id)).toEqual([1]);
  });

  it('filtro alert=without_assets', async () => {
    qb.getMany.mockResolvedValue([row({ id: 1, assets: [] }), row({ id: 2 })]);
    expect((await service.findAll({ alert: 'without_assets' })).map((r) => r.id)).toEqual([1]);
  });

  it('summary: conteggi e totali solo su contratti attivi o in scadenza', async () => {
    qb.getMany.mockResolvedValue([
      row({ id: 1 }),
      row({ id: 2, direction: 'PASSIVE', rent_amount: '50.00' }),
      row({ id: 3, end_date: '2025-01-01' }),
      row({ id: 4, assets: [] }),
    ]);
    const s = await service.summary();
    expect(s.expired_active).toBe(1);
    expect(s.without_assets).toBe(1);
    expect(s.annual_income).toBe(2400);
    expect(s.annual_expense).toBe(600);
  });

  it('rifiuta un contratto con canone senza periodicità', async () => {
    await expect(
      service.create({ party_ids: [1], rent_amount: 10 } as never, 3),
    ).rejects.toThrow(BadRequestException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rifiuta immobili inesistenti', async () => {
    assetRepo.count.mockResolvedValue(0);
    await expect(service.create({ party_ids: [1], asset_ids: [7] } as never, 3)).rejects.toThrow(
      /immobili/,
    );
  });

  it('crea con immobili collegati', async () => {
    repo.findOne.mockResolvedValue({ id: 99, assets: [{ id: 7 }] });
    await service.create({ party_ids: [1], asset_ids: [7] } as never, 3);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ parties: [{ id: 1 }], assets: [{ id: 7 }], created_by_user_id: 3 }),
    );
  });

  it('findOne esclude le parti eliminate (anche di padre e figli), come findAll', async () => {
    const parties = [
      { id: 1, deleted: false },
      { id: 2, deleted: true },
    ];
    repo.findOne.mockResolvedValue(
      row({ parties, parent: { id: 7, parties }, children: [{ id: 8, parties }] }),
    );
    const g = await service.findOne(1);
    expect(g.parties.map((p) => p.id)).toEqual([1]);
    expect(g.parent.parties.map((p) => p.id)).toEqual([1]);
    expect(g.children[0].parties.map((p) => p.id)).toEqual([1]);
  });

  it('rifiuta parti inesistenti', async () => {
    partyRepo.count.mockResolvedValue(0);
    await expect(service.create({ party_ids: [999] } as never, 3)).rejects.toThrow(
      'Una o più parti non esistono o sono state eliminate.',
    );
  });

  it('update senza party_ids non tocca le parti', async () => {
    repo.findOne.mockResolvedValue({ id: 1, deleted: false });
    jest.spyOn(BaseService.prototype, 'update').mockResolvedValue({ id: 1 } as never);
    await service.update(1, { subject: 'x' } as never, 3);
    expect(repo.findOne).not.toHaveBeenCalledWith(
      expect.objectContaining({ relations: { parties: true } }),
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('update con party_ids sostituisce le parti', async () => {
    repo.findOne.mockResolvedValue({ id: 1, deleted: false, parties: [{ id: 5 }] });
    partyRepo.count.mockResolvedValue(2);
    jest.spyOn(BaseService.prototype, 'update').mockResolvedValue({ id: 1 } as never);
    await service.update(1, { party_ids: [7, 8] } as never, 3);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ parties: [{ id: 7 }, { id: 8 }] }),
    );
  });

  it('filtro per parte e ricerca testuale con sottoquery (elenco parti completo)', async () => {
    await service.findAll({ party_id: 5, q: 'rossi' });
    const clauses = qb.andWhere.mock.calls.map((c) => String(c[0]));
    expect(clauses.some((c) => c.includes('gp.third_party_id = :fParty'))).toBe(true);
    expect(clauses.some((c) => c.includes('FROM utilizer_grant_parties gp JOIN third_parties tp'))).toBe(
      true,
    );
  });

  it('di default esclude i cancellati, con deleted=true mostra solo quelli', async () => {
    await service.findAll({});
    expect(qb.where).toHaveBeenCalledWith('UtilizerGrant.deleted = :deleted', { deleted: 0 });
    await service.findAll({ deleted: true });
    expect(qb.where).toHaveBeenLastCalledWith('UtilizerGrant.deleted = :deleted', { deleted: 1 });
  });

  it('update di un contratto inesistente', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.update(5, { notes: 'x' } as never, 3)).rejects.toThrow(/non trovato/);
  });

  it('remove marca il contratto come cancellato senza salvare i campi calcolati', async () => {
    repo.findOne.mockResolvedValue({ id: 5, deleted: false, updated_by_user_id: 1 });
    await service.remove(5, 3);
    expect(repo.save).toHaveBeenCalledWith({ id: 5, deleted: true, updated_by_user_id: 3 });
  });
});

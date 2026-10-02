import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  ContractDirection,
  ContractKind,
} from '@apis/utilizer-grant/enum/real-estate-contract.enum';
import { BaseService } from '@apis/shared/base.service';
import { ThirdParty } from './entity/third-party.entity';
import { PartyRole, ThirdPartyType } from './enum/third-party.enum';
import { ThirdPartiesService } from './third-parties.service';

describe('ThirdPartiesService', () => {
  let service: ThirdPartiesService;
  const repo = {
    findOne: jest.fn(),
    create: jest.fn((x) => x),
    save: jest.fn(async (x) => ({ id: 7, ...x })),
    createQueryBuilder: jest.fn(),
  };
  const dataSource = { query: jest.fn() };

  beforeEach(async () => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        ThirdPartiesService,
        { provide: getRepositoryToken(ThirdParty), useValue: repo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = module.get(ThirdPartiesService);
  });

  const legal = { type: ThirdPartyType.LEGAL, company_name: 'ACA', vat_number: '01318460688' };

  it('create rifiuta un giuridico senza P.IVA con 400', async () => {
    await expect(service.create({ ...legal, vat_number: null }, 1)).rejects.toThrow(
      new BadRequestException('Partita IVA obbligatoria per i soggetti giuridici.'),
    );
  });

  it('create rifiuta una P.IVA già usata, anche scritta con spazi, col nome del soggetto', async () => {
    repo.findOne.mockResolvedValueOnce({
      id: 3,
      type: ThirdPartyType.LEGAL,
      company_name: 'ACA SpA',
      deleted: false,
    });
    await expect(service.create({ ...legal, vat_number: ' 0131 8460688' }, 1)).rejects.toThrow(
      new BadRequestException('Partita IVA già usata da ACA SpA.'),
    );
    expect(repo.findOne).toHaveBeenCalledWith({ where: { vat_number: '01318460688' } });
  });

  it('update consente il ripristino di un soggetto storico incompleto', async () => {
    repo.findOne.mockResolvedValue({
      id: 5,
      type: ThirdPartyType.LEGAL,
      company_name: 'X',
      vat_number: null,
      deleted: true,
    });
    const spy = jest
      .spyOn(BaseService.prototype, 'update')
      .mockResolvedValue({ id: 5 } as never);
    await service.update(5, { deleted: false }, 1);
    expect(spy).toHaveBeenCalledWith(5, { deleted: false }, 1);
  });

  it("update valida il record risultante se il payload tocca l'identità", async () => {
    repo.findOne.mockResolvedValue({
      id: 5,
      type: ThirdPartyType.LEGAL,
      company_name: 'X',
      vat_number: null,
      deleted: false,
    });
    await expect(service.update(5, { notes: 'x', company_name: 'X' }, 1)).rejects.toThrow(
      new BadRequestException('Partita IVA obbligatoria per i soggetti giuridici.'),
    );
  });

  it('findAll calcola i ruoli e filtra per chip', async () => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        { id: 1000, type: ThirdPartyType.NATURAL, last_name: 'Rossi', first_name: 'Mario' },
        { id: 42, type: ThirdPartyType.LEGAL, company_name: 'Enel' },
        { id: 1001, type: ThirdPartyType.LEGAL, company_name: 'Bar Spiaggia' },
      ]),
    };
    repo.createQueryBuilder.mockReturnValue(qb);
    dataSource.query.mockResolvedValueOnce([{ id: 42 }]).mockResolvedValueOnce([
      { party_id: 1000, direction: ContractDirection.PASSIVE, kind: ContractKind.LEASE },
      { party_id: 1001, direction: ContractDirection.ACTIVE, kind: ContractKind.CONCESSION },
    ]);

    const rows = await service.findAll({ roles: [PartyRole.SUPPLIER, PartyRole.LESSOR] });
    expect(rows.map((r) => [r.id, r.roles])).toEqual([
      [42, [PartyRole.SUPPLIER]],
      [1000, [PartyRole.LESSOR]],
    ]);
  });

  it('findAll con tipo contratto tiene solo le parti di quel tipo', async () => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        { id: 42, type: ThirdPartyType.LEGAL, company_name: 'Enel' },
        { id: 1001, type: ThirdPartyType.LEGAL, company_name: 'Bar Spiaggia' },
      ]),
    };
    repo.createQueryBuilder.mockReturnValue(qb);
    dataSource.query.mockResolvedValueOnce([{ id: 42 }]).mockResolvedValueOnce([
      { party_id: 1001, direction: ContractDirection.ACTIVE, kind: ContractKind.CONCESSION },
    ]);

    const rows = await service.findAll({ kind: ContractKind.CONCESSION });
    expect(rows.map((r) => r.id)).toEqual([1001]);
  });
});

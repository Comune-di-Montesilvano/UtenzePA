import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Contract } from '@apis/contracts/entity/contract.entity';
import { ContractUtility } from '@apis/contracts/entity/contract-utility.entity';
import { CreateContractDto } from '@apis/contracts/dto/create-contract.dto';
import { UpdateContractDto } from '@apis/contracts/dto/update-contract.dto';
import { SearchContractDto } from '@apis/contracts/dto/search-contract.dto';
import { BaseService, toFindOptionsRelations } from '@apis/shared/base.service';

@Injectable()
export class ContractsService extends BaseService<Contract, CreateContractDto, UpdateContractDto> {
  protected readonly entityName = 'contract';
  protected readonly relations = ['supplier', 'consipAgreement', 'utilities', 'created_by', 'updated_by'];

  constructor(
    @InjectRepository(Contract)
    protected readonly repo: Repository<Contract>,
    @InjectRepository(ContractUtility)
    private readonly contractUtilityRepo: Repository<ContractUtility>,
    private readonly dataSource: DataSource,
  ) {
    super();
  }

  async findAll(filters?: SearchContractDto): Promise<Contract[]> {
    const alias = this.entityName;
    const qb = this.repo.createQueryBuilder(alias);
    qb.where(`${alias}.deleted = :deleted`, { deleted: false });
    qb.leftJoinAndSelect(`${alias}.supplier`, 'supplier');
    qb.leftJoinAndSelect(`${alias}.utilities`, 'utilities');

    if (filters) {
      if (filters.utility_id) {
        qb.innerJoin(`${alias}.utilities`, 'filtered_utility', 'filtered_utility.id = :utilityId', {
          utilityId: filters.utility_id,
        });
      }
      if (filters.supply_expiry_date_range) {
        const range = filters.supply_expiry_date_range;
        if (range[0]) qb.andWhere(`${alias}.supply_expiry_date >= :expiry_start`, { expiry_start: range[0] });
        if (range[1]) qb.andWhere(`${alias}.supply_expiry_date <= :expiry_end`, { expiry_end: range[1] });
      }
      if (filters.supplier_id_fk) {
        qb.andWhere(`${alias}.supplier_id_fk = :supplier_id_fk`, { supplier_id_fk: filters.supplier_id_fk });
      }
      if (filters.cig_contract) {
        qb.andWhere(`${alias}.cig_contract LIKE :cig_contract`, { cig_contract: `%${filters.cig_contract}%` });
      }
    }

    return qb.orderBy(`${alias}.id`, 'ASC').getMany();
  }

  async create(dto: CreateContractDto, userId?: number): Promise<Contract> {
    const { utility_ids, ...rest } = dto;

    return this.dataSource.transaction(async (manager) => {
      const entity = manager.create(Contract, {
        ...rest,
        ...(userId !== undefined && { created_by_user_id: userId, updated_by_user_id: userId }),
      });
      const saved = await manager.save(Contract, entity);

      if (utility_ids && utility_ids.length > 0) {
        const rows = utility_ids.map((utilityId: number) =>
          manager.create(ContractUtility, { contract_id: saved.id, utility_id: utilityId }),
        );
        try {
          await manager.save(ContractUtility, rows);
        } catch (error) {
          throw new BadRequestException(
            'Errore durante il salvataggio delle utenze associate: ' +
              (error instanceof Error ? error.message : String(error)),
          );
        }
      }

      return manager.findOne(Contract, {
        where: { id: saved.id },
        relations: toFindOptionsRelations<Contract>(this.relations),
      });
    });
  }

  async update(id: number, updateDto: UpdateContractDto, userId?: number): Promise<Contract> {
    const { utility_ids, ...rest } = updateDto;

    return this.dataSource.transaction(async (manager) => {
      const entity = await this.repo.findOne({ where: { id } as never });
      if (!entity) throw new BadRequestException('elemento non trovato');
      Object.assign(entity, rest);
      if (userId !== undefined) entity.updated_by_user_id = userId;
      await manager.save(Contract, entity);

      if (utility_ids !== undefined) {
        await manager.delete(ContractUtility, { contract_id: id });
        if (utility_ids.length > 0) {
          const rows = utility_ids.map((utilityId) =>
            manager.create(ContractUtility, { contract_id: id, utility_id: utilityId }),
          );
          await manager.save(ContractUtility, rows);
        }
      }

      return manager.findOne(Contract, {
        where: { id },
        relations: toFindOptionsRelations<Contract>(this.relations),
      });
    });
  }
}

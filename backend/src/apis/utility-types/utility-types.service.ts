import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BaseService } from '@apis/shared/base.service';
import { UtilityType } from './entity/utility_type.entity';
import { UtilityTypePurpose } from './entity/utility_type_purpose.entity';
import { CreateUtilityTypeDto } from './dto/create-utility-type.dto';
import { UpdateUtilityTypeDto } from './dto/update-utility-type.dto';
import { SearchUtilityTypeDto } from './dto/search-utility-type.dto';

@Injectable()
export class UtilityTypesService extends BaseService<
  UtilityType,
  CreateUtilityTypeDto,
  UpdateUtilityTypeDto
> {
  protected readonly entityName = 'utility_types';
  protected readonly relations = ['created_by', 'updated_by'];

  constructor(
    @InjectRepository(UtilityType)
    protected readonly repo: Repository<UtilityType>,
    @InjectRepository(UtilityTypePurpose)
    private readonly utilityTypePurposeRepo: Repository<UtilityTypePurpose>,
    private readonly dataSource: DataSource,
  ) {
    super();
  }

  async findAll(filter?: SearchUtilityTypeDto): Promise<UtilityType[]> {
    const alias = this.entityName;
    const qb = this.repo.createQueryBuilder(alias);
    qb.where(`${alias}.deleted = :deleted`, { deleted: filter?.deleted ?? false });
    qb.leftJoinAndSelect(`${alias}.purposes`, 'purpose', 'purpose.deleted = 0');

    if (filter) {
      Object.entries(filter).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '' || key === 'deleted') return;

        if (key === 'name' || key === 'description') {
          qb.andWhere(`${alias}.${key} LIKE :${key}`, { [key]: `%${value}%` });
        } else if (key === 'hard_type') {
          qb.andWhere(`${alias}.hard_type = :hard_type`, { hard_type: value });
        } else {
          qb.andWhere(`${alias}.${key} = :${key}`, { [key]: value });
        }
      });
    }

    return qb.orderBy(`${alias}.id`, 'ASC').getMany();
  }

  async create(dto: CreateUtilityTypeDto, userId?: number): Promise<UtilityType> {
    const { purposes, ...rest } = dto;

    let savedId: number;
    try {
      savedId = await this.dataSource.transaction(async (manager) => {
        const entity = manager.create(UtilityType, {
          ...rest,
          ...(userId !== undefined && { created_by_user_id: userId, updated_by_user_id: userId }),
        });
        const saved = await manager.save(UtilityType, entity);

        if (purposes && purposes.length > 0) {
          const rows = purposes.map((purposeId) =>
            manager.create(UtilityTypePurpose, {
              utility_type_id: saved.id,
              purpose_id: purposeId,
            }),
          );
          await manager.save(UtilityTypePurpose, rows);
        }

        return saved.id;
      });
    } catch (err) {
      this.manageErrors(err, `Errore durante la creazione di ${this.entityName}`);
    }

    return this.findOne(savedId);
  }

  async update(id: number, updateDto: UpdateUtilityTypeDto, userId?: number): Promise<UtilityType> {
    const { purposes, ...rest } = updateDto;

    return this.dataSource.transaction(async (manager) => {
      const entity = await this.repo.findOne({ where: { id } as never });
      if (!entity) throw new Error('elemento non trovato');
      Object.assign(entity, rest);
      if (userId !== undefined) entity.updated_by_user_id = userId;
      await manager.save(UtilityType, entity);

      if (purposes !== undefined) {
        await manager.delete(UtilityTypePurpose, { utility_type_id: id });
        if (purposes.length > 0) {
          const rows = purposes.map((purposeId) =>
            manager.create(UtilityTypePurpose, {
              utility_type_id: id,
              purpose_id: purposeId,
            }),
          );
          await manager.save(UtilityTypePurpose, rows);
        }
      }

      return this.findOne(id);
    });
  }
}

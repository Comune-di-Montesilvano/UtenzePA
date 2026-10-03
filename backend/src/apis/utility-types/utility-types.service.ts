import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseService } from '@apis/shared/base.service';
import { UtilityType } from './entity/utility_type.entity';
import { CreateUtilityTypeDto } from './dto/create-utility-type.dto';
import { UpdateUtilityTypeDto } from './dto/update-utility-type.dto';
import { SearchUtilityTypeDto } from './dto/search-utility-type.dto';
import { ARERA_CATEGORIES_BY_HARD_TYPE } from '@apis/utility/arera-category';
import { HardTypeEnum } from './enum/hard-type.enum';

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
  ) {
    super();
  }

  async findAll(filter?: SearchUtilityTypeDto): Promise<UtilityType[]> {
    const alias = this.entityName;
    const qb = this.repo.createQueryBuilder(alias);
    qb.where(`${alias}.deleted = :deleted`, { deleted: filter?.deleted ?? false });

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

  // Cambiare il tipo contatore lascerebbe le utenze già classificate con una
  // tipologia ARERA non più ammessa: la scheda utenza non riuscirebbe più a
  // salvarle (campo nascosto ma valorizzato). Si chiede di svuotarle prima.
  async update(id: number, dto: UpdateUtilityTypeDto, userId?: number): Promise<UtilityType> {
    if (dto.hard_type) {
      const allowed = ARERA_CATEGORIES_BY_HARD_TYPE[dto.hard_type] ?? [];
      const notIn = allowed.length ? ` AND arera_category NOT IN (${allowed.map(() => '?').join(', ')})` : '';
      // La categoria d'uso esiste solo per il gas.
      const gasUse = dto.hard_type !== HardTypeEnum.GAS ? ' OR gas_use_category IS NOT NULL' : '';
      const rows: { n: string | number }[] = await this.repo.manager.query(
        `SELECT COUNT(*) AS n FROM utilities
          WHERE utility_type_id_fk = ? AND deleted = 0
            AND ((arera_category IS NOT NULL${notIn})${gasUse})`,
        [id, ...allowed],
      );
      const n = Number(rows[0]?.n ?? 0);
      if (n > 0) {
        throw new BadRequestException(
          `Impossibile cambiare il tipo contatore: ${n} utenze hanno una tipologia ARERA o una categoria d'uso non compatibile. Svuotale prima.`,
        );
      }
    }
    return super.update(id, dto, userId);
  }
}

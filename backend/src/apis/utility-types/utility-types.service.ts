import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { ChapterDerivationService } from '@apis/spending-destinations/chapter-derivation.service';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, IsNull, Not, Repository } from 'typeorm';
import { BaseService } from '@apis/shared/base.service';
import { UtilityType } from './entity/utility_type.entity';
import { CreateUtilityTypeDto } from './dto/create-utility-type.dto';
import { UpdateUtilityTypeDto } from './dto/update-utility-type.dto';
import { SearchUtilityTypeDto } from './dto/search-utility-type.dto';
import { ARERA_CATEGORIES_BY_HARD_TYPE } from '@apis/utility/arera-category';
import { Utility } from '@apis/utility/entity/utility.entity';
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
    @Optional() private readonly derivation?: ChapterDerivationService,
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
      const own = { utility_type_id_fk: id, deleted: false };
      // NOT IN esclude già le righe NULL; senza categorie ammesse conta ogni categoria.
      const where: FindOptionsWhere<Utility>[] = [
        { ...own, arera_category: allowed.length ? Not(In(allowed)) : Not(IsNull()) },
      ];
      // La categoria d'uso esiste solo per il gas.
      if (dto.hard_type !== HardTypeEnum.GAS)
        where.push({ ...own, gas_use_category: Not(IsNull()) });
      const n = await this.repo.manager.getRepository(Utility).count({ where });
      if (n > 0) {
        throw new BadRequestException(
          `Impossibile cambiare il tipo contatore: ${n} utenze hanno una tipologia ARERA o una categoria d'uso non compatibile. Svuotale prima.`,
        );
      }
    }
    const result = await super.update(id, dto, userId);
    // La natura del capitolo segue il tipo contatore: capitoli ricalcolati.
    if (dto.hard_type !== undefined) await this.derivation?.requestAllSafe();
    return result;
  }
}

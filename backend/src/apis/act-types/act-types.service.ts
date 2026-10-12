import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseService } from '@apis/shared/base.service';
import { AuditAction } from '@apis/audit-log/entity/audit-log.entity';
import { Act } from '@apis/acts/entity/act.entity';
import { ActType } from './entity/act-type.entity';
import { CreateActTypeDto } from './dto/create-act-type.dto';
import { UpdateActTypeDto } from './dto/update-act-type.dto';

@Injectable()
export class ActTypesService extends BaseService<ActType, CreateActTypeDto, UpdateActTypeDto> {
  protected readonly entityName = 'act_types';
  protected readonly relations: string[] = [];

  constructor(
    @InjectRepository(ActType) protected readonly repo: Repository<ActType>,
    @InjectRepository(Act) private readonly actRepo: Repository<Act>,
  ) {
    super();
  }

  findAll(): Promise<ActType[]> {
    return this.repo.find({ where: { deleted: false }, order: { sort_order: 'ASC', name: 'ASC' } });
  }

  async create(dto: CreateActTypeDto, userId: number): Promise<ActType> {
    await this.assertNameFree(dto.name, null);
    return super.create(dto, userId);
  }

  async update(id: number, dto: UpdateActTypeDto, userId: number): Promise<ActType> {
    if (dto.name !== undefined) await this.assertNameFree(dto.name, id);
    return super.update(id, dto, userId);
  }

  async remove(id: number, userId: number): Promise<void> {
    const type = await this.repo.findOne({ where: { id, deleted: false } });
    if (!type) throw new BadRequestException('Tipo di atto non trovato');
    const used = await this.actRepo.count({ where: { act_type_id: id, deleted: false } });
    if (used > 0) {
      throw new BadRequestException(
        `Il tipo «${type.name}» è usato da ${used} atti: cambiane il tipo prima di eliminarlo`,
      );
    }
    await this.repo.save({ ...type, deleted: true, updated_by_user_id: userId });
    await this.recordAudit(AuditAction.DELETE, id, userId, []);
  }

  // Confronto senza maiuscole (collation MySQL), solo tra i non cancellati.
  private async assertNameFree(name: string, selfId: number | null): Promise<void> {
    const other = await this.repo.findOne({ where: { name: name.trim(), deleted: false } });
    if (other && other.id !== selfId) {
      throw new BadRequestException(`Esiste già un tipo di atto «${other.name}»`);
    }
  }
}

import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BaseService } from '@apis/shared/base.service';
import { AuditAction } from '@apis/audit-log/entity/audit-log.entity';
import { SpendingDestination } from './entity/spending-destination.entity';
import { CreateSpendingDestinationDto } from './dto/create-spending-destination.dto';
import { UpdateSpendingDestinationDto } from './dto/update-spending-destination.dto';
import * as q from './spending-destinations.queries';

export interface DestinationUsage {
  assets: number;
  plants: number;
  chapters: number;
  utilities: number;
}

const usageOf = (r: Record<string, unknown> | undefined): DestinationUsage => ({
  assets: Number(r?.assets ?? 0),
  plants: Number(r?.plants ?? 0),
  chapters: Number(r?.chapters ?? 0),
  utilities: Number(r?.utilities ?? 0),
});

@Injectable()
export class SpendingDestinationsService extends BaseService<
  SpendingDestination,
  CreateSpendingDestinationDto,
  UpdateSpendingDestinationDto
> {
  protected readonly entityName = 'spending_destinations';
  protected readonly relations: string[] = [];

  constructor(
    @InjectRepository(SpendingDestination)
    protected readonly repo: Repository<SpendingDestination>,
    private readonly dataSource: DataSource,
  ) {
    super();
  }

  async findAll(): Promise<(SpendingDestination & DestinationUsage)[]> {
    const rows = await this.repo.find({ where: { deleted: false }, order: { name: 'ASC' } });
    const usage = new Map(
      (await q.destinationUsage(this.dataSource.manager)).map((r) => [Number(r.id), r]),
    );
    return rows.map((d) => ({ ...d, ...usageOf(usage.get(d.id)) }));
  }

  async create(dto: CreateSpendingDestinationDto, userId: number): Promise<SpendingDestination> {
    await this.assertNameFree(dto.name, null);
    return super.create(dto, userId);
  }

  async update(
    id: number,
    dto: UpdateSpendingDestinationDto,
    userId: number,
  ): Promise<SpendingDestination> {
    if (dto.name !== undefined) await this.assertNameFree(dto.name, id);
    return super.update(id, dto, userId);
  }

  async remove(id: number, userId: number): Promise<void> {
    const destination = await this.repo.findOne({ where: { id, deleted: false } });
    if (!destination) throw new BadRequestException('Destinazione non trovata');
    const u = usageOf((await q.destinationUsage(this.dataSource.manager, [id]))[0]);
    if (u.assets + u.plants + u.chapters > 0) {
      throw new BadRequestException(
        `Destinazione in uso: ${u.assets} immobili, ${u.plants} impianti, ${u.chapters} capitoli`,
      );
    }
    await this.repo.save({ ...destination, deleted: true, updated_by_user_id: userId });
    await this.recordAudit(AuditAction.DELETE, id, userId, []);
  }

  // Confronto senza maiuscole (collation MySQL), solo tra i non cancellati.
  async assertNameFree(name: string, selfId: number | null): Promise<void> {
    const other = await this.repo.findOne({ where: { name: name.trim(), deleted: false } });
    if (other && other.id !== selfId) {
      throw new BadRequestException(`Destinazione già presente: «${other.name}»`);
    }
  }
}

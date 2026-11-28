import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BaseService } from '@apis/shared/base.service';
import { AuditAction } from '@apis/audit-log/entity/audit-log.entity';
import { SpendingDestination } from './entity/spending-destination.entity';
import { CreateSpendingDestinationDto } from './dto/create-spending-destination.dto';
import { UpdateSpendingDestinationDto } from './dto/update-spending-destination.dto';
import * as q from './spending-destinations.queries';
import { AuditLogService } from '@apis/audit-log/audit-log.service';
import { ChapterDerivationService } from './chapter-derivation.service';
import { DestinationSuggestion, suggestDestinations } from './destination-suggestions';

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
    @Optional() private readonly audit?: AuditLogService,
    @Optional() private readonly derivation?: ChapterDerivationService,
  ) {
    super();
  }

  async suggestions(): Promise<DestinationSuggestion[]> {
    const rows = await q.suggestionRows(this.dataSource.manager);
    return suggestDestinations(
      rows.map((r) => ({
        asset_id: Number(r.asset_id),
        label: String(r.label),
        destination_id: Number(r.destination_id),
      })),
    );
  }

  // Battesimo di più immobili in una volta (tab «Da battezzare»), con audit
  // sull'immobile; poi il capitolo delle utenze si ricalcola.
  async assignAssets(
    id: number,
    assetIds: number[],
    userId: number,
  ): Promise<{ assigned: number }> {
    const destination = await this.repo.findOne({ where: { id, deleted: false } });
    if (!destination) throw new BadRequestException('Destinazione non trovata');
    if (!assetIds.length) return { assigned: 0 };
    const m = this.dataSource.manager;
    const current = await q.assetDestinationsOf(m, assetIds);
    const changed = current.filter((a) => Number(a.spending_destination_id) !== id);
    const ids = changed.map((a) => Number(a.id));
    if (ids.length) {
      await q.setAssetDestination(m, ids, id, userId);
      for (const a of changed) {
        await this.audit?.record({
          entityName: 'assets',
          entityId: Number(a.id),
          action: AuditAction.UPDATE,
          userId,
          fields: [
            {
              fieldName: 'spending_destination_id',
              oldValue:
                a.spending_destination_id == null ? null : Number(a.spending_destination_id),
              newValue: id,
            },
          ],
        });
      }
      await this.derivation?.requestAllSafe();
    }
    return { assigned: ids.length };
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

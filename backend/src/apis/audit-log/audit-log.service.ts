import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, ObjectLiteral, Repository } from 'typeorm';
import { AuditLog, AuditAction } from './entity/audit-log.entity';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';
import { Asset } from '@apis/asset/entity/asset.entity';
import { Utility } from '@apis/utility/entity/utility.entity';

export interface AuditFieldChange {
  fieldName: string;
  oldValue: unknown;
  newValue: unknown;
  oldLabel?: string | null;
  newLabel?: string | null;
}

export interface RecordChangeInput {
  entityName: string;
  entityId: number;
  action: AuditAction;
  userId: number;
  fields?: AuditFieldChange[];
}

export type AuditLogEntryWithLabel = AuditLog & { entity_label: string | null };

export interface AuditLogQueryResult {
  items: AuditLogEntryWithLabel[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable()
export class AuditLogService {
  // Risolve entity_id a un'etichetta leggibile per la colonna "ID record"
  // del log globale — mappa esplicita, stesso principio delle label FK già
  // usate per i diff (mai euristica su nomi colonna). Solo le entità con un
  // dialog di dettaglio wired lato frontend (Task 10/11) hanno un resolver:
  // per le altre l'id numerico resta l'unica cosa mostrabile.
  private readonly entityLabelResolvers: Record<string, { repo: Repository<ObjectLiteral>; field: string }>;

  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
    @InjectRepository(Asset)
    private readonly assetRepo: Repository<Asset>,
    @InjectRepository(Utility)
    private readonly utilityRepo: Repository<Utility>,
  ) {
    this.entityLabelResolvers = {
      assets: { repo: this.assetRepo, field: 'asset_name' },
      utilities: { repo: this.utilityRepo, field: 'utility_id' },
    };
  }

  async record(input: RecordChangeInput): Promise<void> {
    if (input.action === AuditAction.UPDATE) {
      if (!input.fields || input.fields.length === 0) return;
      const rows = input.fields.map((f) =>
        this.repo.create({
          entity_name: input.entityName,
          entity_id: input.entityId,
          action: input.action,
          field_name: f.fieldName,
          old_value: this.stringify(f.oldValue),
          new_value: this.stringify(f.newValue),
          old_label: f.oldLabel ?? null,
          new_label: f.newLabel ?? null,
          user_id: input.userId,
        }),
      );
      await this.repo.save(rows);
      return;
    }

    await this.repo.save([
      this.repo.create({
        entity_name: input.entityName,
        entity_id: input.entityId,
        action: input.action,
        field_name: null,
        old_value: null,
        new_value: null,
        old_label: null,
        new_label: null,
        user_id: input.userId,
      }),
    ]);
  }

  async query(filters: QueryAuditLogDto): Promise<AuditLogQueryResult> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 10;

    const qb = this.repo
      .createQueryBuilder('audit_logs')
      .leftJoinAndSelect('audit_logs.user', 'user')
      .where('audit_logs.entity_name = :entityName', { entityName: filters.entity });

    if (filters.entityId !== undefined) {
      qb.andWhere('audit_logs.entity_id = :entityId', { entityId: filters.entityId });
    }
    if (filters.userId !== undefined) {
      qb.andWhere('audit_logs.user_id = :userId', { userId: filters.userId });
    }
    if (filters.dateFrom) {
      qb.andWhere('audit_logs.created_at >= :dateFrom', { dateFrom: filters.dateFrom });
    }
    if (filters.dateTo) {
      qb.andWhere('audit_logs.created_at <= :dateTo', { dateTo: filters.dateTo });
    }

    qb.orderBy('audit_logs.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [items, total] = await qb.getManyAndCount();
    const labels = await this.resolveEntityLabels(filters.entity, items.map((item) => item.entity_id));
    const itemsWithLabel: AuditLogEntryWithLabel[] = items.map((item) => ({
      ...item,
      entity_label: labels.get(item.entity_id) ?? null,
    }));
    return { items: itemsWithLabel, total, page, pageSize };
  }

  private async resolveEntityLabels(entityName: string, ids: number[]): Promise<Map<number, string>> {
    const map = new Map<number, string>();
    const resolver = this.entityLabelResolvers[entityName];
    if (!resolver || ids.length === 0) return map;

    const uniqueIds = Array.from(new Set(ids));
    const rows = await resolver.repo.find({ where: { id: In(uniqueIds) } as never });
    for (const row of rows) {
      const record = row as unknown as Record<string, unknown>;
      const value = record[resolver.field];
      if (value !== null && value !== undefined) {
        map.set(record.id as number, String(value));
      }
    }
    return map;
  }

  async purgeOlderThan(days: number): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const result = await this.repo
      .createQueryBuilder()
      .delete()
      .from(AuditLog)
      .where('field_name IS NOT NULL AND created_at < :cutoff', { cutoff })
      .execute();
    return result.affected ?? 0;
  }

  private stringify(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    return String(value);
  }
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog, AuditAction } from './entity/audit-log.entity';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';

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

export interface AuditLogQueryResult {
  items: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

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
    return { items, total, page, pageSize };
  }

  async purgeOlderThan(days: number): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const result = await this.repo
      .createQueryBuilder()
      .delete()
      .from(AuditLog)
      .where('created_at < :cutoff', { cutoff })
      .execute();
    return result.affected ?? 0;
  }

  private stringify(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    return String(value);
  }
}

import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditLogService, type RecordChangeInput } from '@apis/audit-log/audit-log.service';
import { AuditAction } from '@apis/audit-log/entity/audit-log.entity';
import { BudgetCommitment } from '@apis/budget-commitments/entity/budget-commitment.entity';
import { SYSTEM_USER_ID } from '@apis/system-users/system-user.constants';
import { AccountingDataService } from './accounting-data.service';
import { planCommitments } from './commitment-plan';
import * as q from './accounting-import.queries';
import { RecordSource } from './record-source.enum';
import { chapterKey } from './scope';

@Injectable()
export class CommitmentApplierService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly data: AccountingDataService,
    private readonly audit: AuditLogService,
  ) {}

  async apply(): Promise<Record<'created' | 'updated' | 'deleted', number>> {
    const [acc, scope, chapters, currentRows, suppliers] = await Promise.all([
      this.data.commitments(),
      this.data.scope(),
      q.liveChapters(this.dataSource.manager),
      q.currentCommitments(this.dataSource.manager),
      this.data.thirdPartiesByVat(),
    ]);
    const chapterIds = new Map<string, number>(
      chapters.map((c: { id: number; chapter_code: string; article: number }) => [
        chapterKey(c.chapter_code, Number(c.article)),
        Number(c.id),
      ]),
    );
    const coveredYears = new Set(acc.map((r) => r.fiscal_year));
    const changes = planCommitments(
      acc,
      scope.commitmentKeys,
      coveredYears,
      chapterIds,
      currentRows,
      suppliers,
    );
    const result = { created: 0, updated: 0, deleted: 0 };
    const audits: RecordChangeInput[] = [];
    const entry = (
      entityId: number,
      action: AuditAction,
      fields?: RecordChangeInput['fields'],
    ): RecordChangeInput => ({
      entityName: 'budget_commitments',
      entityId,
      action,
      userId: SYSTEM_USER_ID,
      ...(fields ? { fields } : {}),
    });

    await this.dataSource.transaction(async (manager) => {
      for (const change of changes) {
        if (change.kind === 'create') {
          const { identifiers } = await manager.insert(BudgetCommitment, {
            ...change.number,
            budget_chapter_id_fk: change.chapterId,
            supplier_id_fk: change.supplierId,
            source: RecordSource.ACCOUNTING,
            created_by_user_id: SYSTEM_USER_ID,
            updated_by_user_id: SYSTEM_USER_ID,
          } as never);
          const id = Number(identifiers[0].id);
          await q.upsertYears(manager, id, change.years);
          audits.push(entry(id, AuditAction.CREATE));
          result.created++;
        } else if (change.kind === 'update') {
          if (Object.keys(change.values).length) {
            await manager.update(BudgetCommitment, change.id, {
              ...change.values,
              updated_by_user_id: SYSTEM_USER_ID,
            } as never);
          }
          if (change.years.upsert.length) {
            await q.upsertYears(manager, change.id, change.years.upsert);
          }
          if (change.years.delete.length) {
            await q.dropManualSplits(manager, change.id, change.years.delete);
            await q.dropCommitmentShares(manager, change.id, change.years.delete);
            await q.dropYears(manager, change.id, change.years.delete);
          }
          audits.push(entry(change.id, AuditAction.UPDATE, change.fields));
          result.updated++;
        } else {
          await q.dropManualSplits(manager, change.id);
          await q.dropCommitmentShares(manager, change.id);
          await manager.update(BudgetCommitment, change.id, {
            deleted: true,
            updated_by_user_id: SYSTEM_USER_ID,
          } as never);
          audits.push(entry(change.id, AuditAction.DELETE));
          result.deleted++;
        }
      }
    });
    for (const item of audits) await this.audit.record(item);
    return result;
  }
}

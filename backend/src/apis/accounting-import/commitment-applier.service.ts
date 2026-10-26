import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditLogService, type RecordChangeInput } from '@apis/audit-log/audit-log.service';
import { AuditAction } from '@apis/audit-log/entity/audit-log.entity';
import { BudgetCommitment } from '@apis/budget-commitments/entity/budget-commitment.entity';
import { SYSTEM_USER_ID } from '@apis/system-users/system-user.constants';
import { AccountingDataService } from './accounting-data.service';
import { planCommitments, type CurrentCommitment } from './commitment-plan';
import { RecordSource } from './record-source.enum';
import { chapterKey } from './scope';

const CURRENT_SQL =
  'SELECT bc.id, bc.commitment_year, bc.commitment_num, bc.commitment_sub, bc.budget_chapter_id_fk, ' +
  'bc.supplier_id_fk, bc.source, (SELECT JSON_ARRAYAGG(JSON_OBJECT("fiscal_year", y.fiscal_year, ' +
  '"amount", y.amount, "source", y.source)) FROM budget_commitment_years y WHERE y.commitment_id = bc.id) AS years ' +
  'FROM budget_commitments bc WHERE bc.deleted = 0';
const YEARS_UPSERT_SQL =
  'INSERT INTO budget_commitment_years (commitment_id, fiscal_year, amount, source) VALUES ? ' +
  'ON DUPLICATE KEY UPDATE amount = VALUES(amount), source = VALUES(source)';
// Quote automatiche e a mano dell'impegno (o di una sua annualità) tolte prima
// della cancellazione: le fatture tornano all'automatico col ricalcolo.
const SHARES_DELETE_SQL =
  "DELETE FROM invoice_commitment_shares WHERE commitment_id_fk = ? AND source IN ('AUTO', 'MANUAL')";
const YEAR_SHARES_DELETE_SQL =
  "DELETE FROM invoice_commitment_shares WHERE commitment_id_fk = ? AND fiscal_year IN (?) AND source IN ('AUTO', 'MANUAL')";
const YEARS_DELETE_SQL =
  'DELETE FROM budget_commitment_years WHERE commitment_id = ? AND fiscal_year IN (?)';

const toCurrent = (r: Record<string, unknown>): CurrentCommitment => {
  const years = typeof r.years === 'string' ? JSON.parse(r.years) : (r.years ?? []);
  return {
    id: Number(r.id),
    commitment_year: Number(r.commitment_year),
    commitment_num: Number(r.commitment_num),
    commitment_sub: Number(r.commitment_sub),
    budget_chapter_id_fk: Number(r.budget_chapter_id_fk),
    supplier_id_fk:
      r.supplier_id_fk === null || r.supplier_id_fk === undefined ? null : Number(r.supplier_id_fk),
    source: r.source as RecordSource,
    years: (
      years as { fiscal_year: number; amount: string | number | null; source: RecordSource }[]
    ).map((y) => ({
      fiscal_year: Number(y.fiscal_year),
      amount: y.amount === null ? null : Number(y.amount),
      source: y.source,
    })),
  };
};

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
      this.dataSource.query(
        'SELECT id, chapter_code, article FROM budget_chapters WHERE deleted = 0',
      ),
      this.dataSource.query(CURRENT_SQL),
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
      currentRows.map(toCurrent),
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
          await manager.query(YEARS_UPSERT_SQL, [
            change.years.map((y) => [id, y.fiscal_year, y.amount, RecordSource.ACCOUNTING]),
          ]);
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
            await manager.query(YEARS_UPSERT_SQL, [
              change.years.upsert.map((y) => [
                change.id,
                y.fiscal_year,
                y.amount,
                RecordSource.ACCOUNTING,
              ]),
            ]);
          }
          if (change.years.delete.length) {
            await manager.query(YEAR_SHARES_DELETE_SQL, [change.id, change.years.delete]);
            await manager.query(YEARS_DELETE_SQL, [change.id, change.years.delete]);
          }
          audits.push(entry(change.id, AuditAction.UPDATE, change.fields));
          result.updated++;
        } else {
          await manager.query(SHARES_DELETE_SQL, [change.id]);
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

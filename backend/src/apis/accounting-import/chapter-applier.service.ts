import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditLogService, type RecordChangeInput } from '@apis/audit-log/audit-log.service';
import { AuditAction } from '@apis/audit-log/entity/audit-log.entity';
import { BudgetChapter } from '@apis/budget-chapters/entity/budgetChapter.entity';
import { BudgetChapterSpending } from '@apis/budget-chapter-spending/entity/budget-chapter-spending.entity';
import { SYSTEM_USER_ID } from '@apis/system-users/system-user.constants';
import { AccountingDataService } from './accounting-data.service';
import { planChapters, type CurrentSpending } from './chapter-plan';
import { RecordSource } from './record-source.enum';
import { chapterKey } from './scope';
import * as q from './accounting-import.queries';

@Injectable()
export class ChapterApplierService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly data: AccountingDataService,
    private readonly audit: AuditLogService,
  ) {}

  async apply(): Promise<Record<'chaptersCreated' | 'created' | 'updated' | 'deleted', number>> {
    const [acc, scope, chapters, spending, liquidatedRows] = await Promise.all([
      this.data.chapters(),
      this.data.scope(),
      q.liveChapters(this.dataSource.manager),
      q.liveSpending(this.dataSource.manager),
      q.liquidatedByChapter(this.dataSource.manager),
    ]);
    const liquidated = new Map<string, number>(
      liquidatedRows.map(
        (r: { chapter: string; article: number; fiscal_year: number; total: string }) => [
          `${chapterKey(String(r.chapter), Number(r.article))}:${r.fiscal_year}`,
          Math.round(Number(r.total) * 100) / 100,
        ],
      ),
    );
    const current = chapters.map((c: { id: number; chapter_code: string; article: number }) => ({
      id: Number(c.id),
      chapter_code: c.chapter_code,
      article: Number(c.article),
    }));
    const changes = planChapters(
      acc,
      scope.chapterKeys,
      current,
      spending as CurrentSpending[],
      liquidated,
    );
    const result = { chaptersCreated: 0, created: 0, updated: 0, deleted: 0 };
    const audits: RecordChangeInput[] = [];
    const chapterIds = new Map<string, number>(
      current.map((c: { id: number; chapter_code: string; article: number }) => [
        chapterKey(c.chapter_code, c.article),
        c.id,
      ]),
    );
    const who = { created_by_user_id: SYSTEM_USER_ID, updated_by_user_id: SYSTEM_USER_ID };

    await this.dataSource.transaction(async (manager) => {
      for (const change of changes) {
        switch (change.kind) {
          case 'createChapter': {
            const { identifiers } = await manager.insert(BudgetChapter, {
              chapter_code: change.chapter,
              article: change.article,
              description: change.description,
              source: RecordSource.ACCOUNTING,
              ...who,
            } as never);
            const id = Number(identifiers[0].id);
            chapterIds.set(chapterKey(change.chapter, change.article), id);
            audits.push({
              entityName: 'budget_chapters',
              entityId: id,
              action: AuditAction.CREATE,
              userId: SYSTEM_USER_ID,
            });
            result.chaptersCreated++;
            break;
          }
          case 'createSpending': {
            const { identifiers } = await manager.insert(BudgetChapterSpending, {
              budget_chapter_id_fk: chapterIds.get(change.chapterKey),
              year: change.year,
              ...change.values,
              ...who,
            } as never);
            audits.push({
              entityName: 'budget_chapter_spending',
              entityId: Number(identifiers[0].id),
              action: AuditAction.CREATE,
              userId: SYSTEM_USER_ID,
            });
            result.created++;
            break;
          }
          case 'updateSpending':
            await manager.update(BudgetChapterSpending, change.id, {
              ...change.values,
              updated_by_user_id: SYSTEM_USER_ID,
            } as never);
            audits.push({
              entityName: 'budget_chapter_spending',
              entityId: change.id,
              action: AuditAction.UPDATE,
              userId: SYSTEM_USER_ID,
              fields: change.fields,
            });
            result.updated++;
            break;
          case 'deleteSpending':
            await manager.update(BudgetChapterSpending, change.id, {
              deleted: true,
              updated_by_user_id: SYSTEM_USER_ID,
            } as never);
            audits.push({
              entityName: 'budget_chapter_spending',
              entityId: change.id,
              action: AuditAction.DELETE,
              userId: SYSTEM_USER_ID,
            });
            result.deleted++;
            break;
        }
      }
    });
    for (const entry of audits) await this.audit.record(entry);
    return result;
  }
}

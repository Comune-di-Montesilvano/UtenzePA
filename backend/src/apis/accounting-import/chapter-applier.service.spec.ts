import { AuditAction } from '@apis/audit-log/entity/audit-log.entity';
import { BudgetChapter } from '@apis/budget-chapters/entity/budgetChapter.entity';
import { BudgetChapterSpending } from '@apis/budget-chapter-spending/entity/budget-chapter-spending.entity';
import { SYSTEM_USER_ID } from '@apis/system-users/system-user.constants';
import { ChapterApplierService } from './chapter-applier.service';
import { RecordSource } from './record-source.enum';

function setup(current: { chapters: unknown[]; spending: unknown[] }) {
  const inserts: { entity: unknown; values: Record<string, unknown> }[] = [];
  const updates: { entity: unknown; id: number; values: Record<string, unknown> }[] = [];
  let nextId = 100;
  const manager = {
    insert: jest.fn(async (entity: unknown, values: Record<string, unknown>) => {
      inserts.push({ entity, values });
      return { identifiers: [{ id: nextId++ }] };
    }),
    update: jest.fn(async (entity: unknown, id: number, values: Record<string, unknown>) => {
      updates.push({ entity, id, values });
    }),
  };
  const dataSource = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM budget_chapters')) return current.chapters;
      if (sql.includes('FROM budget_chapter_spending')) return current.spending;
      if (sql.includes('FROM acc_liquidations'))
        return [{ chapter: '200', article: 0, fiscal_year: 2026, total: '30.5' }];
      return [];
    }),
    transaction: jest.fn(async (cb: (m: typeof manager) => Promise<unknown>) => cb(manager)),
  };
  const data = {
    chapters: jest.fn(async () => [
      {
        year: 2026,
        chapter: '200',
        article: 0,
        description: 'NUOVO',
        initial_budget: 10,
        adjusted_budget: 20,
        spent: null,
      },
    ]),
    scope: jest.fn(async () => ({
      chapterKeys: new Set(['200/0', '100/0']),
      commitmentKeys: new Set<string>(),
    })),
  };
  const audit = { record: jest.fn(async () => undefined) };
  const service = new ChapterApplierService(dataSource as never, data as never, audit as never);
  return { service, inserts, updates, audit };
}

describe('ChapterApplierService', () => {
  it('crea il capitolo e la sua spesa con l utente di sistema, audit CREATE', async () => {
    const { service, inserts, audit } = setup({
      chapters: [{ id: 7, chapter_code: '100', article: 0 }],
      spending: [],
    });
    const result = await service.apply();
    expect(inserts[0]).toEqual({
      entity: BudgetChapter,
      values: expect.objectContaining({
        chapter_code: '200',
        article: 0,
        description: 'NUOVO',
        source: RecordSource.ACCOUNTING,
        created_by_user_id: SYSTEM_USER_ID,
        updated_by_user_id: SYSTEM_USER_ID,
      }),
    });
    expect(inserts[1]).toEqual({
      entity: BudgetChapterSpending,
      values: expect.objectContaining({
        budget_chapter_id_fk: 100,
        year: 2026,
        amount: 30.5,
        created_by_user_id: SYSTEM_USER_ID,
      }),
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityName: 'budget_chapters',
        entityId: 100,
        action: AuditAction.CREATE,
        userId: SYSTEM_USER_ID,
      }),
    );
    expect(result).toEqual({ chaptersCreated: 1, created: 1, updated: 0, deleted: 0 });
  });

  it('cancella le righe di spesa che la contabilità non ha, audit DELETE', async () => {
    const { service, updates, audit } = setup({
      chapters: [
        { id: 7, chapter_code: '100', article: 0 },
        { id: 8, chapter_code: '200', article: 0 },
      ],
      spending: [
        {
          id: 5,
          budget_chapter_id_fk: 7,
          year: 2026,
          initial_budget: null,
          adjusted_budget: null,
          amount: '3',
          source: 'MANUAL',
        },
        {
          id: 6,
          budget_chapter_id_fk: 8,
          year: 2026,
          initial_budget: '10',
          adjusted_budget: '20',
          amount: '30.5',
          source: 'ACCOUNTING',
        },
      ],
    });
    const result = await service.apply();
    expect(updates).toEqual([
      {
        entity: BudgetChapterSpending,
        id: 5,
        values: { deleted: true, updated_by_user_id: SYSTEM_USER_ID },
      },
    ]);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityName: 'budget_chapter_spending',
        entityId: 5,
        action: AuditAction.DELETE,
      }),
    );
    expect(result).toEqual({ chaptersCreated: 0, created: 0, updated: 0, deleted: 1 });
  });
});

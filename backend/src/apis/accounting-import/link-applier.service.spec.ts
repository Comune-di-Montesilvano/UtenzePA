import { AuditAction } from '@apis/audit-log/entity/audit-log.entity';
import { SYSTEM_USER_ID } from '@apis/system-users/system-user.constants';
import { LinkApplierService } from './link-applier.service';

function setup() {
  const queries: { sql: string; params: unknown[] }[] = [];
  const manager = {
    query: jest.fn(async (sql: string, params: unknown[]) => {
      queries.push({ sql, params });
    }),
  };
  const routes: Record<string, unknown[]> = {
    l_commitments: [{ id: 1, commitment_year: 2026, commitment_num: 1, commitment_sub: 1 }],
    l_links: [],
    l_contracts: [{ id: 5, cig_contract: 'CIG1' }],
    l_paid: [],
    l_utility_rows: [{ utility_id: 30, fiscal_year: 2026, chapter_id: 7 }],
    l_utilities: [{ id: 30, budget_chapter_code_fk: null }],
  };
  const dataSource = {
    query: jest.fn(async (sql: string) => routes[/\/\* (l_\w+) \*\//.exec(sql)?.[1] ?? ''] ?? []),
    transaction: jest.fn(async (cb: (m: typeof manager) => Promise<unknown>) => cb(manager)),
  };
  const data = {
    commitments: jest.fn(async () => [
      {
        commitment_year: 2026,
        commitment_num: 1,
        commitment_sub: 1,
        fiscal_year: 2026,
        cig: 'CIG1',
        cancelled: false,
      },
    ]),
  };
  const audit = { record: jest.fn(async () => undefined) };
  const service = new LinkApplierService(dataSource as never, data as never, audit as never);
  return { service, queries, audit };
}

describe('LinkApplierService', () => {
  it('collega il contratto dal CIG e aggiorna il capitolo dell utenza con audit', async () => {
    const { service, queries, audit } = setup();
    expect(await service.apply()).toEqual({ contractsLinked: 1, utilityChapters: 1 });
    expect(queries[0].params).toEqual([[[1, 5]]]);
    expect(queries[1].params).toEqual([7, SYSTEM_USER_ID, 30]);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityName: 'utilities',
        entityId: 30,
        action: AuditAction.UPDATE,
        userId: SYSTEM_USER_ID,
        fields: [{ fieldName: 'budget_chapter_code_fk', oldValue: null, newValue: 7 }],
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityName: 'budget_commitments',
        entityId: 1,
        action: AuditAction.UPDATE,
      }),
    );
  });
});

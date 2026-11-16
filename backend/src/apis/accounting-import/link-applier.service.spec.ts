import { AuditAction } from '@apis/audit-log/entity/audit-log.entity';
import { SYSTEM_USER_ID } from '@apis/system-users/system-user.constants';
import { LinkApplierService } from './link-applier.service';
import * as q from './accounting-import.queries';

jest.mock('./accounting-import.queries');
const mq = jest.mocked(q);

function setup() {
  // Letture simulate e scritture registrate per nome (query provate in
  // accounting-import.int-spec.ts).
  const writes: [string, ...unknown[]][] = [];
  mq.accountingCommitments.mockResolvedValue([
    { id: 1, commitment_year: 2026, commitment_num: 1, commitment_sub: 1 },
  ]);
  mq.commitmentContracts.mockResolvedValue([]);
  mq.contractsWithCig.mockResolvedValue([{ id: 5, supplier_id_fk: 2, cig_contract: 'CIG1' }]);
  mq.paidContracts.mockResolvedValue([]);
  mq.paidUtilityChapters.mockResolvedValue([{ utility_id: 30, fiscal_year: 2026, chapter_id: 7 }]);
  mq.utilityChapters.mockResolvedValue([{ id: 30, budget_chapter_code_fk: null }]);
  mq.linkContracts.mockImplementation(async (_m, commitmentId, contractIds) => {
    writes.push(['linkContracts', commitmentId, contractIds]);
  });
  mq.setUtilityChapter.mockImplementation(async (_m, utilityId, chapterId, userId) => {
    writes.push(['setUtilityChapter', utilityId, chapterId, userId]);
  });
  const manager = {};
  const dataSource = {
    manager,
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
  return { service, writes, audit };
}

describe('LinkApplierService', () => {
  it('collega il contratto dal CIG e aggiorna il capitolo dell utenza con audit', async () => {
    const { service, writes, audit } = setup();
    expect(await service.apply()).toEqual({ contractsLinked: 1, utilityChapters: 1 });
    expect(writes).toEqual([
      ['linkContracts', 1, [5]],
      ['setUtilityChapter', 30, 7, SYSTEM_USER_ID],
    ]);
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

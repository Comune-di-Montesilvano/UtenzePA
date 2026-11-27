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
  mq.linkContracts.mockImplementation(async (_m, commitmentId, contractIds) => {
    writes.push(['linkContracts', commitmentId, contractIds]);
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
  it('collega il contratto dal CIG; il capitolo delle utenze non lo scrive più (viene dalla destinazione)', async () => {
    const { service, writes, audit } = setup();
    expect(await service.apply()).toEqual({ contractsLinked: 1 });
    expect(writes).toEqual([['linkContracts', 1, [5]]]);
    expect(audit.record).not.toHaveBeenCalledWith(
      expect.objectContaining({ entityName: 'utilities' }),
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

import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditLogService, type RecordChangeInput } from '@apis/audit-log/audit-log.service';
import { AuditAction } from '@apis/audit-log/entity/audit-log.entity';
import { SYSTEM_USER_ID } from '@apis/system-users/system-user.constants';
import { AccountingDataService } from './accounting-data.service';
import { planCommitmentContracts } from './link-plan';
import { commitmentKey } from './scope';
import * as q from './accounting-import.queries';

const groupIds = (
  rows: Record<string, unknown>[],
  key: string,
  value: string,
): Map<number, number[]> => {
  const map = new Map<number, number[]>();
  for (const r of rows)
    map.set(Number(r[key]), [...(map.get(Number(r[key])) ?? []), Number(r[value])]);
  return map;
};

// Collegamenti dopo le quote: contratti degli impegni della contabilità (dal
// CIG e dalle fatture pagate). Il capitolo delle utenze non si scrive più: viene
// dalla destinazione di spesa (spending-destinations/chapter-derivation.ts).
@Injectable()
export class LinkApplierService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly data: AccountingDataService,
    private readonly audit: AuditLogService,
  ) {}

  async apply(): Promise<Record<'contractsLinked', number>> {
    const [acc, commitments, links, contracts, paid] = await Promise.all([
      this.data.commitments(),
      q.accountingCommitments(this.dataSource.manager),
      q.commitmentContracts(this.dataSource.manager),
      q.contractsWithCig(this.dataSource.manager),
      q.paidContracts(this.dataSource.manager),
    ]);
    // CIG dell'impegno: quello dell'anno di competenza più recente che lo indica.
    const cigByKey = new Map<string, string>();
    for (const row of [...acc].sort((a, b) => a.fiscal_year - b.fiscal_year)) {
      if (row.cig && !row.cancelled) cigByKey.set(commitmentKey(row), row.cig);
    }
    const linked = groupIds(links, 'commitment_id', 'contract_id');
    const contractsByCig = new Map<string, number[]>();
    for (const c of contracts as { id: number; cig_contract: string }[]) {
      contractsByCig.set(c.cig_contract, [
        ...(contractsByCig.get(c.cig_contract) ?? []),
        Number(c.id),
      ]);
    }

    const contractPlan = planCommitmentContracts(
      (commitments as Record<string, unknown>[]).map((c) => ({
        id: Number(c.id),
        cig:
          cigByKey.get(
            commitmentKey({
              commitment_year: Number(c.commitment_year),
              commitment_num: Number(c.commitment_num),
              commitment_sub: Number(c.commitment_sub),
            }),
          ) ?? null,
        contractIds: linked.get(Number(c.id)) ?? [],
      })),
      contractsByCig,
      groupIds(paid, 'commitment_id', 'contract_id'),
    );

    const audits: RecordChangeInput[] = [];
    await this.dataSource.transaction(async (manager) => {
      for (const { commitmentId, add } of contractPlan) {
        await q.linkContracts(manager, commitmentId, add);
        const before = linked.get(commitmentId) ?? [];
        audits.push({
          entityName: 'budget_commitments',
          entityId: commitmentId,
          action: AuditAction.UPDATE,
          userId: SYSTEM_USER_ID,
          fields: [
            {
              fieldName: 'contract_ids',
              oldValue: before.join(', '),
              newValue: [...before, ...add].join(', '),
            },
          ],
        });
      }
    });
    for (const entry of audits) await this.audit.record(entry);
    return { contractsLinked: contractPlan.length };
  }
}

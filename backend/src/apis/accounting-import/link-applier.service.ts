import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditLogService, type RecordChangeInput } from '@apis/audit-log/audit-log.service';
import { AuditAction } from '@apis/audit-log/entity/audit-log.entity';
import { SYSTEM_USER_ID } from '@apis/system-users/system-user.constants';
import { AccountingDataService } from './accounting-data.service';
import { planCommitmentContracts, planUtilityChapters } from './link-plan';
import { RecordSource } from './record-source.enum';
import { commitmentKey } from './scope';

const COMMITMENTS_SQL =
  '/* l_commitments */ SELECT id, commitment_year, commitment_num, commitment_sub FROM budget_commitments ' +
  `WHERE deleted = 0 AND source = '${RecordSource.ACCOUNTING}'`;
const LINKS_SQL =
  '/* l_links */ SELECT commitment_id, contract_id FROM budget_commitment_contracts';
const CONTRACTS_SQL =
  '/* l_contracts */ SELECT id, cig_contract FROM contracts WHERE deleted = 0 AND cig_contract IS NOT NULL';
// Contratti delle fatture pagate, per impegno.
const PAID_SQL =
  '/* l_paid */ SELECT DISTINCT s.commitment_id_fk AS commitment_id, i.contratto_id_fk AS contract_id ' +
  "FROM invoice_commitment_shares s JOIN invoices i ON i.id = s.invoice_id_fk WHERE s.source = 'ACCOUNTING' " +
  'AND i.deleted = 0 AND i.contratto_id_fk IS NOT NULL';
// Utenze delle righe delle fatture pagate, con capitolo e anno delle quote.
const UTILITY_ROWS_SQL =
  '/* l_utility_rows */ SELECT DISTINCT l.utility_id_fk AS utility_id, s.fiscal_year, ' +
  'bc.budget_chapter_id_fk AS chapter_id FROM invoice_commitment_shares s ' +
  'JOIN budget_commitments bc ON bc.id = s.commitment_id_fk JOIN invoices i ON i.id = s.invoice_id_fk ' +
  'JOIN invoice_lines l ON l.invoice_id_fk = i.id ' +
  "WHERE s.source = 'ACCOUNTING' AND i.deleted = 0 AND l.utility_id_fk IS NOT NULL";
const UTILITIES_SQL =
  '/* l_utilities */ SELECT id, budget_chapter_code_fk FROM utilities WHERE deleted = 0';
const LINK_INSERT_SQL =
  'INSERT INTO budget_commitment_contracts (commitment_id, contract_id) VALUES ?';
const UTILITY_CHAPTER_SQL =
  'UPDATE utilities SET budget_chapter_code_fk = ?, updated_by_user_id = ?, update_date = CURRENT_TIMESTAMP(6) WHERE id = ?';

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
// CIG e dalle fatture pagate) e capitolo delle utenze delle fatture pagate.
@Injectable()
export class LinkApplierService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly data: AccountingDataService,
    private readonly audit: AuditLogService,
  ) {}

  async apply(): Promise<Record<'contractsLinked' | 'utilityChapters', number>> {
    const [acc, commitments, links, contracts, paid, utilityRows, utilities] = await Promise.all([
      this.data.commitments(),
      this.dataSource.query(COMMITMENTS_SQL),
      this.dataSource.query(LINKS_SQL),
      this.dataSource.query(CONTRACTS_SQL),
      this.dataSource.query(PAID_SQL),
      this.dataSource.query(UTILITY_ROWS_SQL),
      this.dataSource.query(UTILITIES_SQL),
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
    const current = new Map<number, number | null>(
      (utilities as Record<string, unknown>[]).map((u) => [
        Number(u.id),
        u.budget_chapter_code_fk === null ? null : Number(u.budget_chapter_code_fk),
      ]),
    );
    const chapterPlan = planUtilityChapters(
      (utilityRows as Record<string, unknown>[])
        .map((r) => ({
          utility_id: Number(r.utility_id),
          fiscal_year: Number(r.fiscal_year),
          chapter_id: Number(r.chapter_id),
        }))
        .filter((r) => current.has(r.utility_id)),
      current,
    );

    const audits: RecordChangeInput[] = [];
    await this.dataSource.transaction(async (manager) => {
      for (const { commitmentId, add } of contractPlan) {
        await manager.query(LINK_INSERT_SQL, [add.map((contractId) => [commitmentId, contractId])]);
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
      for (const { utilityId, chapterId } of chapterPlan) {
        await manager.query(UTILITY_CHAPTER_SQL, [chapterId, SYSTEM_USER_ID, utilityId]);
        audits.push({
          entityName: 'utilities',
          entityId: utilityId,
          action: AuditAction.UPDATE,
          userId: SYSTEM_USER_ID,
          fields: [
            {
              fieldName: 'budget_chapter_code_fk',
              oldValue: current.get(utilityId) ?? null,
              newValue: chapterId,
            },
          ],
        });
      }
    });
    for (const entry of audits) await this.audit.record(entry);
    return { contractsLinked: contractPlan.length, utilityChapters: chapterPlan.length };
  }
}

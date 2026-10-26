import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AccountingDataService } from './accounting-data.service';
import { AccountingInvoiceService } from './accounting-invoice.service';
import { commitmentKey } from './scope';
import { planShares, type CurrentShare } from './share-plan';

const SHARES_INSERT_SQL =
  'INSERT INTO invoice_commitment_shares (invoice_id_fk, commitment_id_fk, fiscal_year, amount, source) VALUES ?';

// Quote ACCOUNTING sulle fatture abbinate alle liquidazioni. Mai miste: le
// ACCOUNTING sostituiscono automatiche e a mano. Nessun audit né «Ultima
// modifica», come per le quote automatiche.
@Injectable()
export class ShareApplierService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly data: AccountingDataService,
    private readonly invoices: AccountingInvoiceService,
  ) {}

  async apply(): Promise<Record<'invoices' | 'cleared', number>> {
    const [liquidations, matched, commitments, current] = await Promise.all([
      this.data.liquidations(),
      this.invoices.matchedByKey(),
      this.dataSource.query(
        'SELECT id, commitment_year, commitment_num, commitment_sub FROM budget_commitments WHERE deleted = 0 ' +
          'AND commitment_num IS NOT NULL',
      ),
      this.dataSource.query(
        'SELECT invoice_id_fk, commitment_id_fk, fiscal_year, amount, source FROM invoice_commitment_shares',
      ),
    ]);
    const commitmentIds = new Map<string, number>(
      commitments.map((c: Record<string, unknown>) => [
        commitmentKey({
          commitment_year: Number(c.commitment_year),
          commitment_num: Number(c.commitment_num),
          commitment_sub: Number(c.commitment_sub),
        }),
        Number(c.id),
      ]),
    );
    const plan = planShares(
      liquidations,
      matched,
      commitmentIds,
      (current as CurrentShare[]).map((s) => ({ ...s, invoice_id_fk: Number(s.invoice_id_fk) })),
    );
    const result = { invoices: 0, cleared: 0 };
    await this.dataSource.transaction(async (manager) => {
      for (const { invoiceId, shares } of plan) {
        if (!shares.length) {
          await manager.query(
            "DELETE FROM invoice_commitment_shares WHERE invoice_id_fk = ? AND source = 'ACCOUNTING'",
            [invoiceId],
          );
          result.cleared++;
          continue;
        }
        await manager.query('DELETE FROM invoice_commitment_shares WHERE invoice_id_fk = ?', [invoiceId]);
        await manager.query(SHARES_INSERT_SQL, [
          shares.map((s) => [invoiceId, s.commitment_id_fk, s.fiscal_year, s.amount, 'ACCOUNTING']),
        ]);
        result.invoices++;
      }
    });
    return result;
  }
}

import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AccountingDataService } from './accounting-data.service';
import { AccountingInvoiceService } from './accounting-invoice.service';
import { commitmentKey } from './scope';
import { planShares, type CurrentShare } from './share-plan';
import * as q from './accounting-import.queries';

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
      q.numberedCommitments(this.dataSource.manager),
      q.allShares(this.dataSource.manager),
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
        await q.replaceShares(manager, invoiceId, shares);
        if (!shares.length) {
          result.cleared++;
          continue;
        }
        result.invoices++;
      }
    });
    return result;
  }
}

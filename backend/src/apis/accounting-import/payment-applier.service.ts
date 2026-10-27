import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { PaymentStatus } from '@apis/invoices/enum/payment-status.enum';
import { NOT_REJECTED_SQL } from '@apis/invoices/sdi-status';
import type { AccountingRunContext } from './accounting-import.service';
import { AccountingDataService } from './accounting-data.service';
import { AccountingInvoiceService } from './accounting-invoice.service';
import { planPayments, type PaymentInvoice } from './payment-plan';

const INVOICES_SQL =
  "/* p_invoices */ SELECT i.id, DATE_FORMAT(i.invoice_date, '%Y-%m-%d') AS invoice_date, i.total_amount, " +
  `(i.deleted = 1 OR NOT ${NOT_REJECTED_SQL('i')}) AS excluded, i.payment_status, ` +
  "DATE_FORMAT(i.paid_on, '%Y-%m-%d') AS paid_on FROM invoices i";
const CHUNK = 500;

// Stato del pagamento delle fatture e fattura di ogni liquidazione (per il
// dettaglio nella scheda). Scrittura di sistema: niente audit né «Ultima
// modifica», come lo stato SDI.
@Injectable()
export class PaymentApplierService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly data: AccountingDataService,
    private readonly invoices: AccountingInvoiceService,
  ) {}

  async apply(ctx: AccountingRunContext): Promise<Record<'linked' | 'changed', number>> {
    const [liquidations, matched, rows, creditNotes] = await Promise.all([
      this.data.liquidations(),
      this.invoices.matchedByKey(),
      this.dataSource.query(INVOICES_SQL),
      this.invoices.creditNoteLinks(),
    ]);
    const invoices: PaymentInvoice[] = rows.map((r: Record<string, unknown>) => ({
      id: Number(r.id),
      invoice_date: String(r.invoice_date),
      total_amount: r.total_amount === null ? null : Number(r.total_amount),
      excluded: !!Number(r.excluded),
      payment_status: (r.payment_status as PaymentStatus | null) ?? null,
      paid_on: (r.paid_on as string | null) ?? null,
    }));
    const changes = planPayments(
      liquidations,
      matched,
      invoices,
      ctx.fromYear,
      new Date().getFullYear(),
      creditNotes,
    );
    const links = [...matched];
    await this.dataSource.transaction(async (manager) => {
      await manager.query('UPDATE acc_liquidations SET invoice_id_fk = NULL');
      for (let i = 0; i < links.length; i += CHUNK) {
        const chunk = links.slice(i, i + CHUNK);
        await manager.query(
          `UPDATE acc_liquidations SET invoice_id_fk = CASE liquidation_key ${chunk.map(() => 'WHEN ? THEN ?').join(' ')} END ` +
            'WHERE liquidation_key IN (?)',
          [...chunk.flat(), chunk.map(([key]) => key)],
        );
      }
      const groups = new Map<string, number[]>();
      for (const c of changes) {
        const key = JSON.stringify([c.status, c.paidOn]);
        groups.set(key, [...(groups.get(key) ?? []), c.id]);
      }
      for (const [key, ids] of groups) {
        const [status, paidOn] = JSON.parse(key) as [string | null, string | null];
        for (let i = 0; i < ids.length; i += CHUNK) {
          await manager.query(
            'UPDATE invoices SET payment_status = ?, paid_on = ?, update_date = update_date WHERE id IN (?)',
            [status, paidOn, ids.slice(i, i + CHUNK)],
          );
        }
      }
    });
    return { linked: links.length, changed: changes.length };
  }
}

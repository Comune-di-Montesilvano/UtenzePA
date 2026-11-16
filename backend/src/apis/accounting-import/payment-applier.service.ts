import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { PaymentStatus } from '@apis/invoices/enum/payment-status.enum';
import type { AccountingRunContext } from './accounting-import.service';
import { AccountingDataService } from './accounting-data.service';
import { AccountingInvoiceService } from './accounting-invoice.service';
import { planPayments, type PaymentInvoice } from './payment-plan';
import * as q from './accounting-import.queries';

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
      q.paymentInvoices(this.dataSource.manager),
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
      await q.clearLiquidationInvoices(manager);
      for (let i = 0; i < links.length; i += CHUNK) {
        await q.setLiquidationInvoices(manager, links.slice(i, i + CHUNK));
      }
      const groups = new Map<string, number[]>();
      for (const c of changes) {
        const key = JSON.stringify([c.status, c.paidOn]);
        groups.set(key, [...(groups.get(key) ?? []), c.id]);
      }
      for (const [key, ids] of groups) {
        const [status, paidOn] = JSON.parse(key) as [string | null, string | null];
        for (let i = 0; i < ids.length; i += CHUNK) {
          await q.setPaymentStatus(manager, ids.slice(i, i + CHUNK), status, paidOn);
        }
      }
    });
    return { linked: links.length, changed: changes.length };
  }
}

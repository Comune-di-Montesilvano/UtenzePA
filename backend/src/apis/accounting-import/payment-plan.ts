import { PaymentStatus } from '@apis/invoices/enum/payment-status.enum';
import type { AccLiquidationRow } from './accounting-csv';

export interface PaymentInvoice {
  id: number;
  invoice_date: string;
  total_amount: number | null;
  // Cancellata o rifiutata dallo SDI: nessuno stato.
  excluded: boolean;
  payment_status: PaymentStatus | null;
  paid_on: string | null;
}

// Abbinamenti delle note di credito con i documenti trovati in UtenzePA.
export interface CreditNoteLink {
  amount: number;
  noteId?: number;
  invoiceId?: number;
}

export interface PaymentChange {
  id: number;
  status: PaymentStatus | null;
  paidOn: string | null;
}

// Liquidazione pagata: mandato con data di pagamento (l'importo pagato non
// conta: in Tinn differisce di un centesimo o vale 0 su mandati quietanzati).
// Un mandato di un esercizio chiuso senza data di pagamento conta pagato (in
// Tinn le quietanze degli anni passati mancano spesso).
export const isPaid = (l: AccLiquidationRow, currentYear: number): boolean =>
  !!l.paid_date || (!!l.mandate_date && Number(l.mandate_date.slice(0, 4)) < currentYear);

// Data del pagamento: quella della quietanza, altrimenti del mandato.
const paidDay = (l: AccLiquidationRow): string => (l.paid_date ?? l.mandate_date)!;

// Stato del pagamento delle fatture dall'anno di partenza: nessuna
// liquidazione valida = da liquidare (stornata se le note di credito abbinate
// coprono tutto il totale), tutte pagate = pagata (data = l'ultimo
// pagamento), altrimenti liquidata. Note di credito (totale negativo):
// compensata se abbinata a una fattura, altrimenti da compensare. Fatture
// prima dell'anno di partenza senza stato. Restituisce solo quelle che cambiano.
export function planPayments(
  liquidations: AccLiquidationRow[],
  matched: Map<string, number>,
  invoices: PaymentInvoice[],
  fromYear: number,
  currentYear: number,
  creditNotes: CreditNoteLink[] = [],
): PaymentChange[] {
  const compensated = new Set(creditNotes.map((c) => c.noteId).filter((id) => id !== undefined));
  const offset = new Map<number, number>();
  for (const c of creditNotes) {
    if (c.invoiceId !== undefined) offset.set(c.invoiceId, (offset.get(c.invoiceId) ?? 0) + c.amount);
  }
  const byInvoice = new Map<number, AccLiquidationRow[]>();
  for (const l of liquidations) {
    const id = matched.get(l.liquidation_key);
    if (l.cancelled || id === undefined) continue;
    byInvoice.set(id, [...(byInvoice.get(id) ?? []), l]);
  }
  const changes: PaymentChange[] = [];
  for (const inv of invoices) {
    const inScope = !inv.excluded && Number(inv.invoice_date.slice(0, 4)) >= fromYear;
    const credit = inv.total_amount !== null && inv.total_amount < 0;
    const liqs = byInvoice.get(inv.id) ?? [];
    let status: PaymentStatus | null = null;
    let paidOn: string | null = null;
    const cancelled =
      inv.total_amount !== null &&
      inv.total_amount > 0 &&
      offset.has(inv.id) &&
      Math.abs(inv.total_amount + (offset.get(inv.id) ?? 0)) < 0.02;
    if (!inScope) status = null;
    else if (credit)
      status = compensated.has(inv.id) ? PaymentStatus.COMPENSATED : PaymentStatus.TO_COMPENSATE;
    else if (!liqs.length)
      status = cancelled ? PaymentStatus.CANCELLED : PaymentStatus.TO_LIQUIDATE;
    else if (inScope && liqs.every((l) => isPaid(l, currentYear))) {
      status = PaymentStatus.PAID;
      paidOn = liqs.map(paidDay).sort()[liqs.length - 1];
    } else if (inScope) status = PaymentStatus.LIQUIDATED;
    if (status !== inv.payment_status || paidOn !== inv.paid_on)
      changes.push({ id: inv.id, status, paidOn });
  }
  return changes;
}

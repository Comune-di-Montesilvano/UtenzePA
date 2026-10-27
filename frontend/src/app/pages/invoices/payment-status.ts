import type {StatusInfo} from '../../core/helpers/entity-status';
import {DateHelper} from '../../core/helpers/date.helper';

// Stato del pagamento dalla contabilità (gemello di backend
// invoices/enum/payment-status.enum.ts). null = non noto (import spento,
// fattura prima dell'anno di partenza o nota di credito).
export enum PaymentStatus {
  TO_LIQUIDATE = 'TO_LIQUIDATE',
  LIQUIDATED = 'LIQUIDATED',
  PAID = 'PAID',
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  [PaymentStatus.TO_LIQUIDATE]: 'Da liquidare',
  [PaymentStatus.LIQUIDATED]: 'Liquidata',
  [PaymentStatus.PAID]: 'Pagata',
};

// Liquidazione della fattura con il suo mandato (GET /invoices/:id/payments).
export interface InvoicePayment {
  liquidation_number: string | null;
  commitment: string;
  amount: number;
  mandate_number: string | null;
  mandate_date: string | null;
  paid_date: string | null;
  paid_amount: number | null;
}

const dayIt = (iso: string | null | undefined): string => {
  const d = DateHelper.isoToLocalDate(iso);
  return d ? d.toLocaleDateString('it-IT') : '';
};

export function paymentStatusLabel(status: PaymentStatus | null | undefined, paidOn?: string | null): string {
  if (!status) return '';
  const label = PAYMENT_STATUS_LABELS[status];
  return status === PaymentStatus.PAID && paidOn ? `${label} il ${dayIt(paidOn)}` : label;
}

export function paymentStatusBadge(status: PaymentStatus | null | undefined, paidOn?: string | null): StatusInfo | null {
  if (!status) return null;
  const label = PAYMENT_STATUS_LABELS[status];
  switch (status) {
    case PaymentStatus.PAID:
      return {tone: 'ok', label, icon: 'paid', tooltip: paidOn ? `Pagata il ${dayIt(paidOn)}` : undefined};
    case PaymentStatus.LIQUIDATED:
      return {tone: 'info', label, icon: 'pending_actions', tooltip: 'Liquidata, mandato non ancora pagato'};
    default:
      return {tone: 'warn', label, icon: 'hourglass_empty', tooltip: 'Nessuna liquidazione in contabilità'};
  }
}

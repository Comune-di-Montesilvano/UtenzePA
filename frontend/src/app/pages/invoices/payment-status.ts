import type {StatusInfo} from '../../core/helpers/entity-status';
import {DateHelper} from '../../core/helpers/date.helper';

// Stato del pagamento dalla contabilità (gemello di backend
// invoices/enum/payment-status.enum.ts). null = non noto (import spento o
// fattura prima dell'anno di partenza). Stornata e note di credito fuori dalla
// spesa del capitolo.
export enum PaymentStatus {
  TO_LIQUIDATE = 'TO_LIQUIDATE',
  LIQUIDATED = 'LIQUIDATED',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
  COMPENSATED = 'COMPENSATED',
  TO_COMPENSATE = 'TO_COMPENSATE',
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  [PaymentStatus.TO_LIQUIDATE]: 'Da liquidare',
  [PaymentStatus.LIQUIDATED]: 'Liquidata',
  [PaymentStatus.PAID]: 'Pagata',
  [PaymentStatus.CANCELLED]: 'Stornata',
  [PaymentStatus.COMPENSATED]: 'Compensata',
  [PaymentStatus.TO_COMPENSATE]: 'Da compensare',
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

export function paymentNote(status: PaymentStatus | null | undefined): string | null {
  switch (status) {
    case PaymentStatus.TO_LIQUIDATE:
      return 'Nessuna liquidazione in contabilità per questa fattura.';
    case PaymentStatus.CANCELLED:
      return 'Fattura stornata per intero da note di credito: non si liquida e non conta nella spesa del capitolo.';
    case PaymentStatus.COMPENSATED:
      return 'Nota di credito compensata in contabilità su una fattura del fornitore: non conta nella spesa del capitolo.';
    case PaymentStatus.TO_COMPENSATE:
      return 'Nota di credito non ancora compensata su una fattura in contabilità: non conta nella spesa del capitolo.';
    default:
      return null;
  }
}

export function paymentStatusBadge(status: PaymentStatus | null | undefined, paidOn?: string | null): StatusInfo | null {
  if (!status) return null;
  const label = PAYMENT_STATUS_LABELS[status];
  switch (status) {
    case PaymentStatus.PAID:
      return {tone: 'ok', label, icon: 'paid', tooltip: paidOn ? `Pagata il ${dayIt(paidOn)}` : undefined};
    case PaymentStatus.LIQUIDATED:
      return {tone: 'info', label, icon: 'pending_actions', tooltip: 'Liquidata, mandato non ancora pagato'};
    case PaymentStatus.CANCELLED:
      return {tone: 'off', label, icon: 'block', tooltip: 'Stornata per intero da note di credito: fuori dalla spesa del capitolo'};
    case PaymentStatus.COMPENSATED:
      return {tone: 'off', label, icon: 'sync_alt', tooltip: 'Nota di credito compensata su una fattura: fuori dalla spesa del capitolo'};
    case PaymentStatus.TO_COMPENSATE:
      return {tone: 'warn', label, icon: 'sync_problem', tooltip: 'Nota di credito non ancora compensata in contabilità: fuori dalla spesa del capitolo'};
    default:
      return {tone: 'warn', label, icon: 'hourglass_empty', tooltip: 'Nessuna liquidazione in contabilità'};
  }
}

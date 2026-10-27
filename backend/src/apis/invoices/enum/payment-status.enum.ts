// Stato del pagamento dalla contabilità (import, passo payments): null = non
// noto (import spento o fattura prima dell'anno di partenza). In contabilità
// le note di credito non si liquidano: si compensano su una fattura, che si
// liquida al netto o, se stornata per intero, mai. Stornata, compensata e da
// compensare non pesano sul capitolo (OFFSET_STATUSES).
// Gemello frontend: pages/invoices/payment-status.ts.
export enum PaymentStatus {
  TO_LIQUIDATE = 'TO_LIQUIDATE',
  LIQUIDATED = 'LIQUIDATED',
  PAID = 'PAID',
  // Fattura stornata per intero da note di credito, mai liquidata.
  CANCELLED = 'CANCELLED',
  // Nota di credito abbinata a una fattura.
  COMPENSATED = 'COMPENSATED',
  // Nota di credito non ancora abbinata.
  TO_COMPENSATE = 'TO_COMPENSATE',
}

export const OFFSET_STATUSES: PaymentStatus[] = [
  PaymentStatus.CANCELLED,
  PaymentStatus.COMPENSATED,
  PaymentStatus.TO_COMPENSATE,
];

// Fattura che pesa sul capitolo: esclusi stornate e note di credito della contabilità.
export const NOT_OFFSET_SQL = (alias: string): string =>
  `(${alias}.payment_status IS NULL OR ${alias}.payment_status NOT IN (${OFFSET_STATUSES.map((s) => `'${s}'`).join(', ')}))`;

// Stato del pagamento dalla contabilità (import, passo payments): null = non
// noto (import spento, fattura prima dell'anno di partenza o nota di credito).
// Gemello frontend: pages/invoices/payment-status.ts.
export enum PaymentStatus {
  TO_LIQUIDATE = 'TO_LIQUIDATE',
  LIQUIDATED = 'LIQUIDATED',
  PAID = 'PAID',
}

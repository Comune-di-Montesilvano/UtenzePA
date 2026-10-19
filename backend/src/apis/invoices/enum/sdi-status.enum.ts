// Stato della fattura dalle notifiche SDI (null = fattura senza messaggio SDI).
// Gemello frontend: pages/invoices/sdi-status.ts.
export enum SdiStatus {
  RECEIVED = 'RECEIVED',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  DEADLINE_PASSED = 'DEADLINE_PASSED',
}

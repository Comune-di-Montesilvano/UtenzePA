import type {StatusInfo} from '../../core/helpers/entity-status';

// Stato SDI della fattura, ricavato dai messaggi della PEC (gemello di
// backend invoices/enum/sdi-status.enum.ts). null = nessun messaggio SDI.
export enum SdiStatus {
  RECEIVED = 'RECEIVED',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  DEADLINE_PASSED = 'DEADLINE_PASSED',
}

export const SDI_STATUS_LABELS: Record<SdiStatus, string> = {
  [SdiStatus.RECEIVED]: 'Ricevuta',
  [SdiStatus.ACCEPTED]: 'Accettata',
  [SdiStatus.REJECTED]: 'Rifiutata',
  [SdiStatus.DEADLINE_PASSED]: 'Decorsi i termini',
};

// Valore del filtro "Senza messaggio SDI" (backend: sdi_status IS NULL).
export const SDI_STATUS_NONE = 'NONE';

export function sdiStatusBadge(status: SdiStatus | null | undefined, outcomeDiscarded = false): StatusInfo | null {
  if (!status) return null;
  const label = SDI_STATUS_LABELS[status];
  const discarded = 'Esito inviato scartato dallo SDI';
  switch (status) {
    case SdiStatus.REJECTED:
      return {tone: 'danger', label, icon: 'block', tooltip: 'Rifiutata: esclusa dalla spesa'};
    case SdiStatus.ACCEPTED:
      return {tone: 'ok', label, icon: 'check_circle'};
    case SdiStatus.DEADLINE_PASSED:
      return {tone: outcomeDiscarded ? 'warn' : 'off', label, icon: 'schedule', tooltip: outcomeDiscarded ? `Nessun esito entro 15 giorni. ${discarded}` : 'Nessun esito entro 15 giorni'};
    default:
      return {tone: outcomeDiscarded ? 'warn' : 'info', label, icon: 'mark_email_read', tooltip: outcomeDiscarded ? discarded : undefined};
  }
}

export type ContractDirection = 'ACTIVE' | 'PASSIVE';
export type ContractKind = 'LEASE' | 'CONCESSION' | 'LOAN_FOR_USE' | 'HOUSING_ASSIGNMENT' | 'LAND_OCCUPATION';
export type RentPeriod = 'MONTHLY' | 'BIMONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL' | 'ONE_OFF';
export type ContractStatus = 'ACTIVE' | 'RETURNED' | 'TERMINATED' | 'DISPUTED';
export type DisplayStatus = ContractStatus | 'EXPIRING' | 'EXPIRED';

export const DIRECTION_LABEL: Record<ContractDirection, string> = {ACTIVE: 'Entrata', PASSIVE: 'Uscita'};
export const KIND_LABEL: Record<ContractKind, string> = {
  LEASE: 'Locazione', CONCESSION: 'Concessione', LOAN_FOR_USE: 'Comodato',
  HOUSING_ASSIGNMENT: 'Assegnazione alloggio', LAND_OCCUPATION: 'Occupazione suolo',
};
export const PERIOD_LABEL: Record<RentPeriod, string> = {
  MONTHLY: 'Mensile', BIMONTHLY: 'Bimestrale', QUARTERLY: 'Trimestrale',
  SEMIANNUAL: 'Semestrale', ANNUAL: 'Annuale', ONE_OFF: 'Una tantum',
};
export const STATUS_LABEL: Record<DisplayStatus, string> = {
  ACTIVE: 'Attivo', EXPIRING: 'In scadenza', EXPIRED: 'Scaduto',
  RETURNED: 'Restituito', TERMINATED: 'Cessato', DISPUTED: 'In contenzioso',
};

export function statusBadge(s: DisplayStatus): {bg: string; fg: string} {
  switch (s) {
    case 'ACTIVE': return {bg: 'var(--tone-ok-bg)', fg: 'var(--tone-ok-fg)'};
    case 'EXPIRING': return {bg: 'var(--tone-warn-bg)', fg: 'var(--tone-warn-fg)'};
    case 'EXPIRED': return {bg: 'var(--tone-danger-bg)', fg: 'var(--tone-danger-fg)'};
    case 'DISPUTED': return {bg: 'var(--tone-disputed-bg)', fg: 'var(--tone-disputed-fg)'};
    default: return {bg: 'var(--app-surface-2)', fg: 'light-dark(#374151, #d4d4d8)'};
  }
}

export const formatEuro = (v: number | null | undefined): string =>
  v === null || v === undefined ? '' : Number(v).toLocaleString('it-IT', {style: 'currency', currency: 'EUR'});

export const formatDateIt = (iso: string | null | undefined): string =>
  iso ? iso.slice(0, 10).split('-').reverse().join('/') : '';

export interface ContractSummary {
  notice: number;
  expiring: number;
  expired_active: number;
  without_assets: number;
  annual_income: number;
  annual_expense: number;
}

export type ContractAlert = 'notice' | 'expiring' | 'expired_active' | 'without_assets';

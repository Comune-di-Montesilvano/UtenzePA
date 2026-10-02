import { ContractStatus, DisplayStatus, RentPeriod } from './enum/real-estate-contract.enum';

export const NOTICE_ALERT_DAYS = 60;
export const EXPIRING_MONTHS = 4;
// Limite di sicurezza sui cicli di rinnovo (es. rinnovo mensile dal 1900).
const MAX_RENEWAL_CYCLES = 2000;

const PERIOD_FACTOR: Record<RentPeriod, number> = {
  [RentPeriod.MONTHLY]: 12,
  [RentPeriod.BIMONTHLY]: 6,
  [RentPeriod.QUARTERLY]: 4,
  [RentPeriod.SEMIANNUAL]: 2,
  [RentPeriod.ANNUAL]: 1,
  [RentPeriod.ONE_OFF]: 0,
};

export interface CalcInput {
  end_date: string | null;
  tacit_renewal: boolean;
  renewal_months: number | null;
  notice_months: number | null;
  status: ContractStatus;
}

export function annualRent(
  amount: number | null | undefined,
  period: RentPeriod | null | undefined,
): number | null {
  if (amount === null || amount === undefined || !period) return null;
  return Math.round(Number(amount) * PERIOD_FACTOR[period] * 100) / 100;
}

// Somma mesi a una data ISO; se il giorno non esiste nel mese di arrivo si
// usa l'ultimo giorno (31/01 + 1 mese = 28/02).
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function effectiveEndDate(c: CalcInput, today: string): string | null {
  if (!c.end_date) return null;
  const end = c.end_date.slice(0, 10);
  const step = Number(c.renewal_months ?? 0);
  if (!c.tacit_renewal || !(step > 0) || end >= today) return end;
  let cycles = 1;
  let next = addMonths(end, step);
  while (next < today && cycles < MAX_RENEWAL_CYCLES) {
    cycles++;
    // Sempre dalla data originaria: evita la deriva del fine mese (31 → 28 → 28).
    next = addMonths(end, step * cycles);
  }
  return next;
}

export function noticeDeadline(c: CalcInput, today: string): string | null {
  if (!c.tacit_renewal) return null;
  const end = effectiveEndDate(c, today);
  if (!end) return null;
  return addMonths(end, -Number(c.notice_months ?? 0));
}

export function displayStatus(c: CalcInput, today: string): DisplayStatus {
  if (c.status !== ContractStatus.ACTIVE) return c.status as unknown as DisplayStatus;
  const end = effectiveEndDate(c, today);
  if (!end) return DisplayStatus.ACTIVE;
  if (end < today) return DisplayStatus.EXPIRED;
  if (end <= addMonths(today, EXPIRING_MONTHS)) return DisplayStatus.EXPIRING;
  return DisplayStatus.ACTIVE;
}

export function contractAlerts(
  c: CalcInput,
  today: string,
): { notice: boolean; expiring: boolean; expiredActive: boolean } {
  const none = { notice: false, expiring: false, expiredActive: false };
  if (c.status !== ContractStatus.ACTIVE) return none;
  const status = displayStatus(c, today);
  const deadline = noticeDeadline(c, today);
  return {
    notice: !!deadline && deadline >= today && deadline <= addDays(today, NOTICE_ALERT_DAYS),
    expiring: !c.tacit_renewal && status === DisplayStatus.EXPIRING,
    expiredActive: status === DisplayStatus.EXPIRED,
  };
}

export function todayIso(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

import type { AccLiquidationRow } from './accounting-csv';
import { commitmentKey } from './scope';

export interface CurrentShare {
  invoice_id_fk: number;
  commitment_id_fk: number;
  fiscal_year: number;
  amount: number | string;
  source: string;
}

export interface PlannedShare {
  commitment_id_fk: number;
  fiscal_year: number;
  amount: number;
}

const cents = (v: number | string): number => Math.round(Number(v) * 100);
const shareKey = (s: {
  commitment_id_fk: number;
  fiscal_year: number;
  amount: number | string;
}): string => `${s.commitment_id_fk}:${s.fiscal_year}:${cents(s.amount)}`;

// Quote d'impegno delle fatture pagate: liquidazioni valide sommate per
// impegno e anno. Una fattura con una liquidazione su un impegno che UtenzePA
// non ha resta com'è; una fattura con quote della ragioneria e nessuna
// liquidazione valida le perde (shares = []).
export function planShares(
  liquidations: AccLiquidationRow[],
  matched: Map<string, number>,
  commitmentIdByNumber: Map<string, number>,
  current: CurrentShare[],
): { invoiceId: number; shares: PlannedShare[] }[] {
  const planned = new Map<number, Map<string, PlannedShare>>();
  const skipped = new Set<number>();
  for (const l of liquidations) {
    const invoiceId = matched.get(l.liquidation_key);
    if (l.cancelled || invoiceId === undefined) continue;
    const commitmentId = commitmentIdByNumber.get(commitmentKey(l));
    if (commitmentId === undefined) {
      skipped.add(invoiceId);
      continue;
    }
    const shares = planned.get(invoiceId) ?? new Map<string, PlannedShare>();
    const key = `${commitmentId}:${l.fiscal_year}`;
    const share = shares.get(key) ?? {
      commitment_id_fk: commitmentId,
      fiscal_year: l.fiscal_year,
      amount: 0,
    };
    share.amount = Math.round((share.amount + l.amount) * 100) / 100;
    shares.set(key, share);
    planned.set(invoiceId, shares);
  }

  const currentByInvoice = new Map<number, CurrentShare[]>();
  for (const s of current)
    currentByInvoice.set(s.invoice_id_fk, [...(currentByInvoice.get(s.invoice_id_fk) ?? []), s]);

  const result: { invoiceId: number; shares: PlannedShare[] }[] = [];
  for (const [invoiceId, map] of planned) {
    if (skipped.has(invoiceId)) continue;
    const shares = [...map.values()].sort(
      (a, b) => a.commitment_id_fk - b.commitment_id_fk || a.fiscal_year - b.fiscal_year,
    );
    const existing = currentByInvoice.get(invoiceId) ?? [];
    const same =
      existing.every((s) => s.source === 'ACCOUNTING') &&
      existing.map(shareKey).sort().join('|') === shares.map(shareKey).sort().join('|');
    if (!same) result.push({ invoiceId, shares });
  }
  for (const [invoiceId, existing] of currentByInvoice) {
    if (planned.has(invoiceId) || skipped.has(invoiceId)) continue;
    if (existing.some((s) => s.source === 'ACCOUNTING')) result.push({ invoiceId, shares: [] });
  }
  return result;
}

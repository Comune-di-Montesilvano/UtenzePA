// Funzioni pure per merge-contracts.ts: accorpamento dei contratti duplicati
// creati dall'import Access (un contratto per utenza) in un unico contratto
// per ordine CONSIP.

export const MERGED_FIELDS = [
  'supplier_id_fk',
  'consip_agreement_id',
  'cig_contract',
  'order_number',
  'supply_start_date',
  'supply_expiry_date',
  'management_expiry_date',
  'takeover_termination_date',
] as const;

export type MergedField = (typeof MERGED_FIELDS)[number];
export type ContractRow = { id: number } & Record<MergedField, unknown>;

export interface MergePlan {
  survivorId: number;
  removedIds: number[];
  fields: Record<MergedField, unknown>;
  divergences: { field: MergedField; contractId: number; value: unknown; chosen: unknown }[];
}

// Rappresentazione confrontabile: Date e stringhe ISO, decimal stringa e
// number, null/'' equivalenti.
function canonical(value: unknown): string | number | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') return value;
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return s;
}

// Valore più frequente (null incluso); a parità il primo incontrato.
export function majority(values: unknown[]): string | number | null {
  const counts = new Map<string | number | null, number>();
  for (const v of values.map(canonical)) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | number | null = null;
  let bestCount = -1;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

// Superstite = id minore. Ogni campo prende l'override esplicito se
// presente, altrimenti il valore di maggioranza; i valori scartati sono
// restituiti come divergenze per il report.
export function planMerge(
  contracts: ContractRow[],
  overrides: Partial<Record<MergedField, unknown>> = {},
): MergePlan {
  const sorted = [...contracts].sort((a, b) => a.id - b.id);
  const fields = {} as Record<MergedField, unknown>;
  const divergences: MergePlan['divergences'] = [];
  for (const field of MERGED_FIELDS) {
    const chosen =
      field in overrides ? canonical(overrides[field]) : majority(sorted.map((c) => c[field]));
    fields[field] = chosen;
    for (const c of sorted) {
      if (canonical(c[field]) !== chosen) {
        divergences.push({ field, contractId: c.id, value: canonical(c[field]), chosen });
      }
    }
  }
  return {
    survivorId: sorted[0].id,
    removedIds: sorted.slice(1).map((c) => c.id),
    fields,
    divergences: divergences.filter((d) => !(d.field in overrides)),
  };
}

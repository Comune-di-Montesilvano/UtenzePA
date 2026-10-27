import type { AuditFieldChange } from '@apis/audit-log/audit-log.service';
import type { AccCommitmentRow } from './accounting-csv';
import { RecordSource } from './record-source.enum';
import { chapterKey, commitmentKey } from './scope';

export interface CommitmentNumber {
  commitment_year: number;
  commitment_num: number;
  commitment_sub: number;
}

export interface CurrentCommitment extends CommitmentNumber {
  id: number;
  budget_chapter_id_fk: number;
  supplier_id_fk: number | null;
  source: RecordSource;
  years: { fiscal_year: number; amount: number | null; source: RecordSource }[];
}

export interface YearAmount {
  fiscal_year: number;
  amount: number;
}

export type CommitmentChange =
  | {
      kind: 'create';
      number: CommitmentNumber;
      chapterId: number;
      supplierId: number | null;
      years: YearAmount[];
    }
  | {
      kind: 'update';
      id: number;
      values: Partial<
        Pick<CurrentCommitment, 'budget_chapter_id_fk' | 'supplier_id_fk' | 'source'>
      >;
      fields: AuditFieldChange[];
      years: { upsert: YearAmount[]; delete: number[] };
    }
  | { kind: 'delete'; id: number };

// Annualità per l'audit, come in BudgetCommitmentsService: «2026: 100.00; 2027: —».
export const yearsLabel = (
  years: { fiscal_year: number; amount: number | string | null }[],
): string =>
  [...years]
    .sort((a, b) => a.fiscal_year - b.fiscal_year)
    .map((y) => `${y.fiscal_year}: ${y.amount === null ? '—' : Number(y.amount).toFixed(2)}`)
    .join('; ');

const cents = (v: number | string | null): number | null =>
  v === null ? null : Math.round(Number(v) * 100);

// Impegni come in contabilità: uno per numero anno/num/sub, con un'annualità
// per anno di competenza. Negli anni coperti dal file la contabilità vince:
// annualità e impegni che non ha (o annullati) si tolgono; gli anni fuori dal
// file restano come sono.
export function planCommitments(
  acc: AccCommitmentRow[],
  scope: Set<string>,
  coveredYears: Set<number>,
  chapterIds: Map<string, number>,
  current: CurrentCommitment[],
  suppliersByVat: Map<string, number>,
): CommitmentChange[] {
  const groups = new Map<string, AccCommitmentRow[]>();
  for (const row of acc) {
    const key = commitmentKey(row);
    if (row.cancelled || !scope.has(key)) continue;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const byKey = new Map(current.map((c) => [commitmentKey(c), c]));
  const changes: CommitmentChange[] = [];

  for (const [key, rows] of groups) {
    const sorted = [...rows].sort((a, b) => a.fiscal_year - b.fiscal_year);
    const latest = sorted[sorted.length - 1];
    const chapterId = chapterIds.get(chapterKey(latest.chapter, latest.article));
    if (chapterId === undefined) continue;
    const vat = [...sorted].reverse().find((r) => r.supplier_vat)?.supplier_vat ?? null;
    const supplierId = (vat && suppliersByVat.get(vat)) ?? null;
    const years = sorted.map((r) => ({ fiscal_year: r.fiscal_year, amount: r.amount }));
    const existing = byKey.get(key);
    if (!existing) {
      changes.push({
        kind: 'create',
        number: {
          commitment_year: latest.commitment_year,
          commitment_num: latest.commitment_num,
          commitment_sub: latest.commitment_sub,
        },
        chapterId,
        supplierId,
        years,
      });
      continue;
    }
    const values = {
      budget_chapter_id_fk: chapterId,
      // Creditore senza P.IVA o non in anagrafica: resta il fornitore già scelto.
      supplier_id_fk: supplierId ?? existing.supplier_id_fk,
      source: RecordSource.ACCOUNTING,
    };
    const fields: AuditFieldChange[] = (Object.keys(values) as (keyof typeof values)[])
      .filter((f) => existing[f] !== values[f])
      .map((f) => ({ fieldName: f, oldValue: existing[f], newValue: values[f] }));
    const upsert = years.filter((y) => {
      const old = existing.years.find((e) => e.fiscal_year === y.fiscal_year);
      return (
        !old || cents(old.amount) !== cents(y.amount) || old.source !== RecordSource.ACCOUNTING
      );
    });
    const wanted = new Set(years.map((y) => y.fiscal_year));
    const removed = existing.years
      .map((y) => y.fiscal_year)
      .filter((y) => coveredYears.has(y) && !wanted.has(y));
    if (upsert.length || removed.length) {
      fields.push({
        fieldName: 'years',
        oldValue: yearsLabel(existing.years),
        newValue: yearsLabel(after(existing.years, upsert, removed)),
      });
    }
    if (fields.length)
      changes.push({
        kind: 'update',
        id: existing.id,
        values,
        fields,
        years: { upsert, delete: removed },
      });
  }

  for (const existing of current) {
    if (groups.has(commitmentKey(existing))) continue;
    const covered = existing.years.map((y) => y.fiscal_year).filter((y) => coveredYears.has(y));
    if (!covered.length) continue;
    if (covered.length === existing.years.length) {
      changes.push({ kind: 'delete', id: existing.id });
      continue;
    }
    changes.push({
      kind: 'update',
      id: existing.id,
      values: {},
      fields: [
        {
          fieldName: 'years',
          oldValue: yearsLabel(existing.years),
          newValue: yearsLabel(after(existing.years, [], covered)),
        },
      ],
      years: { upsert: [], delete: covered },
    });
  }
  return changes;
}

function after(
  years: { fiscal_year: number; amount: number | null }[],
  upsert: YearAmount[],
  removed: number[],
): { fiscal_year: number; amount: number | null }[] {
  const kept = years.filter(
    (y) => !removed.includes(y.fiscal_year) && !upsert.some((u) => u.fiscal_year === y.fiscal_year),
  );
  return [...kept, ...upsert];
}

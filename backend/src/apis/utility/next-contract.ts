import type { Contract } from '@apis/contracts/entity/contract.entity';

type ContractLike = Pick<
  Contract,
  'id' | 'supplier_id_fk' | 'supply_start_date' | 'closed' | 'draft' | 'deleted'
>;

const day = (value: string | Date | null | undefined): string | null => {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
};

/**
 * Contratto che subentra a quello corrente: il primo che parte dopo `today` (AAAA-MM-GG),
 * di un altro fornitore (un rinnovo con lo stesso fornitore non cambia niente). Chiusi,
 * bozze e cancellati non contano, come per il contratto corrente.
 */
export function nextContract<T extends ContractLike>(
  contracts: T[],
  current: T | undefined,
  today: string,
): T | null {
  if (!current) return null;
  const currentStart = day(current.supply_start_date);
  if (currentStart && currentStart > today) return null;
  let best: T | null = null;
  for (const c of contracts) {
    const start = day(c.supply_start_date);
    if (c.id === current.id || c.closed || c.draft || c.deleted || !start || start <= today) continue;
    if (c.supplier_id_fk === current.supplier_id_fk) continue;
    if (!best || start < (day(best.supply_start_date) as string)) best = c;
  }
  return best;
}

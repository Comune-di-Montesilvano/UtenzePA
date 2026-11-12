import {toIsoDate} from '../../core/helpers/date.helper';

interface ContractLike {
  id: number;
  closed?: boolean | null;
  draft?: boolean | null;
  supply_start_date?: Date | string | null;
  supply_expiry_date?: Date | string | null;
  utilities?: {id: number}[] | null;
}

const isoOf = (v: Date | string): string => (typeof v === 'string' ? v.slice(0, 10) : toIsoDate(v));

function dayAfter(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return toIsoDate(new Date(y, m - 1, d + 1));
}

// Utenze di un contratto in scadenza che nessun altro contratto prende in
// carico: un contratto non chiuso (anche in bozza, cioè ordine in arrivo) che
// le contiene, parte entro il giorno dopo la scadenza e finisce dopo.
// Contratto senza scadenza: nessuna utenza da coprire.
export function uncoveredUtilityIds(contract: ContractLike, others: ContractLike[]): number[] {
  const ids = (contract.utilities ?? []).map(u => u.id);
  if (!contract.supply_expiry_date) return [];
  const expiry = isoOf(contract.supply_expiry_date);
  const limit = dayAfter(expiry);
  const successors = others.filter(o =>
    o.id !== contract.id && !o.closed &&
    (!o.supply_start_date || isoOf(o.supply_start_date) <= limit) &&
    (!o.supply_expiry_date || isoOf(o.supply_expiry_date) > expiry));
  const covered = new Set(successors.flatMap(o => (o.utilities ?? []).map(u => u.id)));
  return ids.filter(id => !covered.has(id));
}

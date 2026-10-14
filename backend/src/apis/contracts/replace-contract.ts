// Contratto sostituito da uno nuovo con le stesse utenze: chiuso e, se la sua
// scadenza manca o va oltre, scade il giorno prima della nuova decorrenza
// (niente sovrapposizioni). Date 'AAAA-MM-GG' confrontate come stringhe.
const isoOf = (v: string | Date): string =>
  v instanceof Date
    ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
    : String(v).slice(0, 10);

const dayBefore = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  return isoOf(new Date(y, m - 1, d - 1));
};

export function replacedContractPatch(
  previousExpiry: string | Date | null | undefined,
  newStart: string | null | undefined,
): { closed: true; supply_expiry_date?: string } {
  if (!newStart) return { closed: true };
  const start = newStart.slice(0, 10);
  if (previousExpiry && isoOf(previousExpiry) < start) return { closed: true };
  return { closed: true, supply_expiry_date: dayBefore(start) };
}

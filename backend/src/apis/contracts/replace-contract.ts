// Contratto sostituito da uno nuovo con le stesse utenze: se la sua scadenza
// manca o va oltre, scade il giorno prima della nuova decorrenza (niente
// sovrapposizioni); è chiuso solo se la nuova decorrenza è già arrivata,
// altrimenti resta il contratto corrente fino ad allora. Date 'AAAA-MM-GG'
// confrontate come stringhe.
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
  today: string = isoOf(new Date()),
): { closed?: true; supply_expiry_date?: string } {
  if (!newStart) return { closed: true };
  const start = newStart.slice(0, 10);
  const close = start <= today ? { closed: true as const } : {};
  if (previousExpiry && isoOf(previousExpiry) < start) return close;
  return { ...close, supply_expiry_date: dayBefore(start) };
}

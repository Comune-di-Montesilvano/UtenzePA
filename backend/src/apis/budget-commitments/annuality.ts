// Annualità di un impegno su cui pesa una riga scelta a mano: quella
// dell'anno della riga, altrimenti la più vicina (a parità, la precedente).
// Le righe automatiche vanno solo sull'annualità del loro anno.
export function annualityFor(years: number[], lineYear: number): number | null {
  if (!years.length) return null;
  if (years.includes(lineYear)) return lineYear;
  return [...years].sort((a, b) => Math.abs(a - lineYear) - Math.abs(b - lineYear) || a - b)[0];
}

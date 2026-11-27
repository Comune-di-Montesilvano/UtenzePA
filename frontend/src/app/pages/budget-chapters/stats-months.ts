const NAMES = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

const index = (month: string): number => {
  const [y, m] = month.split('-').map(Number);
  return y * 12 + (m - 1);
};
const label = (i: number, withYear: boolean): string =>
  `${NAMES[i % 12]}${withYear ? ` ${Math.floor(i / 12)}` : ''}`;

// Mesi 'AAAA-MM' come intervalli di mesi consecutivi: «gen–mar 2026, giu 2026»,
// «nov 2025–feb 2026». Vuoto = ''.
export function formatMonths(months: string[]): string {
  const sorted = [...new Set(months.map(index))].sort((a, b) => a - b);
  const ranges: [number, number][] = [];
  for (const i of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && last[1] === i - 1) last[1] = i;
    else ranges.push([i, i]);
  }
  return ranges
    .map(([a, b]) => {
      if (a === b) return label(a, true);
      const sameYear = Math.floor(a / 12) === Math.floor(b / 12);
      return `${label(a, !sameYear)}–${label(b, true)}`;
    })
    .join(', ');
}

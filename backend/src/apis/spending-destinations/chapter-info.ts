import {
  DayWindow,
  StatsLine,
  lineShare,
  monthWindows,
} from '@apis/spending/chapter-utility-stats';

// Riga di fattura dell'utenza con la quota (0..1) pagata su un altro capitolo.
export interface ElsewhereLine extends StatsLine {
  chapter_label: string;
  share: number;
}

export interface PaidElsewhere {
  chapter_label: string;
  amount: number;
  // Mesi 'AAAA-MM' con una parte della spesa pagata su quel capitolo.
  months: string[];
}

const CENT = 0.005;
const round2 = (n: number) => Math.round(n * 100) / 100;

// Spesa dell'utenza nel periodo pagata su capitoli diversi dal suo, per capitolo:
// righe pro rata sui giorni del periodo (come le statistiche del capitolo).
export function paidElsewhere(lines: ElsewhereLine[], w: DayWindow): PaidElsewhere[] {
  const byChapter = new Map<string, ElsewhereLine[]>();
  for (const l of lines)
    byChapter.set(l.chapter_label, [...(byChapter.get(l.chapter_label) ?? []), l]);
  const months = monthWindows(w);
  const out: PaidElsewhere[] = [];
  for (const [chapter_label, list] of byChapter) {
    const sum = (x: DayWindow) => list.reduce((t, l) => t + lineShare(l, x) * l.share, 0);
    const amount = sum(w);
    if (amount <= CENT) continue;
    out.push({
      chapter_label,
      amount: round2(amount),
      months: months.filter((m) => sum(m.window) > CENT).map((m) => m.month),
    });
  }
  return out.sort((a, b) => b.amount - a.amount || a.chapter_label.localeCompare(b.chapter_label));
}

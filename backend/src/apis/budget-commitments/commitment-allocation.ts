// Consumo degli impegni di un gruppo (stesso contratto + capitolo + esercizio):
// le righe automatiche, in ordine di data fattura e id, vanno per intero sul
// primo impegno (ordine anno/num/sub, senza numero dopo) che ha ancora
// rimanenza; con tutti esauriti sull'ultimo. Un impegno senza importo non si
// esaurisce. Le righe scelte a mano contano nella rimanenza e non si spostano.

export interface AllocCommitment {
  id: number;
  year: number | null;
  num: number | null;
  sub: number | null;
  amount: number | null;
}

export interface AllocLine {
  id: number;
  amount: number;
  date: string;
  auto: boolean;
  commitment_id: number | null;
}

const numbered = (c: AllocCommitment) => (c.num === null ? 1 : 0);

function byNumber(a: AllocCommitment, b: AllocCommitment): number {
  return (
    numbered(a) - numbered(b) ||
    (a.year ?? 0) - (b.year ?? 0) ||
    (a.num ?? 0) - (b.num ?? 0) ||
    (a.sub ?? 0) - (b.sub ?? 0) ||
    a.id - b.id
  );
}

/** Ritorna id riga → id impegno per le sole righe automatiche (null = nessun impegno). */
export function allocate(commitments: AllocCommitment[], lines: AllocLine[]): Map<number, number | null> {
  const ordered = [...commitments].sort(byNumber);
  const remaining = new Map<number, number>(
    ordered.map((c) => [c.id, c.amount === null ? Infinity : Number(c.amount)]),
  );
  for (const l of lines) {
    if (!l.auto && l.commitment_id !== null && remaining.has(l.commitment_id)) {
      remaining.set(l.commitment_id, remaining.get(l.commitment_id)! - Number(l.amount));
    }
  }

  const result = new Map<number, number | null>();
  const autoLines = lines
    .filter((l) => l.auto)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
  for (const l of autoLines) {
    if (!ordered.length) {
      result.set(l.id, null);
      continue;
    }
    const target = ordered.find((c) => remaining.get(c.id)! > 0) ?? ordered[ordered.length - 1];
    remaining.set(target.id, remaining.get(target.id)! - Number(l.amount));
    result.set(l.id, target.id);
  }
  return result;
}

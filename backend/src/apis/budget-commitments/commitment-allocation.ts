// Consumo degli impegni: le righe automatiche, in ordine di data fattura e id,
// vanno per intero sul primo impegno candidato (ordine anno/num/sub, senza
// numero dopo) che ha ancora rimanenza; con tutti esauriti sull'ultimo.
// Candidati = impegni del contratto della riga, sul suo capitolo e nel suo
// esercizio (campi assenti = nessun filtro). Riga senza utenza (chapter null):
// impegni del contratto nell'esercizio, solo se tutti dello stesso capitolo.
// La rimanenza è una sola per impegno anche se è condiviso da più contratti.
// Un impegno senza importo non si esaurisce. Le righe scelte a mano contano
// nella rimanenza e non si spostano.

export interface AllocCommitment {
  id: number;
  year: number | null;
  num: number | null;
  sub: number | null;
  amount: number | null;
  contract_ids?: number[];
  chapter?: number;
  fiscal_year?: number;
}

export interface AllocLine {
  id: number;
  amount: number;
  date: string;
  auto: boolean;
  commitment_id: number | null;
  contract_id?: number;
  chapter?: number | null;
  year?: number;
}

function candidates(ordered: AllocCommitment[], l: AllocLine): AllocCommitment[] {
  const found = ordered.filter(
    (c) =>
      (l.contract_id === undefined || !c.contract_ids || c.contract_ids.includes(l.contract_id)) &&
      (l.year === undefined || c.fiscal_year === undefined || c.fiscal_year === l.year) &&
      (l.chapter === undefined || l.chapter === null || c.chapter === undefined || c.chapter === l.chapter),
  );
  if (l.chapter === null && new Set(found.map((c) => c.chapter)).size > 1) return [];
  return found;
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
    const pool = candidates(ordered, l);
    if (!pool.length) {
      result.set(l.id, null);
      continue;
    }
    const target = pool.find((c) => remaining.get(c.id)! > 0) ?? pool[pool.length - 1];
    remaining.set(target.id, remaining.get(target.id)! - Number(l.amount));
    result.set(l.id, target.id);
  }
  return result;
}

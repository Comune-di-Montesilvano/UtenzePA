// Consumo degli impegni: le righe automatiche, in ordine di data fattura e id,
// vanno per intero sulla prima annualità candidata (ordine anno/num/sub, senza
// numero dopo) che ha ancora rimanenza; con tutte esaurite sull'ultima.
// Un elemento di `commitments` è un'annualità: lo stesso impegno pluriennale
// compare una volta per esercizio, con lo stesso id. Candidati = annualità
// del contratto della riga, sul suo capitolo e nel suo esercizio (campi
// assenti = nessun filtro). Riga senza utenza (chapter null): annualità del
// contratto nell'esercizio, solo se tutte dello stesso capitolo.
// La rimanenza è una sola per annualità anche se l'impegno è condiviso da più
// contratti. Un'annualità senza importo non si esaurisce. Le righe scelte a
// mano contano nella rimanenza della loro annualità (`fiscal_year` della
// riga) e non si spostano.

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
  // Annualità delle righe scelte a mano (annuality.ts).
  fiscal_year?: number | null;
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

export interface AllocTarget {
  id: number;
  fiscal_year: number | null;
}

const unitKey = (id: number, year: number | null | undefined) => `${id}:${year ?? '-'}`;

/** Ritorna id riga → annualità per le sole righe automatiche (null = nessun impegno). */
export function allocate(commitments: AllocCommitment[], lines: AllocLine[]): Map<number, AllocTarget | null> {
  const ordered = [...commitments].sort(byNumber);
  const remaining = new Map<string, number>(
    ordered.map((c) => [unitKey(c.id, c.fiscal_year), c.amount === null ? Infinity : Number(c.amount)]),
  );
  for (const l of lines) {
    const key = l.commitment_id === null ? '' : unitKey(l.commitment_id, l.fiscal_year);
    if (!l.auto && remaining.has(key)) remaining.set(key, remaining.get(key)! - Number(l.amount));
  }

  const result = new Map<number, AllocTarget | null>();
  const autoLines = lines
    .filter((l) => l.auto)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
  for (const l of autoLines) {
    const pool = candidates(ordered, l);
    if (!pool.length) {
      result.set(l.id, null);
      continue;
    }
    const key = (c: AllocCommitment) => unitKey(c.id, c.fiscal_year);
    const target = pool.find((c) => remaining.get(key(c))! > 0) ?? pool[pool.length - 1];
    remaining.set(key(target), remaining.get(key(target))! - Number(l.amount));
    result.set(l.id, { id: target.id, fiscal_year: target.fiscal_year ?? null });
  }
  return result;
}

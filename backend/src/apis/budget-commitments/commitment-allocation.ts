// Consumo degli impegni: le fatture senza quote fisse, in ordine di data e id,
// vanno per intero sulla prima annualità candidata (ordine anno/num/sub, senza
// numero dopo) che ha ancora rimanenza; con tutte esaurite sull'ultima.
// Un elemento di `commitments` è un'annualità: lo stesso impegno pluriennale
// compare una volta per esercizio, con lo stesso id. Candidati = annualità
// del contratto della fattura, sul suo capitolo e nel suo esercizio (campi
// assenti = nessun filtro). Fattura senza utenza o con capitoli diversi
// (chapter null): annualità del contratto nell'esercizio, solo se tutte dello
// stesso capitolo; utenza senza capitolo (chapter 0): nessun candidato.
// La rimanenza è una sola per annualità anche se l'impegno è condiviso da più
// contratti. Un'annualità senza importo non si esaurisce. Le quote fisse
// (MANUAL/ACCOUNTING) consumano la rimanenza della loro annualità e non si
// spostano; le fatture che le hanno non compaiono nel risultato. Una nota di
// credito (importo negativo) va sull'ultima annualità candidata già consumata
// (rimanenza sotto l'importo iniziale; senza importo: se una fattura o quota
// vi è già andata), altrimenti sulla prima, e fa risalire la rimanenza.

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

export interface AllocShare {
  commitment_id: number;
  fiscal_year: number;
  amount: number;
}

export interface AllocInvoice {
  id: number;
  date: string;
  amount: number;
  contract_id?: number;
  // Capitolo unico delle utenze delle righe; 0 = utenza senza capitolo; null = nessuna utenza o capitoli diversi.
  chapter?: number | null;
  year?: number;
  // Quote MANUAL/ACCOUNTING: non si spostano, consumano la rimanenza.
  fixed: AllocShare[];
}

function candidates(ordered: AllocCommitment[], i: AllocInvoice): AllocCommitment[] {
  const found = ordered.filter(
    (c) =>
      (i.contract_id === undefined || !c.contract_ids || c.contract_ids.includes(i.contract_id)) &&
      (i.year === undefined || c.fiscal_year === undefined || c.fiscal_year === i.year) &&
      (i.chapter === undefined || i.chapter === null || c.chapter === undefined || c.chapter === i.chapter),
  );
  if (i.chapter === null && new Set(found.map((c) => c.chapter)).size > 1) return [];
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

/** Ritorna id fattura → annualità per le sole fatture senza quote fisse (null = nessuna quota). */
export function allocate(commitments: AllocCommitment[], invoices: AllocInvoice[]): Map<number, AllocTarget | null> {
  const ordered = [...commitments].sort(byNumber);
  const remaining = new Map<string, number>(
    ordered.map((c) => [unitKey(c.id, c.fiscal_year), c.amount === null ? Infinity : Number(c.amount)]),
  );
  const initial = new Map(remaining);
  const touched = new Set<string>();
  for (const i of invoices) {
    for (const s of i.fixed) {
      const key = unitKey(s.commitment_id, s.fiscal_year);
      if (remaining.has(key)) {
        remaining.set(key, remaining.get(key)! - Number(s.amount));
        touched.add(key);
      }
    }
  }

  const result = new Map<number, AllocTarget | null>();
  const autoInvoices = invoices
    .filter((i) => !i.fixed.length)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
  for (const i of autoInvoices) {
    const pool = i.chapter === 0 ? [] : candidates(ordered, i);
    if (!pool.length) {
      result.set(i.id, null);
      continue;
    }
    const key = (c: AllocCommitment) => unitKey(c.id, c.fiscal_year);
    const consumed = (c: AllocCommitment) =>
      initial.get(key(c)) === Infinity ? touched.has(key(c)) : remaining.get(key(c))! < initial.get(key(c))!;
    const target =
      Number(i.amount) < 0
        ? ([...pool].reverse().find(consumed) ?? pool[0])
        : (pool.find((c) => remaining.get(key(c))! > 0) ?? pool[pool.length - 1]);
    remaining.set(key(target), remaining.get(key(target))! - Number(i.amount));
    touched.add(key(target));
    result.set(i.id, { id: target.id, fiscal_year: target.fiscal_year ?? null });
  }
  return result;
}

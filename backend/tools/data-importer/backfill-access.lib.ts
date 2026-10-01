// Funzioni pure per backfill-access.ts (recupero dati persi dall'import
// iniziale da Access). Nessun accesso DB: testabili in isolamento.

// Date Access salvate come testo libero: gg/mm/aaaa, g.m.aaaa, gg-mm-aaaa.
// Testo non riconducibile a una data reale ("indeterminata", "Az. … e
// Conc. …", 31/02) → null, da sistemare a mano.
// Campi data veri (non testo) arrivano dall'export mdbtools già ISO,
// eventualmente con orario: "2027-12-31 00:00:00".
export function parseItalianDate(value: string | null | undefined): string | null {
  const raw = (value ?? '').trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?: \d{2}:\d{2}:\d{2})?$/);
  const italian = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (!iso && !italian) return null;
  const [y, m, d] = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : [Number(italian[3]), Number(italian[2]), Number(italian[1])];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// "1.234,5" → 1234.5; "306.96" (già a punto) → 306.96.
export function parseItalianDecimal(value: string | null | undefined): number | null {
  const raw = (value ?? '').trim();
  if (!raw) return null;
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function normalizeCoordinate(value: string | null | undefined): string | null {
  const raw = (value ?? '').trim();
  return raw ? raw.replace(',', '.') : null;
}

// Testo troncato dall'import al primo a capo: si ripristina il valore Access
// solo se il DB è vuoto o ne è un prefisso (troncamento). Un valore DB
// diverso è stato modificato in produzione: non si tocca, si segnala.
export function truncatedTextFix(
  dbValue: string | null | undefined,
  accessValue: string | null | undefined,
): { value: string | null; conflict: boolean } {
  const access = (accessValue ?? '').trim();
  const db = (dbValue ?? '').trim();
  if (!access || db === access) return { value: null, conflict: false };
  if (!db || access.startsWith(db)) return { value: access, conflict: false };
  return { value: null, conflict: true };
}

export function hasMultilineField(row: Record<string, string>): boolean {
  return Object.values(row).some((v) => (v ?? '').includes('\n'));
}

// Conversione delle note importate dei presidi antincendio
// ("scad. carica AAAA; scad. collaudo AAAA; ultima verifica AAAA") nelle date
// della migration FireEquipmentDetails. Fuori da migrations/: TypeORM
// istanzierebbe come migration ogni funzione esportata da quei file.
export const IMPORTED_PREFIX = 'date importate: solo anno';


const PARTS = [
  { key: 'revision', re: /^scad\. carica (\d{4})$/, label: 'scad. carica' },
  { key: 'test', re: /^scad\. collaudo (\d{4})$/, label: 'scad. collaudo' },
  { key: 'check', re: /^ultima verifica (\d{4})$/, label: 'ultima verifica' },
] as const;

interface Split {
  revision: number | null;
  test: number | null;
  check: number | null;
  notes: string | null;
}

const pieces = (notes: string | null): string[] =>
  (notes ?? '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);

export function splitImportedNotes(notes: string | null): Split | null {
  const out: Split = { revision: null, test: null, check: null, notes: null };
  const rest: string[] = [];
  let found = false;
  for (const piece of pieces(notes)) {
    const part = PARTS.find((p) => p.re.test(piece));
    const year = part ? Number(part.re.exec(piece)![1]) : NaN;
    // Anni fuori scala = righe di riepilogo importate male, non date.
    if (part && year >= 1980 && year <= 2100) {
      out[part.key] = year;
      found = true;
    } else {
      rest.push(piece);
    }
  }
  if (!found) return null;
  out.notes = [IMPORTED_PREFIX, ...rest].join('; ');
  // Solo note che il down ricompone identiche (ordine canonico, nessun pezzo
  // ripetuto, testo extra in coda): le altre restano testo.
  return joinImportedNotes(out) === notes ? out : null;
}

export function joinImportedNotes(r: Split): string | null {
  const dates = PARTS.filter((p) => r[p.key] !== null).map((p) => `${p.label} ${r[p.key]}`);
  const rest = pieces(r.notes).filter((s) => s !== IMPORTED_PREFIX);
  const all = [...dates, ...rest];
  return all.length ? all.join('; ') : null;
}

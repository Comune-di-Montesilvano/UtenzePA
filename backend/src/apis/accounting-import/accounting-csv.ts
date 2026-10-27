// Parser del formato neutro dell'import contabilità (tracciato nella guida):
// UTF-8, separatore `;`, prima riga = intestazione con i nomi delle colonne in
// qualsiasi ordine. Importi con `.` o `,` decimale arrotondati al centesimo,
// date AAAA-MM-GG, booleani 1/0, celle vuote = null. Una riga non valida si
// scarta con il motivo; le altre si caricano.

export type AccKind = 'chapters' | 'commitments' | 'liquidations' | 'credit_notes';

export interface CsvIssue {
  line: number;
  message: string;
}

export interface AccChapterRow {
  year: number;
  chapter: string;
  article: number;
  description: string | null;
  initial_budget: number | null;
  adjusted_budget: number | null;
  spent: number | null;
}

export interface AccCommitmentRow {
  commitment_year: number;
  commitment_num: number;
  commitment_sub: number;
  fiscal_year: number;
  chapter: string;
  article: number;
  supplier_vat: string | null;
  amount: number;
  cig: string | null;
  cancelled: boolean;
  description: string | null;
}

export interface AccLiquidationRow {
  liquidation_key: string;
  commitment_year: number;
  commitment_num: number;
  commitment_sub: number;
  fiscal_year: number;
  sdi_identifier: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  invoice_total: number | null;
  invoice_cig: string | null;
  supplier_vat: string | null;
  amount: number;
  cancelled: boolean;
  // Facoltativi (formato dalla v1.52.0): mandato più recente e pagamento.
  liquidation_number?: string | null;
  mandate_number?: string | null;
  mandate_date?: string | null;
  paid_date?: string | null;
  paid_amount?: number | null;
}

// Nota di credito abbinata a una fattura (formato dalla v1.53.0, file
// facoltativo note_credito.csv): una riga per abbinamento, importo negativo
// = parte della nota compensata sulla fattura. Fiscal_year = esercizio di
// registrazione della nota.
export interface AccCreditNoteRow {
  link_key: string;
  fiscal_year: number;
  amount: number;
  supplier_vat: string | null;
  note_sdi_identifier: string | null;
  note_number: string | null;
  note_date: string | null;
  note_total: number | null;
  invoice_sdi_identifier: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  invoice_total: number | null;
}

export interface ParsedCsv<T> {
  rows: T[];
  issues: CsvIssue[];
}

type ColumnType = 'int' | 'text' | 'money' | 'date' | 'bool';
type Column = [name: string, type: ColumnType, required: boolean];

const COLUMNS: Record<AccKind, Column[]> = {
  chapters: [
    ['year', 'int', true],
    ['chapter', 'text', true],
    ['article', 'int', true],
    ['description', 'text', false],
    ['initial_budget', 'money', false],
    ['adjusted_budget', 'money', false],
    ['spent', 'money', false],
  ],
  commitments: [
    ['commitment_year', 'int', true],
    ['commitment_num', 'int', true],
    ['commitment_sub', 'int', true],
    ['fiscal_year', 'int', true],
    ['chapter', 'text', true],
    ['article', 'int', true],
    ['supplier_vat', 'text', false],
    ['amount', 'money', true],
    ['cig', 'text', false],
    ['cancelled', 'bool', false],
    ['description', 'text', false],
  ],
  liquidations: [
    ['liquidation_key', 'text', true],
    ['commitment_year', 'int', true],
    ['commitment_num', 'int', true],
    ['commitment_sub', 'int', true],
    ['fiscal_year', 'int', true],
    ['sdi_identifier', 'text', false],
    ['invoice_number', 'text', false],
    ['invoice_date', 'date', false],
    ['invoice_total', 'money', false],
    ['invoice_cig', 'text', false],
    ['supplier_vat', 'text', false],
    ['amount', 'money', true],
    ['cancelled', 'bool', false],
    ['liquidation_number', 'text', false],
    ['mandate_number', 'text', false],
    ['mandate_date', 'date', false],
    ['paid_date', 'date', false],
    ['paid_amount', 'money', false],
  ],
  credit_notes: [
    ['link_key', 'text', true],
    ['fiscal_year', 'int', true],
    ['amount', 'money', true],
    ['supplier_vat', 'text', false],
    ['note_sdi_identifier', 'text', false],
    ['note_number', 'text', false],
    ['note_date', 'date', false],
    ['note_total', 'money', false],
    ['invoice_sdi_identifier', 'text', false],
    ['invoice_number', 'text', false],
    ['invoice_date', 'date', false],
    ['invoice_total', 'money', false],
  ],
};

// Campi di una riga CSV con le virgolette del formato standard ("" = ").
function splitLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ';') {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields.map((f) => f.trim());
}

// Chiave di una riga: una ripetuta (CSV fatti a mano) raddoppierebbe importi e
// quote, quindi si scarta e vale la prima.
const KEYS: Record<AccKind, string[]> = {
  chapters: ['year', 'chapter', 'article'],
  commitments: ['commitment_year', 'commitment_num', 'commitment_sub', 'fiscal_year'],
  liquidations: ['liquidation_key'],
  credit_notes: ['link_key'],
};

// Lunghezze delle colonne delle tabelle acc_*: la descrizione si tronca, gli
// altri testi troppo lunghi scartano la riga (un valore fuori misura farebbe
// fallire tutto il caricamento).
const TEXT_MAX: Record<string, number> = {
  chapter: 50,
  supplier_vat: 16,
  cig: 20,
  invoice_cig: 20,
  sdi_identifier: 20,
  invoice_number: 50,
  liquidation_key: 50,
  liquidation_number: 30,
  mandate_number: 30,
  link_key: 60,
  note_sdi_identifier: 20,
  note_number: 50,
  invoice_sdi_identifier: 20,
};
const DESCRIPTION_MAX = 255;

function convert(
  name: string,
  raw: string,
  type: ColumnType,
): { value: unknown } | { error: string } {
  switch (type) {
    case 'text':
      if (name === 'description') return { value: raw.slice(0, DESCRIPTION_MAX) };
      return raw.length > (TEXT_MAX[name] ?? Infinity)
        ? { error: `più lungo di ${TEXT_MAX[name]} caratteri` }
        : { value: raw };
    case 'int':
      return /^-?\d+$/.test(raw) ? { value: Number(raw) } : { error: 'non è un numero intero' };
    case 'money': {
      const n = Number(raw.replace(',', '.'));
      return /^-?\d+([.,]\d+)?$/.test(raw) && Number.isFinite(n)
        ? { value: Math.round(n * 100) / 100 }
        : { error: 'non è un importo' };
    }
    case 'date':
      return /^\d{4}-\d{2}-\d{2}$/.test(raw)
        ? { value: raw }
        : { error: 'non è una data AAAA-MM-GG' };
    case 'bool':
      return raw === '1' || raw === '0' ? { value: raw === '1' } : { error: 'deve essere 1 o 0' };
  }
}

export function parseAccountingCsv(kind: 'chapters', text: string): ParsedCsv<AccChapterRow>;
export function parseAccountingCsv(kind: 'commitments', text: string): ParsedCsv<AccCommitmentRow>;
export function parseAccountingCsv(
  kind: 'liquidations',
  text: string,
): ParsedCsv<AccLiquidationRow>;
export function parseAccountingCsv(
  kind: 'credit_notes',
  text: string,
): ParsedCsv<AccCreditNoteRow>;
export function parseAccountingCsv(kind: AccKind, text: string): ParsedCsv<unknown>;
export function parseAccountingCsv(kind: AccKind, text: string): ParsedCsv<unknown> {
  // BOM UTF-8 iniziale (Excel) tolto.
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = body.split(/\r?\n/);
  const header = splitLine(lines[0] ?? '');
  const columns = COLUMNS[kind];
  const missing = columns
    .filter(([name, , required]) => required && !header.includes(name))
    .map(([name]) => name);
  if (missing.length) {
    return {
      rows: [],
      issues: [{ line: 1, message: `Colonne obbligatorie mancanti: ${missing.join(', ')}` }],
    };
  }
  const index = new Map(header.map((name, i) => [name, i]));
  const rows: Record<string, unknown>[] = [];
  const issues: CsvIssue[] = [];
  const seen = new Map<string, number>();
  lines.slice(1).forEach((line, i) => {
    if (!line.trim()) return;
    const fields = splitLine(line);
    const row: Record<string, unknown> = {};
    const errors: string[] = [];
    for (const [name, type, required] of columns) {
      const position = index.get(name);
      const raw = position === undefined ? '' : (fields[position] ?? '');
      if (raw === '') {
        if (required) errors.push(`${name} vuoto`);
        row[name] = type === 'bool' ? false : null;
        continue;
      }
      const result = convert(name, raw, type);
      if ('error' in result)
        errors.push(
          type === 'text' ? `${name} ${result.error}` : `${name} ${result.error} (${raw})`,
        );
      else row[name] = result.value;
    }
    if (errors.length) return issues.push({ line: i + 2, message: errors.join('; ') });
    const key = KEYS[kind].map((k) => String(row[k])).join('|');
    const first = seen.get(key);
    if (first !== undefined)
      return issues.push({
        line: i + 2,
        message: `riga ripetuta: stessa chiave della riga ${first}`,
      });
    seen.set(key, i + 2);
    rows.push(row);
  });
  return { rows, issues };
}

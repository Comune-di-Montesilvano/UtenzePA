// Parser del formato neutro dell'import contabilità (tracciato nella guida):
// UTF-8, separatore `;`, prima riga = intestazione con i nomi delle colonne in
// qualsiasi ordine. Importi con `.` o `,` decimale arrotondati al centesimo,
// date AAAA-MM-GG, booleani 1/0, celle vuote = null. Una riga non valida si
// scarta con il motivo; le altre si caricano.

export type AccKind = 'chapters' | 'commitments' | 'liquidations';

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

function convert(raw: string, type: ColumnType): { value: unknown } | { error: string } {
  switch (type) {
    case 'text':
      return { value: raw };
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
      const result = convert(raw, type);
      if ('error' in result) errors.push(`${name} ${result.error} (${raw})`);
      else row[name] = result.value;
    }
    if (errors.length) issues.push({ line: i + 2, message: errors.join('; ') });
    else rows.push(row);
  });
  return { rows, issues };
}

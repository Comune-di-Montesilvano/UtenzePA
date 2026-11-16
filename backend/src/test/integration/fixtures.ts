import { DataSource } from 'typeorm';
import { SYSTEM_USER_ID } from '@apis/system-users/system-user.constants';

// Dati minimi per i test d'integrazione: valori finti, autore = utente di sistema
// (creato dalla migration SystemUser). Ogni funzione restituisce l'id inserito; `over`
// sovrascrive o aggiunge colonne (nomi delle colonne SQL).
type Row = Record<string, unknown>;

let seq = 0;
const next = (): number => ++seq;

async function insert(ds: DataSource, table: string, row: Row): Promise<number> {
  const cols = Object.keys(row);
  const result = await ds.query(
    `INSERT INTO \`${table}\` (${cols.map((c) => `\`${c}\``).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    cols.map((c) => row[c]),
  );
  return Number(result.insertId);
}

const authored = (): Row => ({ created_by_user_id: SYSTEM_USER_ID, updated_by_user_id: SYSTEM_USER_ID });

export async function insertUtility(ds: DataSource, over: Row = {}): Promise<number> {
  const [type] = await ds.query('SELECT MIN(id) AS id FROM utility_types');
  return insert(ds, 'utilities', {
    ...authored(),
    utility_id: `IT-UT-${next()}`,
    utility_type_id_fk: type.id,
    ...over,
  });
}

export async function insertInvoice(ds: DataSource, over: Row = {}): Promise<number> {
  return insert(ds, 'invoices', {
    ...authored(),
    invoice_id: `IT-FT-${next()}`,
    invoice_date: '2025-06-15',
    ...over,
  });
}

export async function insertInvoiceLine(
  ds: DataSource,
  invoiceId: number,
  amount: number,
  over: Row = {},
): Promise<number> {
  return insert(ds, 'invoice_lines', { invoice_id_fk: invoiceId, amount, ...over });
}

import { EntityManager } from 'typeorm';
import { NOT_DRAFT_SQL } from '@apis/contracts/contract-draft';

// Letture dell'import fatture dalla PEC e dei pattern.

type Row = Record<string, unknown>;

const SUPPLIER_NAME = "COALESCE(tp.company_name, CONCAT_WS(' ', tp.last_name, tp.first_name))";

// Messaggi per stato e ultimi errori (pannello Motore).
export function statusCounts(m: EntityManager): Promise<{ status: string; total: number }[]> {
  return m.query('SELECT status, COUNT(*) AS total FROM sdi_messages GROUP BY status');
}

export function recentErrors(
  m: EntityManager,
): Promise<{ file_name: string; error: string | null; create_date: Date }[]> {
  return m.query(
    "SELECT file_name, error, create_date FROM sdi_messages WHERE status = 'ERROR' ORDER BY id DESC LIMIT 10",
  );
}

// Messaggi registrati prima dei pattern (parte 1): struttura completata a blocchi.
// Anche il tipo documento (v1.40.0), per separare fatture e note di credito.
export async function backfillIds(m: EntityManager): Promise<number[]> {
  const rows: { id: number }[] = await m.query(
    "SELECT id FROM sdi_messages WHERE kind = 'INVOICE' AND status IN ('PENDING', 'LINKED') " +
      "AND (structure_key IS NULL OR (document_type IS NULL AND structure_key <> '')) " +
      'AND supplier_id_fk IS NOT NULL ORDER BY id LIMIT 200',
  );
  return rows.map((r) => Number(r.id));
}

// Fatture ferme per matricola diversa (fino alla v1.38): ora la matricola si
// aggiorna dalla fattura, quindi si rielaborano; la rielaborazione toglie la segnalazione.
export async function unblockedIds(m: EntityManager): Promise<number[]> {
  const rows: { id: number }[] = await m.query(
    "SELECT m.id FROM sdi_messages m WHERE m.kind = 'INVOICE' AND m.status IN ('PENDING', 'LINKED') " +
      'AND m.pattern_id_fk IS NOT NULL ' +
      "AND EXISTS (SELECT 1 FROM invoice_import_issues ii WHERE ii.sdi_message_id_fk = m.id AND ii.type = 'METER_MISMATCH') " +
      'ORDER BY m.id LIMIT 200',
  );
  return rows.map((r) => Number(r.id));
}

// Fatture fuori perimetro il cui fornitore ora è in perimetro (aggiunto in anagrafica
// con un contratto dopo l'arrivo): tornano in attesa e si rielaborano. Senza
// identificativo SDI (copie delle fatture emesse dal Comune) restano fuori.
export async function rescopable(m: EntityManager): Promise<{ id: number; supplier_id: number }[]> {
  const rows: Row[] = await m.query(
    'SELECT m.id, tp.id AS supplier_id FROM sdi_messages m JOIN third_parties tp ON tp.vat_number = m.supplier_vat AND tp.deleted = 0 ' +
      "WHERE m.kind = 'INVOICE' AND m.status = 'OUT_OF_SCOPE' AND m.sdi_identifier IS NOT NULL " +
      `AND EXISTS (SELECT 1 FROM contracts c WHERE c.supplier_id_fk = tp.id AND c.deleted = 0 AND ${NOT_DRAFT_SQL('c')}) ` +
      'ORDER BY m.id LIMIT 200',
  );
  return rows.map((r) => ({ id: Number(r.id), supplier_id: Number(r.supplier_id) }));
}

// Fornitore in perimetro: in anagrafica con questa P.IVA e almeno un contratto di fornitura.
export async function supplierInScope(m: EntityManager, vat: string): Promise<number | null> {
  const [row]: Row[] = await m.query(
    'SELECT tp.id FROM third_parties tp WHERE tp.deleted = 0 AND tp.vat_number = ? ' +
      `AND EXISTS (SELECT 1 FROM contracts c WHERE c.supplier_id_fk = tp.id AND c.deleted = 0 AND ${NOT_DRAFT_SQL('c')}) LIMIT 1`,
    [vat],
  );
  return row ? Number(row.id) : null;
}

// Messaggi in attesa con la fattura ormai inserita (stesso fornitore, numero e data).
export async function pendingRelinks(
  m: EntityManager,
): Promise<{ id: number; sdi_identifier: string; invoice_id: number }[]> {
  const rows: Row[] = await m.query(
    `SELECT m.id, m.sdi_identifier, MIN(i.id) AS invoice_id
       FROM sdi_messages m
       JOIN invoices i ON i.supplier_id_fk = m.supplier_id_fk AND i.invoice_id = m.document_number
                      AND i.invoice_date = m.document_date AND i.deleted = 0
      WHERE m.status = 'PENDING' AND m.sdi_identifier IS NOT NULL
      GROUP BY m.id, m.sdi_identifier`,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    sdi_identifier: String(r.sdi_identifier),
    invoice_id: Number(r.invoice_id),
  }));
}

// Pattern non cancellati con fornitore, fatture estratte e fattura d'esempio.
export function patternList(m: EntityManager): Promise<Row[]> {
  return m.query(
    `SELECT p.id, p.name, p.supplier_id_fk AS supplier_id, ${SUPPLIER_NAME} AS supplier, ` +
      'p.ignored, p.document_type, p.structure_key, p.update_date, ' +
      "(SELECT COUNT(*) FROM sdi_messages m WHERE m.pattern_id_fk = p.id AND m.status = 'EXTRACTED') AS extracted, " +
      '(SELECT MAX(m.id) FROM sdi_messages m WHERE m.supplier_id_fk = p.supplier_id_fk ' +
      "AND m.structure_key = p.structure_key AND m.kind = 'INVOICE') AS sample_message_id " +
      'FROM invoice_patterns p JOIN third_parties tp ON tp.id = p.supplier_id_fk ' +
      'WHERE p.deleted = 0 ORDER BY p.ignored, supplier, p.name',
  );
}

export async function supplierName(m: EntityManager, id: number | null): Promise<string> {
  const [row]: Row[] = await m.query(
    `SELECT ${SUPPLIER_NAME} AS supplier FROM third_parties tp WHERE tp.id = ?`,
    [id],
  );
  return (row?.supplier as string | undefined) ?? '';
}

// Fatture del fornitore senza pattern, dello stesso tipo documento (vuoto = non letto).
export function similarMessages(
  m: EntityManager,
  supplierId: number | null,
  documentType: string,
): Promise<{ id: number; structure_key: string | null; document_number: string | null }[]> {
  return m.query(
    'SELECT m.id, m.structure_key, m.document_number FROM sdi_messages m ' +
      "WHERE m.kind = 'INVOICE' AND m.supplier_id_fk = ? AND IFNULL(m.document_type, '') = ? " +
      "AND m.status IN ('PENDING', 'LINKED') AND m.pattern_id_fk IS NULL " +
      'ORDER BY m.id DESC LIMIT 1000',
    [supplierId, documentType],
  );
}

// Fatture da rielaborare dopo il salvataggio di un pattern del fornitore.
export async function reprocessIds(
  m: EntityManager,
  supplierId: number,
  patternId: number,
): Promise<number[]> {
  const rows: { id: number }[] = await m.query(
    "SELECT id FROM sdi_messages WHERE kind = 'INVOICE' AND supplier_id_fk = ? " +
      "AND (status IN ('PENDING', 'LINKED') OR (status = 'EXTRACTED' AND pattern_id_fk = ?)) " +
      'ORDER BY id',
    [supplierId, patternId],
  );
  return rows.map((r) => Number(r.id));
}

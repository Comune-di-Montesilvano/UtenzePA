import { partyNameSql } from '@apis/third-parties/third-party.name';

// Nota di credito in SQL (gemella di isCreditNoteType); tipo non ancora letto = fattura.
export const CREDIT_NOTE_SQL = "IFNULL(m.document_type, '') IN ('TD04', 'TD08')";

// Fatture del fornitore che nessun pattern copre: una riga per fornitore e tipo
// (fatture / note di credito, con pattern separati; tag facoltativi diversi non
// fanno strutture a parte), con l'ultima fattura della struttura più frequente
// come esempio da aprire nell'editor. Con i TipoDocumento presenti (es. TD01, TD02)
// e quante fatture hanno il tipo non ancora letto dalla PEC.
const UNKNOWN_WHERE = `m.kind = 'INVOICE' AND m.status IN ('PENDING', 'LINKED') AND m.pattern_id_fk IS NULL
             AND m.structure_key IS NOT NULL AND m.structure_key <> ''`;

// Fatture senza pattern col tipo non ancora letto (registrate prima della v1.40.0).
export const UNTYPED_SQL = `SELECT m.id FROM sdi_messages m WHERE ${UNKNOWN_WHERE} AND m.document_type IS NULL
   ORDER BY m.id DESC LIMIT 25`;

export const UNKNOWN_STRUCTURES_SQL = `
  SELECT s.supplier_id, supplier, s.credit_note, structure_key, total AS count, structures, message_id,
         t.document_types, t.untyped
    FROM (SELECT m.supplier_id_fk AS supplier_id, ${partyNameSql('tp')} AS supplier, m.structure_key,
                 ${CREDIT_NOTE_SQL} AS credit_note,
                 MAX(m.id) AS message_id,
                 SUM(COUNT(*)) OVER (PARTITION BY m.supplier_id_fk, ${CREDIT_NOTE_SQL}) AS total,
                 COUNT(*) OVER (PARTITION BY m.supplier_id_fk, ${CREDIT_NOTE_SQL}) AS structures,
                 ROW_NUMBER() OVER (PARTITION BY m.supplier_id_fk, ${CREDIT_NOTE_SQL}
                                    ORDER BY COUNT(*) DESC, MAX(m.id) DESC) AS rn
            FROM sdi_messages m
            JOIN third_parties tp ON tp.id = m.supplier_id_fk
           WHERE ${UNKNOWN_WHERE}
           GROUP BY m.supplier_id_fk, supplier, m.structure_key, credit_note) s
    JOIN (SELECT m.supplier_id_fk AS supplier_id, ${CREDIT_NOTE_SQL} AS credit_note,
                 GROUP_CONCAT(DISTINCT m.document_type ORDER BY m.document_type SEPARATOR ', ') AS document_types,
                 SUM(m.document_type IS NULL) AS untyped
            FROM sdi_messages m
           WHERE ${UNKNOWN_WHERE}
           GROUP BY m.supplier_id_fk, credit_note) t
      ON t.supplier_id = s.supplier_id AND t.credit_note = s.credit_note
   WHERE rn = 1
   ORDER BY count DESC, supplier, credit_note`;

export interface UnknownStructureRow {
  supplier_id: number;
  supplier: string;
  credit_note: boolean;
  structure_key: string;
  count: number;
  structures: number;
  message_id: number;
  // TipoDocumento presenti (es. «TD01, TD02») e fatture col tipo non ancora letto.
  document_types: string;
  untyped: number;
}

export function toUnknownStructure(r: Record<string, unknown>): UnknownStructureRow {
  return {
    supplier_id: Number(r.supplier_id),
    supplier: String(r.supplier),
    credit_note: !!Number(r.credit_note),
    structure_key: String(r.structure_key),
    count: Number(r.count),
    structures: Number(r.structures),
    message_id: Number(r.message_id),
    document_types: r.document_types ? String(r.document_types) : '',
    untyped: Number(r.untyped ?? 0),
  };
}

import { partyNameSql } from '@apis/third-parties/third-party.name';

const UNKNOWN_WHERE = `m.kind = 'INVOICE' AND m.status IN ('PENDING', 'LINKED') AND m.pattern_id_fk IS NULL
             AND m.structure_key IS NOT NULL AND m.structure_key <> ''`;

// Tipo documento della fattura; vuoto = non ancora letto dalla PEC.
const TYPE_SQL = "IFNULL(m.document_type, '')";

// Fatture senza pattern col tipo non ancora letto (registrate prima della v1.40.0).
export const UNTYPED_SQL = `SELECT m.id FROM sdi_messages m WHERE ${UNKNOWN_WHERE} AND m.document_type IS NULL
   ORDER BY m.id DESC LIMIT 25`;

// Fatture del fornitore che nessun pattern copre: una riga per fornitore e tipo
// documento (pattern separati per tipo; tag facoltativi diversi non fanno strutture
// a parte), con l'ultima fattura della struttura più frequente come esempio da
// aprire nell'editor.
export const UNKNOWN_STRUCTURES_SQL = `
  SELECT supplier_id, supplier, document_type, structure_key, total AS count, structures, message_id
    FROM (SELECT m.supplier_id_fk AS supplier_id, ${partyNameSql('tp')} AS supplier, m.structure_key,
                 ${TYPE_SQL} AS document_type,
                 MAX(m.id) AS message_id,
                 SUM(COUNT(*)) OVER (PARTITION BY m.supplier_id_fk, ${TYPE_SQL}) AS total,
                 COUNT(*) OVER (PARTITION BY m.supplier_id_fk, ${TYPE_SQL}) AS structures,
                 ROW_NUMBER() OVER (PARTITION BY m.supplier_id_fk, ${TYPE_SQL}
                                    ORDER BY COUNT(*) DESC, MAX(m.id) DESC) AS rn
            FROM sdi_messages m
            JOIN third_parties tp ON tp.id = m.supplier_id_fk
           WHERE ${UNKNOWN_WHERE}
           GROUP BY m.supplier_id_fk, supplier, m.structure_key, document_type) s
   WHERE rn = 1
   ORDER BY document_type, count DESC, supplier`;

export interface UnknownStructureRow {
  supplier_id: number;
  supplier: string;
  // TipoDocumento (TD01, TD02, TD04…); vuoto = non ancora letto dalla PEC.
  document_type: string;
  structure_key: string;
  count: number;
  structures: number;
  message_id: number;
}

export function toUnknownStructure(r: Record<string, unknown>): UnknownStructureRow {
  return {
    supplier_id: Number(r.supplier_id),
    supplier: String(r.supplier),
    document_type: String(r.document_type ?? ''),
    structure_key: String(r.structure_key),
    count: Number(r.count),
    structures: Number(r.structures),
    message_id: Number(r.message_id),
  };
}

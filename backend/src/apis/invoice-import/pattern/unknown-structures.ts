import { partyNameSql } from '@apis/third-parties/third-party.name';

// Fatture del fornitore che nessun pattern copre: una riga per fornitore (tag
// facoltativi diversi non fanno strutture a parte), con l'ultima fattura della
// struttura più frequente come esempio da aprire nell'editor.
export const UNKNOWN_STRUCTURES_SQL = `
  SELECT supplier_id, supplier, structure_key, total AS count, structures, message_id
    FROM (SELECT m.supplier_id_fk AS supplier_id, ${partyNameSql('tp')} AS supplier, m.structure_key,
                 MAX(m.id) AS message_id,
                 SUM(COUNT(*)) OVER (PARTITION BY m.supplier_id_fk) AS total,
                 COUNT(*) OVER (PARTITION BY m.supplier_id_fk) AS structures,
                 ROW_NUMBER() OVER (PARTITION BY m.supplier_id_fk ORDER BY COUNT(*) DESC, MAX(m.id) DESC) AS rn
            FROM sdi_messages m
            JOIN third_parties tp ON tp.id = m.supplier_id_fk
           WHERE m.kind = 'INVOICE' AND m.status IN ('PENDING', 'LINKED') AND m.pattern_id_fk IS NULL
             AND m.structure_key IS NOT NULL AND m.structure_key <> ''
           GROUP BY m.supplier_id_fk, supplier, m.structure_key) s
   WHERE rn = 1
   ORDER BY count DESC, supplier`;

export interface UnknownStructureRow {
  supplier_id: number;
  supplier: string;
  structure_key: string;
  count: number;
  structures: number;
  message_id: number;
}

export function toUnknownStructure(r: Record<string, unknown>): UnknownStructureRow {
  return {
    supplier_id: Number(r.supplier_id),
    supplier: String(r.supplier),
    structure_key: String(r.structure_key),
    count: Number(r.count),
    structures: Number(r.structures),
    message_id: Number(r.message_id),
  };
}

import { EntityManager, In } from 'typeorm';
import { NOT_DRAFT_SQL } from '@apis/contracts/contract-draft';
import { SdiMessage } from './entity/sdi-message.entity';
import { InvoicePattern } from './entity/invoice-pattern.entity';
import { type SdiMessageKind, SdiMessageStatus } from './enum/sdi-message-status.enum';

// Letture dell'import fatture dalla PEC e dei pattern.

type Row = Record<string, unknown>;

const SUPPLIER_NAME = "COALESCE(tp.company_name, CONCAT_WS(' ', tp.last_name, tp.first_name))";
const INVOICE: SdiMessageKind = 'INVOICE';
const OPEN = [SdiMessageStatus.PENDING, SdiMessageStatus.LINKED];
// Fornitore (alias tp) con almeno un contratto di fornitura non cancellato e non in bozza.
const HAS_CONTRACT = `EXISTS (SELECT 1 FROM contracts c WHERE c.supplier_id_fk = tp.id AND c.deleted = 0 AND ${NOT_DRAFT_SQL('c')})`;

const messages = (m: EntityManager) => m.getRepository(SdiMessage);
const ids = (rows: { id: number }[]): number[] => rows.map((r) => Number(r.id));

// Messaggi per stato e ultimi errori (pannello Motore).
export function statusCounts(m: EntityManager): Promise<{ status: string; total: number }[]> {
  return messages(m)
    .createQueryBuilder('m')
    .select('m.status', 'status')
    .addSelect('COUNT(*)', 'total')
    .groupBy('m.status')
    .getRawMany();
}

export function recentErrors(
  m: EntityManager,
): Promise<{ file_name: string; error: string | null; create_date: Date }[]> {
  return messages(m).find({
    select: { file_name: true, error: true, create_date: true },
    where: { status: SdiMessageStatus.ERROR },
    order: { id: 'DESC' },
    take: 10,
  });
}

// Messaggi registrati prima dei pattern (parte 1): struttura completata a blocchi.
// Anche il tipo documento (v1.40.0), per separare fatture e note di credito.
export async function backfillIds(m: EntityManager): Promise<number[]> {
  const rows = await messages(m)
    .createQueryBuilder('m')
    .select('m.id', 'id')
    .where('m.kind = :kind AND m.status IN (:...open)', { kind: INVOICE, open: OPEN })
    .andWhere("(m.structure_key IS NULL OR (m.document_type IS NULL AND m.structure_key <> ''))")
    .andWhere('m.supplier_id_fk IS NOT NULL')
    .orderBy('m.id')
    .limit(200)
    .getRawMany();
  return ids(rows);
}

// Fatture ferme per matricola diversa (fino alla v1.38): ora la matricola si
// aggiorna dalla fattura, quindi si rielaborano; la rielaborazione toglie la segnalazione.
export async function unblockedIds(m: EntityManager): Promise<number[]> {
  const rows = await messages(m)
    .createQueryBuilder('m')
    .select('m.id', 'id')
    .where('m.kind = :kind AND m.status IN (:...open)', { kind: INVOICE, open: OPEN })
    .andWhere('m.pattern_id_fk IS NOT NULL')
    .andWhere(
      "EXISTS (SELECT 1 FROM invoice_import_issues ii WHERE ii.sdi_message_id_fk = m.id AND ii.type = 'METER_MISMATCH')",
    )
    .orderBy('m.id')
    .limit(200)
    .getRawMany();
  return ids(rows);
}

// Fatture fuori perimetro il cui fornitore ora è in perimetro (aggiunto in anagrafica
// con un contratto dopo l'arrivo): tornano in attesa e si rielaborano. Senza
// identificativo SDI (copie delle fatture emesse dal Comune) restano fuori.
export async function rescopable(m: EntityManager): Promise<{ id: number; supplier_id: number }[]> {
  const rows: Row[] = await messages(m)
    .createQueryBuilder('m')
    .select('m.id', 'id')
    .addSelect('tp.id', 'supplier_id')
    .innerJoin('third_parties', 'tp', 'tp.vat_number = m.supplier_vat AND tp.deleted = 0')
    .where('m.kind = :kind AND m.status = :status', {
      kind: INVOICE,
      status: SdiMessageStatus.OUT_OF_SCOPE,
    })
    .andWhere('m.sdi_identifier IS NOT NULL')
    .andWhere(HAS_CONTRACT)
    .orderBy('m.id')
    .limit(200)
    .getRawMany();
  return rows.map((r) => ({ id: Number(r.id), supplier_id: Number(r.supplier_id) }));
}

// Fornitore in perimetro: in anagrafica con questa P.IVA e almeno un contratto di fornitura.
export async function supplierInScope(m: EntityManager, vat: string): Promise<number | null> {
  const row: Row | undefined = await m
    .createQueryBuilder()
    .select('tp.id', 'id')
    .from('third_parties', 'tp')
    .where('tp.deleted = 0 AND tp.vat_number = :vat', { vat })
    .andWhere(HAS_CONTRACT)
    .limit(1)
    .getRawOne();
  return row ? Number(row.id) : null;
}

// Messaggi in attesa con la fattura ormai inserita (stesso fornitore, numero e data).
export async function pendingRelinks(
  m: EntityManager,
): Promise<{ id: number; sdi_identifier: string; invoice_id: number }[]> {
  const rows: Row[] = await messages(m)
    .createQueryBuilder('m')
    .select('m.id', 'id')
    .addSelect('m.sdi_identifier', 'sdi_identifier')
    .addSelect('MIN(i.id)', 'invoice_id')
    .innerJoin(
      'invoices',
      'i',
      'i.supplier_id_fk = m.supplier_id_fk AND i.invoice_id = m.document_number ' +
        'AND i.invoice_date = m.document_date AND i.deleted = 0',
    )
    .where('m.status = :status', { status: SdiMessageStatus.PENDING })
    .andWhere('m.sdi_identifier IS NOT NULL')
    .groupBy('m.id')
    .addGroupBy('m.sdi_identifier')
    .getRawMany();
  return rows.map((r) => ({
    id: Number(r.id),
    sdi_identifier: String(r.sdi_identifier),
    invoice_id: Number(r.invoice_id),
  }));
}

// Pattern non cancellati con fornitore, fatture estratte e fattura d'esempio.
export function patternList(m: EntityManager): Promise<Row[]> {
  return m
    .getRepository(InvoicePattern)
    .createQueryBuilder('p')
    .select('p.id', 'id')
    .addSelect('p.name', 'name')
    .addSelect('p.supplier_id_fk', 'supplier_id')
    .addSelect(SUPPLIER_NAME, 'supplier')
    .addSelect('p.ignored', 'ignored')
    .addSelect('p.document_type', 'document_type')
    .addSelect('p.structure_key', 'structure_key')
    .addSelect('p.update_date', 'update_date')
    .addSelect(
      (sub) =>
        sub
          .select('COUNT(*)')
          .from(SdiMessage, 'm')
          .where('m.pattern_id_fk = p.id AND m.status = :extracted', {
            extracted: SdiMessageStatus.EXTRACTED,
          }),
      'extracted',
    )
    .addSelect(
      (sub) =>
        sub
          .select('MAX(m.id)')
          .from(SdiMessage, 'm')
          .where('m.supplier_id_fk = p.supplier_id_fk AND m.structure_key = p.structure_key')
          .andWhere('m.kind = :invoice', { invoice: INVOICE }),
      'sample_message_id',
    )
    .innerJoin('third_parties', 'tp', 'tp.id = p.supplier_id_fk')
    .where('p.deleted = 0')
    .orderBy('p.ignored')
    .addOrderBy('supplier')
    .addOrderBy('p.name')
    .getRawMany();
}

export async function supplierName(m: EntityManager, id: number | null): Promise<string> {
  if (id === null) return '';
  const row: Row | undefined = await m
    .createQueryBuilder()
    .select(SUPPLIER_NAME, 'supplier')
    .from('third_parties', 'tp')
    .where('tp.id = :id', { id })
    .getRawOne();
  return (row?.supplier as string | undefined) ?? '';
}

// Fatture del fornitore senza pattern, dello stesso tipo documento (vuoto = non letto).
export function similarMessages(
  m: EntityManager,
  supplierId: number | null,
  documentType: string,
): Promise<{ id: number; structure_key: string | null; document_number: string | null }[]> {
  return messages(m)
    .createQueryBuilder('m')
    .select('m.id', 'id')
    .addSelect('m.structure_key', 'structure_key')
    .addSelect('m.document_number', 'document_number')
    .where('m.kind = :kind AND m.supplier_id_fk = :supplierId', {
      kind: INVOICE,
      supplierId,
    })
    .andWhere("IFNULL(m.document_type, '') = :documentType", { documentType })
    .andWhere('m.status IN (:...open) AND m.pattern_id_fk IS NULL', { open: OPEN })
    .orderBy('m.id', 'DESC')
    .limit(1000)
    .getRawMany();
}

// Fatture da rielaborare dopo il salvataggio di un pattern del fornitore.
export async function reprocessIds(
  m: EntityManager,
  supplierId: number,
  patternId: number,
): Promise<number[]> {
  const rows = await messages(m).find({
    select: { id: true },
    where: [
      { kind: INVOICE, supplier_id_fk: supplierId, status: In(OPEN) },
      {
        kind: INVOICE,
        supplier_id_fk: supplierId,
        status: SdiMessageStatus.EXTRACTED,
        pattern_id_fk: patternId,
      },
    ],
    order: { id: 'ASC' },
  });
  return ids(rows);
}

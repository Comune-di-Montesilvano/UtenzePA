import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { AuditLogService, type RecordChangeInput } from '@apis/audit-log/audit-log.service';
import { AuditAction } from '@apis/audit-log/entity/audit-log.entity';
import { SdiMessageStatus } from '@apis/invoice-import/enum/sdi-message-status.enum';
import { Invoice } from '@apis/invoices/entity/invoice.entity';
import { deriveSdiStatus, NOT_REJECTED_SQL, type SdiEvent } from '@apis/invoices/sdi-status';
import { SYSTEM_USER_ID } from '@apis/system-users/system-user.constants';
import type { AccLiquidationRow } from './accounting-csv';
import { AccountingDataService } from './accounting-data.service';
import {
  invoiceKey,
  matchInvoices,
  type MatchableDocument,
  type MatchableInvoice,
} from './invoice-match';
import { RecordSource } from './record-source.enum';

const INVOICES_SQL =
  '/* a_invoices */ SELECT i.id, COALESCE(NULLIF(t.vat_number, ""), t.tax_code) AS supplier_vat, ' +
  "i.invoice_id AS invoice_number, DATE_FORMAT(i.invoice_date, '%Y-%m-%d') AS invoice_date, i.sdi_identifier " +
  `FROM invoices i LEFT JOIN third_parties t ON t.id = i.supplier_id_fk WHERE i.deleted = 0 AND ${NOT_REJECTED_SQL('i')}`;
const CONTRACTS_SQL =
  '/* a_contracts */ SELECT id, supplier_id_fk, cig_contract FROM contracts WHERE deleted = 0 AND cig_contract IS NOT NULL';
const MESSAGES_SQL =
  '/* a_messages */ SELECT kind, outcome, status, received_at, create_date FROM sdi_messages WHERE sdi_identifier = ?';
// Stato SDI scritto dal sistema: non cambia «Ultima modifica».
const KEEP_UPDATE_DATE = { update_date: () => '`update_date`' };

// Fatture dal registro della contabilità: crea quelle pagate che UtenzePA non
// ha (fornitori del perimetro, totale noto) e completa l'IdentificativoSdI di
// quelle abbinate che non lo hanno. Le righe restano all'import PEC o a mano.
@Injectable()
export class AccountingInvoiceService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly data: AccountingDataService,
    private readonly audit: AuditLogService,
  ) {}

  async matchedByKey(): Promise<Map<string, number>> {
    const [liquidations, invoices] = await Promise.all([this.data.liquidations(), this.invoices()]);
    return matchInvoices(liquidations, invoices);
  }

  // Abbinamenti delle note di credito: nota e fattura di ciascuno, se in UtenzePA.
  async creditNoteLinks(): Promise<{ amount: number; noteId?: number; invoiceId?: number }[]> {
    const [links, invoices] = await Promise.all([this.data.creditNotes(), this.invoices()]);
    const side = (key: string, sdi: string | null, number: string | null, date: string | null, vat: string | null): MatchableDocument => ({
      liquidation_key: key,
      sdi_identifier: sdi,
      invoice_number: number,
      invoice_date: date,
      supplier_vat: vat,
    });
    const docs = links.flatMap((l) => [
      side(`N|${l.link_key}`, l.note_sdi_identifier, l.note_number, l.note_date, l.supplier_vat),
      side(`F|${l.link_key}`, l.invoice_sdi_identifier, l.invoice_number, l.invoice_date, l.supplier_vat),
    ]);
    const matched = matchInvoices(docs, invoices);
    return links.map((l) => ({
      amount: l.amount,
      noteId: matched.get(`N|${l.link_key}`),
      invoiceId: matched.get(`F|${l.link_key}`),
    }));
  }

  async apply(): Promise<Record<'created' | 'sdiCompleted', number>> {
    const [liquidations, invoices, suppliers, contracts] = await Promise.all([
      this.data.liquidations(),
      this.invoices(),
      this.data.suppliersByVat(),
      this.dataSource.query(CONTRACTS_SQL),
    ]);
    const valid = liquidations.filter((l) => !l.cancelled);
    const matched = matchInvoices(valid, invoices);
    const byId = new Map(invoices.map((i) => [i.id, i]));

    const toCreate = new Map<string, AccLiquidationRow>();
    const sdiFor = new Map<number, string>();
    for (const l of valid) {
      const id = matched.get(l.liquidation_key);
      if (id !== undefined) {
        if (l.sdi_identifier && !byId.get(id)?.sdi_identifier && !sdiFor.has(id))
          sdiFor.set(id, l.sdi_identifier);
        continue;
      }
      if (!l.supplier_vat || !suppliers.has(l.supplier_vat)) continue;
      if (l.invoice_total === null || !l.invoice_number || !l.invoice_date) continue;
      const key = invoiceKey(l.supplier_vat, l.invoice_number, l.invoice_date);
      if (!toCreate.has(key)) toCreate.set(key, l);
    }

    const result = { created: 0, sdiCompleted: 0 };
    const audits: RecordChangeInput[] = [];
    await this.dataSource.transaction(async (manager) => {
      for (const l of toCreate.values()) {
        const supplierId = suppliers.get(l.supplier_vat!)!;
        const { identifiers } = await manager.insert(Invoice, {
          invoice_id: l.invoice_number,
          invoice_date: l.invoice_date,
          supplier_id_fk: supplierId,
          total_amount: l.invoice_total,
          sdi_identifier: l.sdi_identifier,
          contratto_id_fk: contractByCig(contracts, supplierId, l.invoice_cig),
          source: RecordSource.ACCOUNTING,
          created_by_user_id: SYSTEM_USER_ID,
          updated_by_user_id: SYSTEM_USER_ID,
        } as never);
        const id = Number(identifiers[0].id);
        if (l.sdi_identifier) await this.refreshSdiStatus(manager, id, l.sdi_identifier);
        audits.push({
          entityName: 'invoices',
          entityId: id,
          action: AuditAction.CREATE,
          userId: SYSTEM_USER_ID,
        });
        result.created++;
      }
      for (const [id, sdi] of sdiFor) {
        await manager.update(Invoice, id, {
          sdi_identifier: sdi,
          updated_by_user_id: SYSTEM_USER_ID,
        } as never);
        await this.refreshSdiStatus(manager, id, sdi);
        audits.push({
          entityName: 'invoices',
          entityId: id,
          action: AuditAction.UPDATE,
          userId: SYSTEM_USER_ID,
          fields: [{ fieldName: 'sdi_identifier', oldValue: null, newValue: sdi }],
        });
        result.sdiCompleted++;
      }
    });
    for (const entry of audits) await this.audit.record(entry);
    return result;
  }

  private async invoices(): Promise<MatchableInvoice[]> {
    const rows: Record<string, unknown>[] = await this.dataSource.query(INVOICES_SQL);
    return rows.map((r) => ({
      id: Number(r.id),
      supplier_vat: (r.supplier_vat as string | null) ?? null,
      invoice_number: String(r.invoice_number),
      invoice_date: String(r.invoice_date),
      sdi_identifier: (r.sdi_identifier as string | null) ?? null,
    }));
  }

  // Stato SDI dai messaggi PEC già registrati con quell'identificativo, come
  // nell'import PEC; senza messaggi resta vuoto.
  private async refreshSdiStatus(manager: EntityManager, id: number, sdi: string): Promise<void> {
    const rows: Record<string, unknown>[] = await this.dataSource.query(MESSAGES_SQL, [sdi]);
    const events: SdiEvent[] = rows
      .filter((r) => r.status !== SdiMessageStatus.ERROR)
      .map((r) => ({
        kind: r.kind as SdiEvent['kind'],
        outcome: r.outcome === 'EC01' || r.outcome === 'EC02' ? r.outcome : null,
        at: new Date((r.received_at ?? r.create_date) as string),
      }));
    const { status, outcomeDiscarded } = deriveSdiStatus(events);
    if (!status) return;
    await manager.update(Invoice, id, {
      sdi_status: status,
      sdi_outcome_discarded: outcomeDiscarded,
      ...KEEP_UPDATE_DATE,
    } as never);
  }
}

// Contratto della fattura dal CIG: solo se lo indica un unico contratto del fornitore.
function contractByCig(
  contracts: { id: number; supplier_id_fk: number; cig_contract: string }[],
  supplierId: number,
  cig: string | null,
): number | null {
  if (!cig) return null;
  const found = contracts.filter(
    (c) => Number(c.supplier_id_fk) === supplierId && c.cig_contract === cig,
  );
  return found.length === 1 ? Number(found[0].id) : null;
}

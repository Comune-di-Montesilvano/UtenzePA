import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Invoice } from '@apis/invoices/entity/invoice.entity';
import { InvoiceLine } from '@apis/invoices/entity/invoice-line.entity';
import { InvoiceImportIssue } from './entity/invoice-import-issue.entity';
import { SdiMessage } from './entity/sdi-message.entity';
import { SdiMessageStatus } from './enum/sdi-message-status.enum';
import type { MatchResult } from './invoice-matcher.service';
import type { ExtractedInvoice } from './pattern/pattern-rules';

// Scrittura di sistema: non tocca "Ultima modifica" della fattura.
const KEEP_UPDATE_DATE = { update_date: () => '`update_date`' };

// Nessun utente di sistema: le fatture create dall'import hanno come autore il primo Admin attivo.
const IMPORT_USER_SQL =
  "SELECT id FROM system_users WHERE role = 'Admin' AND status = 'Attivo' AND deleted = 0 ORDER BY id LIMIT 1";

/**
 * Scrive la fattura estratta da un pattern: la crea, o arricchisce quella già
 * inserita mantenendone l'id. Una fattura modificata a mano dopo l'import
 * (import_locked) non si tocca più.
 */
@Injectable()
export class InvoiceApplier {
  constructor(private readonly dataSource: DataSource) {}

  async importUserId(): Promise<number | null> {
    const [row] = await this.dataSource.query(IMPORT_USER_SQL);
    return row?.id ?? null;
  }

  async apply(
    message: SdiMessage,
    extracted: ExtractedInvoice,
    match: MatchResult,
    patternId: number,
    authorId: number,
  ): Promise<number> {
    return this.dataSource.transaction(async (manager) => {
      const existing = match.existingInvoiceId
        ? await manager.findOne(Invoice, { where: { id: match.existingInvoiceId } })
        : null;

      let invoiceId: number;
      if (existing?.import_locked) {
        invoiceId = existing.id;
      } else {
        invoiceId = existing
          ? await this.enrich(manager, existing, message, extracted, match)
          : await this.create(manager, message, extracted, match, authorId);
        await manager.delete(InvoiceLine, { invoice_id_fk: invoiceId });
        if (match.lines.length) {
          await manager.save(
            InvoiceLine,
            match.lines.map((l) => ({
              invoice_id_fk: invoiceId,
              amount: l.amount,
              utility_id_fk: l.utility_id_fk,
              commitment_id_fk: l.commitment_id_fk,
              period_start: l.period_start,
              period_end: l.period_end,
              consumption: l.consumption,
              supply_code: l.supply_code,
              description: l.description,
            })),
          );
        }
      }

      await manager.delete(InvoiceImportIssue, { sdi_message_id_fk: message.id });
      if (match.issues.length) {
        await manager.save(
          InvoiceImportIssue,
          match.issues.map((i) => ({
            sdi_message_id_fk: message.id,
            invoice_id_fk: invoiceId,
            line_index: i.lineIndex,
            type: i.type,
            detail: i.detail.slice(0, 500),
          })),
        );
      }
      await manager.update(SdiMessage, message.id, {
        status: SdiMessageStatus.EXTRACTED,
        pattern_id_fk: patternId,
        invoice_id_fk: invoiceId,
        error: null,
      });
      return invoiceId;
    });
  }

  private async create(
    manager: EntityManager,
    message: SdiMessage,
    extracted: ExtractedInvoice,
    match: MatchResult,
    authorId: number,
  ): Promise<number> {
    const saved = await manager.save(Invoice, {
      invoice_id: extracted.number,
      invoice_date: extracted.date as unknown as Date,
      supplier_id_fk: match.supplierId,
      total_amount: extracted.total,
      net_amount_excl_vat: extracted.netAmount,
      contratto_id_fk: match.contratto_id_fk,
      sdi_identifier: message.sdi_identifier,
      created_by_user_id: authorId,
      updated_by_user_id: authorId,
    });
    return saved.id;
  }

  // Arricchimento: importi dall'XML, contratto solo se mancava, autore e data invariati.
  private async enrich(
    manager: EntityManager,
    existing: Invoice,
    message: SdiMessage,
    extracted: ExtractedInvoice,
    match: MatchResult,
  ): Promise<number> {
    await manager.update(Invoice, existing.id, {
      ...(extracted.total !== null ? { total_amount: extracted.total } : {}),
      ...(extracted.netAmount !== null ? { net_amount_excl_vat: extracted.netAmount } : {}),
      ...(!existing.contratto_id_fk && match.contratto_id_fk
        ? { contratto_id_fk: match.contratto_id_fk }
        : {}),
      sdi_identifier: message.sdi_identifier,
      ...KEEP_UPDATE_DATE,
    });
    return existing.id;
  }
}

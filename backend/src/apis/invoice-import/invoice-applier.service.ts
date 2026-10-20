import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AuditAction, AuditLog } from '@apis/audit-log/entity/audit-log.entity';
import { Invoice } from '@apis/invoices/entity/invoice.entity';
import { InvoiceLine } from '@apis/invoices/entity/invoice-line.entity';
import { SdiStatus } from '@apis/invoices/enum/sdi-status.enum';
import { ConsumptionRecalcService } from '@apis/utility-consumptions/consumption-recalc.service';
import { ConsumptionLinker, type ConsumptionBands } from './consumption-linker.service';
import { InvoiceImportIssue } from './entity/invoice-import-issue.entity';
import { SdiMessage } from './entity/sdi-message.entity';
import { SdiMessageStatus } from './enum/sdi-message-status.enum';
import type { MatchIssue, MatchResult } from './invoice-matcher.service';
import type { ExtractedInvoice } from './pattern/pattern-rules';

// Scrittura di sistema: non tocca "Ultima modifica" della fattura.
const KEEP_UPDATE_DATE = { update_date: () => '`update_date`' };

// Nessun utente di sistema: le fatture create dall'import hanno come autore il primo Admin attivo.
const IMPORT_USER_SQL =
  "SELECT id FROM system_users WHERE role = 'Admin' AND status = 'Attivo' AND deleted = 0 ORDER BY id LIMIT 1";

// Matricola completata solo se l'utenza non l'ha (eccezione alla regola: l'import non modifica le anagrafiche).
const FILL_METER_SQL =
  'UPDATE utilities SET meter_number = ? WHERE id = ? AND NOT (meter_number <=> ?)';

/**
 * Scrive la fattura estratta da un pattern: la crea, o arricchisce quella già
 * inserita mantenendone l'id. Una fattura modificata a mano dopo l'import
 * (import_locked) non si tocca più.
 */
@Injectable()
export class InvoiceApplier {
  constructor(
    private readonly dataSource: DataSource,
    private readonly linker: ConsumptionLinker,
    private readonly recalc: ConsumptionRecalcService,
  ) {}

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
    const { invoiceId, utilityIds } = await this.dataSource.transaction(async (manager) => {
      const existing = match.existingInvoiceId
        ? await manager.findOne(Invoice, { where: { id: match.existingInvoiceId } })
        : null;

      let invoiceId: number;
      const issues = [...match.issues];
      let utilityIds: number[] = [];
      if (existing?.import_locked) {
        invoiceId = existing.id;
      } else {
        const previous = existing
          ? (await manager.find(InvoiceLine, { where: { invoice_id_fk: existing.id } }))
              .map((l) => l.consumption_id_fk)
              .filter((id): id is number => !!id)
          : [];
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
        await this.fillMeters(manager, match, authorId);
        // Fattura rifiutata: nessun effetto sui consumi.
        if (existing?.sdi_status !== SdiStatus.REJECTED) {
          const meters = new Map(match.meters.map((m) => [m.utilityId, m.meter]));
          const estimated = new Set(
            match.lines
              .filter((l) => l.estimated && l.consumption !== null && l.utility_id_fk)
              .map((l) => l.utility_id_fk!),
          );
          const linked = await this.linker.link(
            manager,
            invoiceId,
            authorId,
            previous,
            meters,
            estimated,
            bandsByUtility(match),
          );
          issues.push(...linked.issues);
          utilityIds = linked.utilityIds;
        }
      }

      await this.saveIssues(manager, message.id, invoiceId, issues);
      await manager.update(SdiMessage, message.id, {
        status: SdiMessageStatus.EXTRACTED,
        pattern_id_fk: patternId,
        invoice_id_fk: invoiceId,
        error: null,
      });
      return { invoiceId, utilityIds };
    });
    for (const utilityId of utilityIds) await this.recalc.recalcUtility(utilityId);
    return invoiceId;
  }

  /**
   * Differenze bloccanti (matricola diversa): la fattura non si scrive. Il
   * messaggio resta in attesa col pattern assegnato e si rielabora quando la
   * causa è sistemata.
   */
  async block(message: SdiMessage, match: MatchResult, patternId: number): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.saveIssues(manager, message.id, match.existingInvoiceId, [
        ...match.blocking,
        ...match.issues,
      ]);
      await manager.update(SdiMessage, message.id, { pattern_id_fk: patternId, error: null });
    });
  }

  private async saveIssues(
    manager: EntityManager,
    messageId: number,
    invoiceId: number | null,
    issues: MatchIssue[],
  ): Promise<void> {
    await manager.delete(InvoiceImportIssue, { sdi_message_id_fk: messageId });
    if (!issues.length) return;
    await manager.save(
      InvoiceImportIssue,
      issues.map((i) => ({
        sdi_message_id_fk: messageId,
        invoice_id_fk: invoiceId,
        line_index: i.lineIndex,
        type: i.type,
        detail: i.detail.slice(0, 500),
        utility_id_fk: i.utilityId ?? null,
        value: i.value ? i.value.slice(0, 100) : null,
      })),
    );
  }

  private async fillMeters(
    manager: EntityManager,
    match: MatchResult,
    userId: number,
  ): Promise<void> {
    for (const { utilityId, meter, previous } of match.meterFills) {
      const result: { affectedRows?: number } = await manager.query(FILL_METER_SQL, [
        meter.slice(0, 255),
        utilityId,
        meter.slice(0, 255),
      ]);
      if (!result?.affectedRows) continue;
      await manager.save(AuditLog, {
        entity_name: 'utilities',
        entity_id: utilityId,
        action: AuditAction.UPDATE,
        field_name: 'meter_number',
        old_value: previous ?? null,
        new_value: meter,
        old_label: null,
        new_label: null,
        user_id: userId,
      });
    }
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

// Fasce lette per utenza (somma delle righe dell'utenza); solo le utenze con almeno una
// fascia. Monoraria: F0 = consumo complessivo.
function bandsByUtility(match: MatchResult): Map<number, ConsumptionBands> {
  const out = new Map<number, ConsumptionBands>();
  for (const line of match.lines) {
    const f0 = line.f0 ?? null;
    if (
      !line.utility_id_fk ||
      line.consumption === null ||
      (f0 === null && line.bands.every((b) => b === null))
    )
      continue;
    const current = out.get(line.utility_id_fk) ?? {
      consumption_f0: null,
      consumption_f1: null,
      consumption_f2: null,
      consumption_f3: null,
    };
    const add = (a: number | null, b: number | null) =>
      a === null && b === null ? null : Math.round(((a ?? 0) + (b ?? 0)) * 1000) / 1000;
    out.set(line.utility_id_fk, {
      consumption_f0: add(current.consumption_f0 ?? null, f0),
      consumption_f1: add(current.consumption_f1, line.bands[0]),
      consumption_f2: add(current.consumption_f2, line.bands[1]),
      consumption_f3: add(current.consumption_f3, line.bands[2]),
    });
  }
  return out;
}

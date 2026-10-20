import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { maintenance } from '@common/maintenance/maintenance';
import { Invoice } from '@apis/invoices/entity/invoice.entity';
import { SdiStatus } from '@apis/invoices/enum/sdi-status.enum';
import { deriveSdiStatus, type SdiEvent } from '@apis/invoices/sdi-status';
import { ConsumptionRecalcService } from '@apis/utility-consumptions/consumption-recalc.service';
import { ConsumptionLinker } from './consumption-linker.service';
import { InvoiceImportState } from './entity/invoice-import-state.entity';
import { InvoicePattern } from './entity/invoice-pattern.entity';
import { SdiMessage } from './entity/sdi-message.entity';
import { ImportIssueType } from './enum/import-issue-type.enum';
import { InvoiceApplier } from './invoice-applier.service';
import { InvoiceMatcher } from './invoice-matcher.service';
import {
  extract,
  pickPattern,
  documentTypeOf,
  structureKey,
  missingPdfData,
  usesPdf,
  type PatternRules,
} from './pattern/pattern-rules';
import { SdiMessageStatus, type SdiMessageKind } from './enum/sdi-message-status.enum';
import {
  imapConfigFromEnv,
  importForcedOff,
  PEC_MAILBOX_FACTORY,
  type PecMailbox,
  type PecMailboxFactory,
} from './pec-imap.client';
import { parsePecMessage, type PecMessage, type SdiFile } from './sdi/pec-message';
import { pdfText } from './sdi/pdf-text';
import { extractPdf, parseInvoiceHeader, parseNotification } from './sdi/sdi-files';

export interface ImportRunResult {
  processed: number;
  linked: number;
  pending: number;
  extracted: number;
}

export interface ReprocessResult {
  extracted: number;
  skipped: number;
  queued: number;
}

// Dati di un giro: pattern per fornitore e autore delle fatture create, letti una volta.
interface RunContext {
  patterns: Map<number, InvoicePattern[]>;
  author: number | null | undefined;
  extracted: number;
}

export interface InvoiceImportStatus {
  configured: boolean;
  forcedOff: boolean;
  enabled: boolean;
  running: boolean;
  lastRunAt: Date | null;
  lastSuccessAt: Date | null;
  lastError: string | null;
  counts: Record<string, number>;
  recentErrors: { file_name: string; error: string | null; create_date: Date }[];
}

const STATE_ID = 1;
const EMPTY: ImportRunResult = { processed: 0, linked: 0, pending: 0, extracted: 0 };

// Messaggi registrati prima dei pattern (parte 1): struttura completata a blocchi.
// Anche il tipo documento (v1.40.0), per separare fatture e note di credito.
const BACKFILL_SQL =
  "SELECT id FROM sdi_messages WHERE kind = 'INVOICE' AND status IN ('PENDING', 'LINKED') " +
  "AND (structure_key IS NULL OR (document_type IS NULL AND structure_key <> '')) " +
  'AND supplier_id_fk IS NOT NULL ORDER BY id LIMIT 200';

// Fatture ferme per matricola diversa (fino alla v1.38): ora la matricola si
// aggiorna dalla fattura, quindi si rielaborano; la rielaborazione toglie la segnalazione.
const UNBLOCKED_SQL =
  "SELECT m.id FROM sdi_messages m WHERE m.kind = 'INVOICE' AND m.status IN ('PENDING', 'LINKED') " +
  'AND m.pattern_id_fk IS NOT NULL ' +
  "AND EXISTS (SELECT 1 FROM invoice_import_issues ii WHERE ii.sdi_message_id_fk = m.id AND ii.type = 'METER_MISMATCH') " +
  'ORDER BY m.id LIMIT 200';

// structure_key vuota = messaggio non più sulla casella: non si ritenta.
const GONE_STRUCTURE = '';

// Fornitore in perimetro: in anagrafica con questa P.IVA e almeno un contratto di fornitura.
const SUPPLIER_SQL =
  'SELECT tp.id FROM third_parties tp WHERE tp.deleted = 0 AND tp.vat_number = ? ' +
  'AND EXISTS (SELECT 1 FROM contracts c WHERE c.supplier_id_fk = tp.id AND c.deleted = 0) LIMIT 1';

// Scrittura di sistema: non tocca "Ultima modifica" della fattura.
const KEEP_UPDATE_DATE = { update_date: () => '`update_date`' };

/**
 * Legge la casella PEC dello SDI in sola lettura e registra i file trovati:
 * collega le fatture già presenti in UtenzePA (fornitore + numero + data) e
 * ne ricava lo stato SDI dagli esiti. Con un pattern del fornitore crea o
 * arricchisce la fattura (righe, utenze, contratto); le anagrafiche non si
 * modificano mai. Riprende dall'ultimo UID elaborato.
 */
@Injectable()
export class InvoiceImportService {
  private readonly logger = new Logger(InvoiceImportService.name);
  private running = false;
  // Rielaborazioni chieste durante un giro: si fanno alla fine del giro.
  private readonly queue = new Set<number>();

  constructor(
    @InjectRepository(InvoiceImportState)
    private readonly stateRepo: Repository<InvoiceImportState>,
    @InjectRepository(SdiMessage)
    private readonly messagesRepo: Repository<SdiMessage>,
    @InjectRepository(Invoice)
    private readonly invoicesRepo: Repository<Invoice>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @Inject(PEC_MAILBOX_FACTORY)
    private readonly mailboxFactory: PecMailboxFactory,
    @InjectRepository(InvoicePattern)
    private readonly patternsRepo: Repository<InvoicePattern>,
    private readonly matcher: InvoiceMatcher,
    private readonly applier: InvoiceApplier,
    private readonly linker: ConsumptionLinker,
    private readonly recalc: ConsumptionRecalcService,
  ) {}

  get configured(): boolean {
    return imapConfigFromEnv(process.env) !== null;
  }

  get forcedOff(): boolean {
    return importForcedOff(process.env);
  }

  get isRunning(): boolean {
    return this.running;
  }

  async getStatus(): Promise<InvoiceImportStatus> {
    const state = await this.state();
    const rows: { status: string; total: string | number }[] = await this.dataSource.query(
      'SELECT status, COUNT(*) AS total FROM sdi_messages GROUP BY status',
    );
    const recentErrors = await this.dataSource.query(
      "SELECT file_name, error, create_date FROM sdi_messages WHERE status = 'ERROR' ORDER BY id DESC LIMIT 10",
    );
    return {
      configured: this.configured,
      forcedOff: this.forcedOff,
      enabled: !!state?.enabled,
      running: this.running,
      lastRunAt: state?.last_run_at ?? null,
      lastSuccessAt: state?.last_success_at ?? null,
      lastError: state?.last_error ?? null,
      counts: Object.fromEntries(rows.map((r) => [r.status, Number(r.total)])),
      recentErrors,
    };
  }

  async setEnabled(enabled: boolean): Promise<void> {
    await this.stateRepo.update(STATE_ID, { enabled });
  }

  // Non lancia mai: gli errori finiscono nello stato (cron e "Esegui ora" in background).
  async runOnce(): Promise<ImportRunResult> {
    if (this.running) return { ...EMPTY };
    this.running = true;
    try {
      if (!this.configured || this.forcedOff || maintenance.active) return { ...EMPTY };
      const state = await this.state();
      if (!state?.enabled) return { ...EMPTY };
      const relinked = await this.relinkPending();
      const ctx = this.newContext();
      const result = await this.read(state, ctx);
      await this.processBacklog(ctx);
      return { ...result, linked: result.linked + relinked, extracted: ctx.extracted };
    } catch (error) {
      await this.recordError(error).catch(() => undefined);
      return { ...EMPTY };
    } finally {
      this.running = false;
    }
  }

  /**
   * Rilegge dalla casella i messaggi indicati e li riporta al pattern attuale
   * (dopo il salvataggio di un pattern). Saltati: spariti dalla PEC o fattura
   * modificata a mano. Con un giro in corso vanno in coda. Non lancia mai.
   */
  async reprocess(ids: number[]): Promise<ReprocessResult> {
    if (this.running) {
      ids.forEach((id) => this.queue.add(id));
      return { extracted: 0, skipped: 0, queued: ids.length };
    }
    if (!this.configured || !ids.length) return { extracted: 0, skipped: 0, queued: 0 };
    this.running = true;
    try {
      const result = await this.withMailbox((mailbox) =>
        this.processStored(mailbox, ids, this.newContext()),
      );
      return { ...result, queued: 0 };
    } catch (error) {
      this.logger.error(`Rielaborazione fatture non riuscita: ${(error as Error).message}`);
      return { extracted: 0, skipped: 0, queued: 0 };
    } finally {
      this.running = false;
    }
  }

  /**
   * XML o PDF della fattura riletti al momento dalla casella: non si salva
   * nessun file, quando il messaggio sparisce dalla PEC resta il protocollo.
   */
  async getDocument(
    invoiceId: number,
    type: 'xml' | 'pdf',
  ): Promise<{ contentType: string; fileName: string; data: Buffer }> {
    const invoice = await this.invoicesRepo.findOneBy({ id: invoiceId, deleted: false });
    const byStatus = (status: SdiMessageStatus) =>
      this.messagesRepo.findOneBy({
        sdi_identifier: invoice!.sdi_identifier!,
        kind: 'INVOICE',
        status,
      });
    const row = invoice?.sdi_identifier
      ? ((await byStatus(SdiMessageStatus.EXTRACTED)) ??
        (await byStatus(SdiMessageStatus.LINKED)) ??
        // Collegata e poi struttura ignorata: il documento resta consultabile.
        (await byStatus(SdiMessageStatus.IGNORED)))
      : null;
    if (!row) throw new BadRequestException('Fattura senza messaggio SDI.');
    const file = await this.readMessageFile(row);
    const xmlName = row.file_name.replace(/\.p7m$/i, '');
    if (type === 'xml')
      return { contentType: 'application/xml', fileName: xmlName, data: file.content };
    const pdf = extractPdf(file.content);
    if (!pdf) throw new BadRequestException('La fattura non contiene un PDF.');
    return {
      contentType: 'application/pdf',
      fileName: pdf.name || `${xmlName}.pdf`,
      data: pdf.data,
    };
  }

  /** File del messaggio riletto dalla casella; 400 se non configurato o sparito dalla PEC. */
  async readMessageFile(row: SdiMessage): Promise<SdiFile> {
    if (!this.configured) throw new BadRequestException('Import non configurato.');
    const raw = await this.withMailbox((mailbox) =>
      mailbox.fetchRaw(Number(row.uid_validity), Number(row.uid), row.message_id),
    );
    const file = raw
      ? (await parsePecMessage(raw)).files.find((f) => f.fileName === row.file_name)
      : undefined;
    if (!file) {
      throw new BadRequestException(
        'Non più disponibile sulla PEC: cercare la fattura nel protocollo.',
      );
    }
    return file;
  }

  /** Più file dalla casella con una sola connessione; i messaggi spariti dalla PEC mancano. */
  async readMessageFiles(rows: SdiMessage[]): Promise<Map<number, Buffer>> {
    if (!this.configured) throw new BadRequestException('Import non configurato.');
    const files = new Map<number, Buffer>();
    await this.withMailbox(async (mailbox) => {
      for (const row of rows) {
        const raw = await mailbox.fetchRaw(
          Number(row.uid_validity),
          Number(row.uid),
          row.message_id,
        );
        const file = raw
          ? (await parsePecMessage(raw)).files.find((f) => f.fileName === row.file_name)
          : undefined;
        if (file) files.set(row.id, file.content);
      }
    });
    return files;
  }

  private state(): Promise<InvoiceImportState | null> {
    return this.stateRepo.findOneBy({ id: STATE_ID });
  }

  private newContext(): RunContext {
    return { patterns: new Map(), author: undefined, extracted: 0 };
  }

  private async withMailbox<T>(work: (mailbox: PecMailbox) => Promise<T>): Promise<T> {
    const mailbox = this.mailboxFactory();
    try {
      await mailbox.open();
      return await work(mailbox);
    } finally {
      await mailbox.close().catch(() => undefined);
    }
  }

  // Dopo la lettura: rielaborazioni in coda e struttura dei messaggi della parte 1.
  private async processBacklog(ctx: RunContext): Promise<void> {
    const backfill: { id: number }[] = await this.dataSource.query(BACKFILL_SQL);
    const unblocked: { id: number }[] = await this.dataSource.query(UNBLOCKED_SQL);
    const ids = [
      ...new Set([...this.queue, ...[...backfill, ...unblocked].map((r) => Number(r.id))]),
    ];
    this.queue.clear();
    if (ids.length) await this.withMailbox((mailbox) => this.processStored(mailbox, ids, ctx));
  }

  private async processStored(
    mailbox: PecMailbox,
    ids: number[],
    ctx: RunContext,
  ): Promise<{ extracted: number; skipped: number }> {
    const result = { extracted: 0, skipped: 0 };
    for (const id of ids) {
      try {
        if (await this.processOne(mailbox, id, ctx)) result.extracted++;
        else result.skipped++;
      } catch (error) {
        // Un messaggio in errore non ferma gli altri né il recupero delle strutture.
        result.skipped++;
        const detail = (error instanceof Error ? error.message : String(error)).slice(0, 500);
        try {
          const row = await this.messagesRepo.findOneBy({ id });
          await this.messagesRepo.update(id, {
            error: detail,
            ...(row && row.structure_key == null ? { structure_key: GONE_STRUCTURE } : {}),
          });
        } catch {
          // registro non aggiornabile: il messaggio si riprova al prossimo giro
        }
      }
    }
    return result;
  }

  // true se la fattura è stata estratta col pattern.
  private async processOne(mailbox: PecMailbox, id: number, ctx: RunContext): Promise<boolean> {
    const row = await this.messagesRepo.findOneBy({ id });
    if (!row || row.kind !== 'INVOICE' || !row.supplier_id_fk) {
      return false;
    }
    if (row.invoice_id_fk) {
      const invoice = await this.invoicesRepo.findOneBy({ id: row.invoice_id_fk });
      // Modificata a mano o eliminata: l'import non la tocca e non la ricrea.
      if (invoice?.import_locked || invoice?.deleted) {
        return false;
      }
    }
    const raw = await mailbox.fetchRaw(Number(row.uid_validity), Number(row.uid), row.message_id);
    const file = raw
      ? (await parsePecMessage(raw)).files.find((f) => f.fileName === row.file_name)
      : undefined;
    if (!file) {
      if (row.structure_key == null) {
        await this.messagesRepo.update(row.id, { structure_key: GONE_STRUCTURE });
      } else if (row.document_type == null) {
        // Tipo non più leggibile: vuoto, così il completamento non lo ritenta.
        await this.messagesRepo.update(row.id, { document_type: '' });
      }
      return false;
    }
    if (!row.structure_key || !row.document_type) {
      row.structure_key ||= this.structureOf(file.content);
      row.document_type ||= this.documentTypeOf(file.content) ?? '';
      await this.messagesRepo.update(row.id, {
        structure_key: row.structure_key,
        document_type: row.document_type,
      });
    }
    const before = ctx.extracted;
    await this.applyPattern(row, file.content, ctx);
    if (ctx.extracted === before) return false;
    if (row.sdi_identifier) await this.refreshInvoiceStatus(row.sdi_identifier);
    return true;
  }

  private documentTypeOf(xml: Buffer): string | null {
    try {
      return documentTypeOf(xml)?.slice(0, 4) || null;
    } catch {
      return null;
    }
  }

  private structureOf(xml: Buffer): string | null {
    try {
      return structureKey(xml);
    } catch {
      return null;
    }
  }

  private async patternsFor(supplierId: number, ctx: RunContext): Promise<InvoicePattern[]> {
    if (!ctx.patterns.has(supplierId)) {
      ctx.patterns.set(
        supplierId,
        await this.patternsRepo.find({ where: { supplier_id_fk: supplierId, deleted: false } }),
      );
    }
    return ctx.patterns.get(supplierId) ?? [];
  }

  /**
   * Fattura in perimetro già registrata: con il pattern del fornitore che la
   * riconosce si crea o arricchisce la fattura di UtenzePA. Senza pattern resta
   * collegata o in attesa come prima; struttura ignorata = IGNORED.
   */
  private async applyPattern(row: SdiMessage, xml: Buffer, ctx: RunContext): Promise<void> {
    if (parseInvoiceHeader(xml).documents.length > 1) {
      await this.dataSource.query('DELETE FROM invoice_import_issues WHERE sdi_message_id_fk = ?', [
        row.id,
      ]);
      await this.dataSource.query(
        'INSERT INTO invoice_import_issues (sdi_message_id_fk, type, detail) VALUES (?, ?, ?)',
        [
          row.id,
          ImportIssueType.BATCH_NOT_SUPPORTED,
          'File con più fatture (lotto): da inserire a mano',
        ],
      );
      return;
    }
    const patterns = await this.patternsFor(row.supplier_id_fk!, ctx);
    if (patterns.some((p) => p.ignored && p.structure_key === row.structure_key)) {
      row.status = SdiMessageStatus.IGNORED;
      await this.messagesRepo.update(row.id, { status: row.status });
      return;
    }
    const usable = patterns.filter(
      (p): p is InvoicePattern & { rules: PatternRules } => !p.ignored && p.rules !== null,
    );
    const pattern = pickPattern(xml, usable);
    if (!pattern) {
      // Era ferma con un pattern che non la riconosce più: torna tra le fatture senza pattern.
      if (row.pattern_id_fk && row.status !== SdiMessageStatus.EXTRACTED) {
        await this.dataSource.query(
          'DELETE FROM invoice_import_issues WHERE sdi_message_id_fk = ?',
          [row.id],
        );
        row.pattern_id_fk = null;
        await this.messagesRepo.update(row.id, { pattern_id_fk: null });
      }
      return;
    }
    if (ctx.author === undefined) ctx.author = await this.applier.importUserId();
    if (!ctx.author) {
      this.fail(row, 'Nessun amministratore per le fatture importate');
      await this.messagesRepo.update(row.id, { status: row.status, error: row.error });
      return;
    }
    try {
      const pdf = usesPdf(pattern.rules) ? await pdfText(xml) : null;
      const extracted = extract(xml, pattern.rules, pdf);
      const match = await this.matcher.match(extracted, row.supplier_id_fk!);
      const pdfMissing = missingPdfData(pattern.rules, extracted, pdf);
      if (pdfMissing) {
        match.issues.push({
          type: ImportIssueType.PDF_DATA_MISSING,
          lineIndex: null,
          detail: pdfMissing,
        });
      }
      if (match.blocking.length) {
        await this.applier.block(row, match, pattern.id);
        Object.assign(row, { pattern_id_fk: pattern.id, error: null });
        return;
      }
      const invoiceId = await this.applier.apply(row, extracted, match, pattern.id, ctx.author);
      Object.assign(row, {
        status: SdiMessageStatus.EXTRACTED,
        pattern_id_fk: pattern.id,
        invoice_id_fk: invoiceId,
        error: null,
      });
      ctx.extracted++;
    } catch (error) {
      row.error = `Estrazione non riuscita: ${(error as Error).message}`.slice(0, 500);
      await this.messagesRepo.update(row.id, { error: row.error });
      this.logger.warn(`Fattura ${row.file_name}: ${row.error}`);
    }
  }

  private async read(state: InvoiceImportState, ctx: RunContext): Promise<ImportRunResult> {
    const result = { ...EMPTY };
    const mailbox: PecMailbox = this.mailboxFactory();
    try {
      const { uidValidity } = await mailbox.open();
      const sameBox = state.uid_validity === String(uidValidity);
      // Casella ricreata: gli UID ripartono, si rilegge tutto (i doppioni si saltano).
      const lastUid = sameBox && state.last_uid ? Number(state.last_uid) : 0;
      if (!sameBox) {
        await this.stateRepo.update(STATE_ID, {
          uid_validity: String(uidValidity),
          last_uid: null,
        });
      }
      for await (const { uid, raw } of mailbox.fetchSince(lastUid)) {
        const message = await parsePecMessage(raw);
        const touched = new Set<string>();
        const counts = await this.processMessage(message, String(uidValidity), uid, touched, ctx);
        for (const identifier of touched) await this.refreshInvoiceStatus(identifier);
        result.processed++;
        result.linked += counts.linked;
        result.pending += counts.pending;
        await this.stateRepo.update(STATE_ID, { last_uid: String(uid) });
      }
      await this.stateRepo.update(STATE_ID, {
        last_run_at: new Date(),
        last_success_at: new Date(),
        last_error: null,
      });
    } catch (error) {
      await this.recordError(error);
    } finally {
      await mailbox.close().catch(() => undefined);
    }
    return result;
  }

  private async recordError(error: unknown): Promise<void> {
    const text = error instanceof Error ? error.message : String(error);
    this.logger.error(`Import fatture dalla PEC interrotto: ${text}`);
    await this.stateRepo.update(STATE_ID, {
      last_run_at: new Date(),
      last_error: text.slice(0, 500),
    });
  }

  // Fatture inserite dopo l'arrivo del messaggio: le righe in attesa si
  // ricontrollano a ogni giro con lo stesso abbinamento (fornitore, numero, data).
  private async relinkPending(): Promise<number> {
    const rows: { id: number; sdi_identifier: string; invoice_id: number }[] =
      await this.dataSource.query(
        `SELECT m.id, m.sdi_identifier, MIN(i.id) AS invoice_id
           FROM sdi_messages m
           JOIN invoices i ON i.supplier_id_fk = m.supplier_id_fk AND i.invoice_id = m.document_number
                          AND i.invoice_date = m.document_date AND i.deleted = 0
          WHERE m.status = 'PENDING' AND m.sdi_identifier IS NOT NULL
          GROUP BY m.id, m.sdi_identifier`,
      );
    for (const row of rows) {
      await this.invoicesRepo.update(Number(row.invoice_id), {
        sdi_identifier: row.sdi_identifier,
        ...KEEP_UPDATE_DATE,
      });
      await this.messagesRepo.update(Number(row.id), { status: SdiMessageStatus.LINKED });
      await this.refreshInvoiceStatus(row.sdi_identifier);
    }
    return rows.length;
  }

  private async processMessage(
    message: PecMessage,
    uidValidity: string,
    uid: number,
    touched: Set<string>,
    ctx: RunContext,
  ): Promise<{ linked: number; pending: number }> {
    const counts = { linked: 0, pending: 0 };
    const messageId = message.messageId || `uid:${uidValidity}:${uid}`;
    const identifier = this.identifierOf(message);
    for (const file of message.files) {
      if (file.kind === 'MT' || file.kind === 'OTHER') continue;
      const existing = await this.messagesRepo.findOneBy({
        message_id: messageId,
        file_name: file.fileName,
      });
      if (existing) {
        // Già registrato: si aggiorna solo dove ritrovarlo sulla casella.
        await this.messagesRepo.update(existing.id, {
          uid_validity: uidValidity,
          uid: String(uid),
        });
        continue;
      }
      const row = Object.assign(new SdiMessage(), {
        uid_validity: uidValidity,
        uid: String(uid),
        message_id: messageId,
        received_at: message.date,
        kind: file.kind as SdiMessageKind,
        file_name: file.fileName,
        sdi_identifier: null,
        structure_key: null,
        pattern_id_fk: null,
        invoice_id_fk: null,
        outcome: null,
        supplier_vat: null,
        supplier_id_fk: null,
        document_number: null,
        document_date: null,
        error: null,
      });
      if (file.kind === 'INVOICE') {
        const status = await this.fillInvoice(row, file, identifier);
        if (status === SdiMessageStatus.LINKED) counts.linked++;
        if (status === SdiMessageStatus.PENDING) counts.pending++;
      } else {
        this.fillNotification(row, file);
      }
      await this.messagesRepo.save(row);
      const inScope =
        row.status === SdiMessageStatus.LINKED || row.status === SdiMessageStatus.PENDING;
      if (file.kind === 'INVOICE' && inScope) await this.applyPattern(row, file.content, ctx);
      // Solo fatture collegate o estratte ed esiti cambiano lo stato di una fattura di UtenzePA.
      const affects =
        row.status === SdiMessageStatus.LINKED ||
        row.status === SdiMessageStatus.EXTRACTED ||
        row.status === SdiMessageStatus.NOTIFICATION;
      if (affects && row.sdi_identifier) touched.add(row.sdi_identifier);
    }
    return counts;
  }

  // L'identificativo SDI della fattura sta nei metadati (MT) dello stesso messaggio.
  private identifierOf(message: PecMessage): string | null {
    for (const file of message.files.filter((f) => f.kind === 'MT')) {
      try {
        const id = parseNotification(file.content).sdiIdentifier;
        if (id) return id;
      } catch {
        // metadati illeggibili: si prova con l'oggetto
      }
    }
    return /Invio File (\d+)/i.exec(message.subject)?.[1] ?? null;
  }

  private async fillInvoice(
    row: SdiMessage,
    file: SdiFile,
    identifier: string | null,
  ): Promise<SdiMessageStatus> {
    row.sdi_identifier = identifier;
    let header;
    try {
      header = parseInvoiceHeader(file.content);
    } catch (error) {
      return this.fail(row, `XML illeggibile: ${error instanceof Error ? error.message : error}`);
    }
    const first = header.documents[0];
    // IdCodice estero fino a 28 caratteri: fuori perimetro, basta per riconoscerlo.
    row.supplier_vat = header.supplierVat ? header.supplierVat.slice(0, 16) : null;
    row.document_number = first?.number || null;
    row.document_type = first?.type?.slice(0, 4) || null;
    row.document_date = first?.date || null;

    // Perimetro prima dell'identificativo: le copie delle fatture emesse dal
    // Comune arrivano senza metadati e restano semplicemente fuori perimetro.
    const [supplier] = header.supplierVat
      ? await this.dataSource.query(SUPPLIER_SQL, [header.supplierVat])
      : [];
    if (!supplier) return (row.status = SdiMessageStatus.OUT_OF_SCOPE);
    row.supplier_id_fk = Number(supplier.id);
    row.structure_key = this.structureOf(file.content);
    if (!identifier) return this.fail(row, 'Identificativo SDI mancante');

    // Un lotto porta più documenti: si collegano tutti quelli già presenti.
    let linked = false;
    for (const doc of header.documents) {
      if (!doc.number || !doc.date) continue;
      const invoice = await this.invoicesRepo.findOneBy({
        supplier_id_fk: row.supplier_id_fk,
        invoice_id: doc.number,
        invoice_date: doc.date as unknown as Date,
        deleted: false,
      });
      if (!invoice) continue;
      await this.invoicesRepo.update(invoice.id, {
        sdi_identifier: identifier,
        ...KEEP_UPDATE_DATE,
      });
      linked = true;
    }
    return (row.status = linked ? SdiMessageStatus.LINKED : SdiMessageStatus.PENDING);
  }

  private fillNotification(row: SdiMessage, file: SdiFile): void {
    try {
      const notification = parseNotification(file.content);
      row.sdi_identifier = notification.sdiIdentifier || null;
      row.outcome = file.kind === 'EC' ? notification.outcome : null;
      row.status = row.sdi_identifier ? SdiMessageStatus.NOTIFICATION : SdiMessageStatus.ERROR;
      if (!row.sdi_identifier) row.error = 'Identificativo SDI mancante';
    } catch (error) {
      this.fail(row, `XML illeggibile: ${error instanceof Error ? error.message : error}`);
    }
  }

  private fail(row: SdiMessage, error: string): SdiMessageStatus {
    row.error = error.slice(0, 500);
    return (row.status = SdiMessageStatus.ERROR);
  }

  // Stato SDI ricalcolato da tutti i messaggi registrati con quell'identificativo.
  private async refreshInvoiceStatus(identifier: string): Promise<void> {
    const rows = await this.messagesRepo.findBy({ sdi_identifier: identifier });
    const events: SdiEvent[] = rows
      .filter((r) => r.status !== SdiMessageStatus.ERROR)
      .map((r) => ({
        kind: r.kind,
        outcome: r.outcome === 'EC01' || r.outcome === 'EC02' ? r.outcome : null,
        at: new Date(r.received_at ?? r.create_date),
      }));
    const { status, outcomeDiscarded } = deriveSdiStatus(events);
    if (!status) return;
    const invoices = await this.invoicesRepo.findBy({ sdi_identifier: identifier, deleted: false });
    const previous = new Map(invoices.map((i) => [i.id, i.sdi_status]));
    await this.invoicesRepo.update(
      { sdi_identifier: identifier, deleted: false },
      { sdi_status: status, sdi_outcome_discarded: outcomeDiscarded, ...KEEP_UPDATE_DATE },
    );
    const rejected = status === SdiStatus.REJECTED;
    for (const invoice of invoices) {
      if ((previous.get(invoice.id) === SdiStatus.REJECTED) !== rejected) {
        await this.syncConsumptions(invoice, rejected);
      }
    }
  }

  // Fattura rifiutata = nessun effetto: consumi tolti; rifiuto superato = ricollegati
  // (solo fatture scritte dall'import e non modificate a mano).
  private async syncConsumptions(invoice: Invoice, rejected: boolean): Promise<void> {
    let utilityIds: number[];
    if (rejected) {
      utilityIds = await this.dataSource.transaction((manager) =>
        this.linker.unlink(manager, invoice.id),
      );
    } else {
      const fromImport = await this.messagesRepo.findOneBy({ invoice_id_fk: invoice.id });
      if (!fromImport || invoice.import_locked) return;
      const linked = await this.dataSource.transaction((manager) =>
        this.linker.link(manager, invoice.id, invoice.updated_by_user_id, []),
      );
      utilityIds = linked.utilityIds;
    }
    for (const utilityId of utilityIds) await this.recalc.recalcUtility(utilityId);
  }
}

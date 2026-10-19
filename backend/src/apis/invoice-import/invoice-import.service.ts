import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { maintenance } from '@common/maintenance/maintenance';
import { Invoice } from '@apis/invoices/entity/invoice.entity';
import { deriveSdiStatus, type SdiEvent } from '@apis/invoices/sdi-status';
import { InvoiceImportState } from './entity/invoice-import-state.entity';
import { SdiMessage } from './entity/sdi-message.entity';
import { SdiMessageStatus, type SdiMessageKind } from './enum/sdi-message-status.enum';
import {
  imapConfigFromEnv,
  importForcedOff,
  PEC_MAILBOX_FACTORY,
  type PecMailbox,
  type PecMailboxFactory,
} from './pec-imap.client';
import { parsePecMessage, type PecMessage, type SdiFile } from './sdi/pec-message';
import { extractPdf, parseInvoiceHeader, parseNotification } from './sdi/sdi-files';

export interface ImportRunResult {
  processed: number;
  linked: number;
  pending: number;
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
}

const STATE_ID = 1;
const EMPTY: ImportRunResult = { processed: 0, linked: 0, pending: 0 };

// Fornitore in perimetro: in anagrafica con questa P.IVA e almeno un contratto di fornitura.
const SUPPLIER_SQL =
  'SELECT tp.id FROM third_parties tp WHERE tp.deleted = 0 AND tp.vat_number = ? ' +
  'AND EXISTS (SELECT 1 FROM contracts c WHERE c.supplier_id_fk = tp.id AND c.deleted = 0) LIMIT 1';

// Scrittura di sistema: non tocca "Ultima modifica" della fattura.
const KEEP_UPDATE_DATE = { update_date: () => '`update_date`' };

/**
 * Legge la casella PEC dello SDI in sola lettura e registra i file trovati:
 * collega le fatture già presenti in UtenzePA (fornitore + numero + data) e
 * ne ricava lo stato SDI dagli esiti. Non crea fatture e non modifica le
 * anagrafiche. Riprende dall'ultimo UID elaborato.
 */
@Injectable()
export class InvoiceImportService {
  private readonly logger = new Logger(InvoiceImportService.name);
  private running = false;

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
    return {
      configured: this.configured,
      forcedOff: this.forcedOff,
      enabled: !!state?.enabled,
      running: this.running,
      lastRunAt: state?.last_run_at ?? null,
      lastSuccessAt: state?.last_success_at ?? null,
      lastError: state?.last_error ?? null,
      counts: Object.fromEntries(rows.map((r) => [r.status, Number(r.total)])),
    };
  }

  async setEnabled(enabled: boolean): Promise<void> {
    await this.stateRepo.update(STATE_ID, { enabled });
  }

  async runOnce(): Promise<ImportRunResult> {
    if (this.running) return { ...EMPTY };
    this.running = true;
    try {
      if (!this.configured || this.forcedOff || maintenance.active) return { ...EMPTY };
      const state = await this.state();
      if (!state?.enabled) return { ...EMPTY };
      return await this.read(state);
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
    const row = invoice?.sdi_identifier
      ? await this.messagesRepo.findOneBy({
          sdi_identifier: invoice.sdi_identifier,
          kind: 'INVOICE',
          status: SdiMessageStatus.LINKED,
        })
      : null;
    if (!row) throw new BadRequestException('Fattura senza messaggio SDI.');
    if (!this.configured) throw new BadRequestException('Import non configurato.');

    const mailbox = this.mailboxFactory();
    let raw: Buffer | null;
    try {
      await mailbox.open();
      raw = await mailbox.fetchRaw(Number(row.uid_validity), Number(row.uid), row.message_id);
    } finally {
      await mailbox.close().catch(() => undefined);
    }
    const file = raw
      ? (await parsePecMessage(raw)).files.find((f) => f.fileName === row.file_name)
      : undefined;
    if (!file) {
      throw new BadRequestException(
        'Non più disponibile sulla PEC: cercare la fattura nel protocollo.',
      );
    }
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

  private state(): Promise<InvoiceImportState | null> {
    return this.stateRepo.findOneBy({ id: STATE_ID });
  }

  private async read(state: InvoiceImportState): Promise<ImportRunResult> {
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
        const counts = await this.processMessage(message, String(uidValidity), uid, touched);
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
      const text = error instanceof Error ? error.message : String(error);
      this.logger.error(`Import fatture dalla PEC interrotto: ${text}`);
      await this.stateRepo.update(STATE_ID, {
        last_run_at: new Date(),
        last_error: text.slice(0, 500),
      });
    } finally {
      await mailbox.close().catch(() => undefined);
    }
    return result;
  }

  private async processMessage(
    message: PecMessage,
    uidValidity: string,
    uid: number,
    touched: Set<string>,
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
      // Solo fatture collegate ed esiti cambiano lo stato di una fattura di UtenzePA.
      const affects =
        row.status === SdiMessageStatus.LINKED || row.status === SdiMessageStatus.NOTIFICATION;
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
    row.supplier_vat = header.supplierVat || null;
    row.document_number = first?.number || null;
    row.document_date = first?.date || null;

    // Perimetro prima dell'identificativo: le copie delle fatture emesse dal
    // Comune arrivano senza metadati e restano semplicemente fuori perimetro.
    const [supplier] = header.supplierVat
      ? await this.dataSource.query(SUPPLIER_SQL, [header.supplierVat])
      : [];
    if (!supplier) return (row.status = SdiMessageStatus.OUT_OF_SCOPE);
    row.supplier_id_fk = Number(supplier.id);
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
    await this.invoicesRepo.update(
      { sdi_identifier: identifier, deleted: false },
      { sdi_status: status, sdi_outcome_discarded: outcomeDiscarded, ...KEEP_UPDATE_DATE },
    );
  }
}

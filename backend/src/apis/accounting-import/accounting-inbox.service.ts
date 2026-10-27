import { Inject, Injectable, Logger, OnApplicationBootstrap, Optional } from '@nestjs/common';
import { AccountingImportService } from './accounting-import.service';
import { AccountingStateService } from './accounting-state.service';
import {
  clearDelivery,
  inboxDir,
  inboxPresent,
  markFailed,
  readCsvs,
  readReady,
  readStatus,
  requestRun,
  writeSettings,
  type TinnStatus,
} from './accounting-inbox.files';

export const ACCOUNTING_INBOX_DIR = 'ACCOUNTING_INBOX_DIR';

export type InboxCheck = 'none' | 'off' | 'busy' | 'loaded' | 'failed' | 'confirmed';

// Caricamento automatico dei CSV consegnati dal container Tinn (fase 4). Il
// cron lo chiama ogni 5 minuti; ogni caricamento passa da AccountingImportService
// come quello manuale.
@Injectable()
export class AccountingInboxService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AccountingInboxService.name);
  private readonly dir: string;

  constructor(
    private readonly importer: AccountingImportService,
    private readonly states: AccountingStateService,
    @Optional() @Inject(ACCOUNTING_INBOX_DIR) dir?: string,
  ) {
    this.dir = dir ?? inboxDir();
  }

  present(): boolean {
    return inboxPresent(this.dir);
  }

  readStatus(): TinnStatus | null {
    return this.present() ? readStatus(this.dir) : null;
  }

  requestRun(): void {
    requestRun(this.dir);
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.writeSettings();
  }

  // Anno di partenza e ultimo backup caricato per il container: riscritti a ogni
  // controllo, così un file rovinato o un DB ripristinato si riallineano da soli.
  async writeSettings(): Promise<void> {
    if (!this.present()) return;
    try {
      const state = await this.states.state();
      writeSettings(this.dir, {
        from_year: state.from_year,
        loaded_sha256: state.last_loaded_sha256,
        loaded_at: state.last_success_at ? state.last_success_at.toISOString() : null,
      });
    } catch (error) {
      this.logger.warn(`settings della contabilità non scritto: ${(error as Error).message}`);
    }
  }

  async check(): Promise<InboxCheck> {
    if (!this.present()) return 'none';
    await this.writeSettings();
    const state = await this.states.state();
    if (!(await this.states.isActive()) || !state.from_year) return 'off';

    const ready = readReady(this.dir);
    if (!ready) return this.confirmUnchanged(state);
    if (this.importer.isRunning()) return 'busy';

    const files = readCsvs(this.dir);
    try {
      if (!files) throw new Error('file della consegna mancanti');
      await this.importer.run(files);
    } catch (error) {
      this.logger.error(`consegna della contabilità non caricata: ${(error as Error).message}`);
      markFailed(this.dir);
      return 'failed';
    }
    clearDelivery(this.dir);
    await this.states.update({
      last_success_at: new Date(),
      last_loaded_sha256: ready.backupSha256 || null,
    });
    await this.writeSettings();
    return 'loaded';
  }

  // Backup invariato e già caricato: i dati corrispondono all'ultimo backup.
  private async confirmUnchanged(state: {
    last_loaded_sha256: string | null;
    last_success_at: Date | null;
  }): Promise<InboxCheck> {
    const status = readStatus(this.dir);
    if (
      status?.state !== 'unchanged' ||
      !status.backupSha256 ||
      status.backupSha256 !== state.last_loaded_sha256 ||
      !status.finishedAt
    )
      return 'none';
    const finished = new Date(status.finishedAt);
    if (state.last_success_at && state.last_success_at >= finished) return 'none';
    await this.states.update({ last_success_at: finished });
    return 'confirmed';
  }
}

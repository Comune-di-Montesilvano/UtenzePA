import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { DataSource, EntityTarget, ObjectLiteral } from 'typeorm';
import { CommitmentReconcileService } from '@apis/budget-commitments/commitment-reconcile.service';
import { parseAccountingCsv, type AccKind, type CsvIssue } from './accounting-csv';
import { AccountingStateService } from './accounting-state.service';
import { AccChapter } from './entity/acc-chapter.entity';
import { AccCommitment } from './entity/acc-commitment.entity';
import { AccLiquidation } from './entity/acc-liquidation.entity';

export const ACCOUNTING_STEPS = 'ACCOUNTING_STEPS';

export interface AccountingRunContext {
  fromYear: number;
}

// Un applicatore: porta una parte dell'applicazione allo stato delle tabelle
// acc_*. Restituisce i contatori per il riepilogo del giro.
export interface AccountingStep {
  name: string;
  apply(ctx: AccountingRunContext): Promise<Record<string, number>>;
}

export interface AccountingImportSummary {
  loaded: Partial<Record<AccKind, number>>;
  issues: Partial<Record<AccKind, CsvIssue[]>>;
  steps: Record<string, Record<string, number>>;
}

export interface AccountingImportStatus {
  enabled: boolean;
  forcedOff: boolean;
  running: boolean;
  fromYear: number | null;
  lastRunAt: Date | null;
  lastError: string | null;
  lastSummary: AccountingImportSummary | null;
  counts: Record<AccKind, number>;
}

const TABLES: Record<
  AccKind,
  { table: string; entity: EntityTarget<ObjectLiteral>; yearField: string }
> = {
  chapters: { table: 'acc_chapters', entity: AccChapter, yearField: 'year' },
  commitments: { table: 'acc_commitments', entity: AccCommitment, yearField: 'fiscal_year' },
  liquidations: { table: 'acc_liquidations', entity: AccLiquidation, yearField: 'fiscal_year' },
};
const KINDS: AccKind[] = ['chapters', 'commitments', 'liquidations'];
const BATCH = 500;

// Caricamento dei CSV del formato neutro: ogni file sostituisce in blocco la
// sua tabella di appoggio (righe prima dell'anno di partenza scartate), poi
// gli applicatori allineano l'applicazione e il ricalcolo degli impegni
// riassegna le quote automatiche.
@Injectable()
export class AccountingImportService {
  private running = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly states: AccountingStateService,
    private readonly reconcile: CommitmentReconcileService,
    @Inject(ACCOUNTING_STEPS) private readonly steps: AccountingStep[],
  ) {}

  async getStatus(): Promise<AccountingImportStatus> {
    const state = await this.states.state();
    const [counts] = await this.dataSource.query(
      'SELECT (SELECT COUNT(*) FROM acc_chapters) AS chapters, (SELECT COUNT(*) FROM acc_commitments) AS commitments, ' +
        '(SELECT COUNT(*) FROM acc_liquidations) AS liquidations',
    );
    return {
      enabled: state.enabled,
      forcedOff: this.states.forcedOff,
      running: this.running,
      fromYear: state.from_year,
      lastRunAt: state.last_run_at,
      lastError: state.last_error,
      lastSummary: (state.last_summary as AccountingImportSummary | null) ?? null,
      counts: {
        chapters: Number(counts?.chapters ?? 0),
        commitments: Number(counts?.commitments ?? 0),
        liquidations: Number(counts?.liquidations ?? 0),
      },
    };
  }

  // Avvia il giro in background e risponde subito con lo stato (il primo giro
  // dura minuti: dietro il proxy la richiesta andrebbe in timeout). Esito ed
  // errore restano nello stato, letto dalla pagina con GET /status.
  async start(files: Partial<Record<AccKind, Buffer>>): Promise<AccountingImportStatus> {
    const fromYear = await this.begin(files);
    void this.execute(files, fromYear).catch(() => undefined);
    return this.getStatus();
  }

  async run(files: Partial<Record<AccKind, Buffer>>): Promise<AccountingImportSummary> {
    return this.execute(files, await this.begin(files));
  }

  // Controlli prima del giro (400 subito) e prenotazione del giro.
  private async begin(files: Partial<Record<AccKind, Buffer>>): Promise<number> {
    if (!KINDS.some((kind) => files[kind])) throw new BadRequestException('Nessun file caricato.');
    const state = await this.states.state();
    if (this.states.forcedOff || !state.enabled)
      throw new BadRequestException('Import contabilità spento.');
    if (!state.from_year) throw new BadRequestException("Impostare l'anno di partenza.");
    if (this.running) throw new BadRequestException('Import contabilità già in corso.');
    this.running = true;
    return state.from_year;
  }

  private async execute(
    files: Partial<Record<AccKind, Buffer>>,
    fromYear: number,
  ): Promise<AccountingImportSummary> {
    const kinds = KINDS.filter((kind) => files[kind]);
    const summary: AccountingImportSummary = { loaded: {}, issues: {}, steps: {} };
    try {
      for (const kind of kinds) {
        const { rows, issues } = parseAccountingCsv(kind, (files[kind] as Buffer).toString('utf8'));
        const { table, entity, yearField } = TABLES[kind];
        const kept = rows.filter((row) => (row as Record<string, number>)[yearField] >= fromYear);
        summary.issues[kind] = issues;
        summary.loaded[kind] = kept.length;
        if (!kept.length) continue;
        await this.dataSource.transaction(async (manager) => {
          await manager.query(`DELETE FROM \`${table}\``);
          for (let i = 0; i < kept.length; i += BATCH) {
            await manager.insert(entity, kept.slice(i, i + BATCH) as ObjectLiteral[]);
          }
        });
      }
      for (const step of this.steps) {
        summary.steps[step.name] = await step.apply({ fromYear });
      }
      await this.reconcile.reconcileAll();
      await this.states.update({
        last_run_at: new Date(),
        last_summary: summary,
        last_error: null,
      });
      return summary;
    } catch (error) {
      const message = (error as Error).message.slice(0, 500);
      // I passi già fatti possono aver tolto quote automatiche o a mano: il
      // ricalcolo le rimette subito invece di aspettare la notte.
      await this.reconcile.reconcileAll().catch(() => undefined);
      await this.states
        .update({ last_run_at: new Date(), last_error: message })
        .catch(() => undefined);
      throw new BadRequestException(`Import contabilità non riuscito: ${message}`);
    } finally {
      this.running = false;
    }
  }
}

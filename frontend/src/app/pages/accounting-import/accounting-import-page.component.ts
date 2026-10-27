import {ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatSlideToggleModule} from '@angular/material/slide-toggle';
import {AccountingStateService} from '../../core/services/accounting-state.service';
import {ToastService} from '../../core/services/toast.service';
import {AccKind, AccountingImportService, AccountingImportStatus, CsvIssue} from './accounting-import.service';
import {containerWait, tinnStatusLabel} from './tinn-status';

const FILES: {kind: AccKind; label: string; columns: string}[] = [
  {
    kind: 'chapters',
    label: 'Capitoli',
    columns: 'year;chapter;article;description;initial_budget;adjusted_budget;spent',
  },
  {
    kind: 'commitments',
    label: 'Impegni',
    columns:
      'commitment_year;commitment_num;commitment_sub;fiscal_year;chapter;article;supplier_vat;amount;cig;cancelled;description',
  },
  {
    kind: 'liquidations',
    label: 'Liquidazioni',
    columns:
      'liquidation_key;commitment_year;commitment_num;commitment_sub;fiscal_year;sdi_identifier;invoice_number;' +
      'invoice_date;invoice_total;invoice_cig;supplier_vat;amount;cancelled',
  },
];

// Numeri del giro per passo (backend: chiave del passo → contatori).
const STEP_LABELS: Record<string, Record<string, string>> = {
  chapters: {
    chaptersCreated: 'Capitoli creati',
    created: 'Esercizi dei capitoli creati',
    updated: 'Esercizi dei capitoli aggiornati',
    deleted: 'Esercizi dei capitoli tolti',
  },
  commitments: {created: 'Impegni creati', updated: 'Impegni aggiornati', deleted: 'Impegni tolti'},
  invoices: {created: 'Fatture create', sdiCompleted: 'Identificativi SDI completati'},
  shares: {invoices: 'Fatture con quote della ragioneria', cleared: 'Fatture tornate al calcolo automatico'},
  links: {contractsLinked: 'Impegni collegati a contratti', utilityChapters: 'Capitoli delle utenze aggiornati'},
};

// Impostazioni → Contabilità (solo Admin): interruttore, anno di partenza e
// caricamento dei tre file del formato neutro estratti dalla contabilità.
@Component({
  selector: 'app-accounting-import-page',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule,
    MatProgressSpinnerModule, MatSlideToggleModule,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .page { padding: 1rem; display: flex; flex-direction: column; gap: 1rem; max-width: 760px; }
    .row { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
    .file { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
    .file-name { color: var(--app-muted); }
    .muted { color: var(--app-muted); }
    .error { color: var(--app-error); }
    h3 { margin: 0 0 0.5rem; }
    p { margin: 0.25rem 0; }
    code { word-break: break-all; }
  `],
  template: `
    <div class="page">
      <h2 style="margin: 0;">Contabilità</h2>
      <p>
        Con l'import acceso la contabilità è la fonte dei dati: capitoli, impegni, quote d'impegno delle
        fatture pagate, fatture mancanti e capitolo delle utenze arrivano dai file della ragioneria.
        Negli anni presenti nei file vince la contabilità: i dati inseriti a mano che non ha si tolgono.
        In UtenzePA restano modificabili note, documenti, contratti collegati e tipi utenza ammessi.
      </p>

      @if (status; as s) {
        @if (s.forcedOff) {
          <p class="error">Spento dal server (ACCOUNTING_IMPORT_DISABLED=true): l'interruttore non ha effetto.</p>
        }
        <div class="row">
          <mat-slide-toggle [checked]="s.enabled" [disabled]="saving || s.forcedOff" (change)="toggle($event.checked)">
            {{ s.enabled ? 'Acceso' : 'Spento' }}
          </mat-slide-toggle>
          <mat-form-field style="width: 180px;" subscriptSizing="dynamic">
            <mat-label>Importa dall'anno</mat-label>
            <input matInput type="number" [(ngModel)]="fromYear" [disabled]="saving" (change)="saveFromYear()">
          </mat-form-field>
        </div>

        @if (s.container; as c) {
          <div>
            <h3>Scaricamento automatico</h3>
            <p class="muted">Il servizio Tinn scarica ogni notte il backup della contabilità e consegna qui i tre
              file, che si caricano da soli entro pochi minuti.</p>
            <p>Ultimo scaricamento: {{ c.finishedAt ? dateTimeIt(c.finishedAt) : (c.state === 'running' ? 'in corso' : 'mai') }}</p>
            <p [class.error]="c.state === 'error'">Esito: {{ tinnLabel(c) }}</p>
            @if (c.backupDate) {
              <p>Backup del {{ dateTimeIt(c.backupDate) }}</p>
            }
            @if (c.nextRunAt) {
              <p>Prossimo giro: {{ dateTimeIt(c.nextRunAt) }}</p>
            }
            <div class="row">
              <button mat-stroked-button type="button" [color]="c.state === 'error' ? 'primary' : undefined"
                      [disabled]="c.state === 'running' || containerWaiting" (click)="runContainer()">
                @if (c.state === 'running' || containerWaiting) {
                  <mat-spinner diameter="18" style="display: inline-block; margin-right: 0.5rem;"></mat-spinner>
                }
                Esegui ora
              </button>
              <span class="muted">Serve solo dopo un errore: il giro notturno parte da solo.</span>
            </div>
          </div>
        }

        <div>
          <h3>File da caricare</h3>
          <p class="muted">CSV con separatore punto e virgola, prima riga con i nomi delle colonne. Ogni file
            sostituisce quello caricato prima; se ne può caricare anche uno solo.</p>
          @for (f of files; track f.kind) {
            <div class="file">
              <button mat-stroked-button type="button" (click)="input.click()" [disabled]="running">
                <mat-icon>upload_file</mat-icon> {{ f.label }}
              </button>
              <input #input type="file" accept=".csv,text/csv" hidden (change)="pick(f.kind, input)">
              <span class="file-name">{{ chosen[f.kind]?.name ?? 'nessun file' }} · ora {{ s.counts[f.kind] }} righe</span>
            </div>
          }
          <div class="row" style="margin-top: 0.75rem;">
            <button mat-flat-button type="button" (click)="upload()"
                    [disabled]="running || !hasFiles() || !s.enabled || s.forcedOff || !s.fromYear">
              @if (running) {
                <mat-spinner diameter="18" style="display: inline-block; margin-right: 0.5rem;"></mat-spinner>
                In corso…
              } @else {
                Carica
              }
            </button>
            @if (!s.enabled || s.forcedOff) {
              <span class="muted">Accendere l'import per caricare.</span>
            } @else if (!s.fromYear) {
              <span class="muted">Indicare l'anno di partenza.</span>
            }
          </div>
        </div>

        <div>
          <h3>Ultimo giro</h3>
          <p>{{ s.lastRunAt ? (s.lastRunAt | date: 'dd/MM/yyyy HH:mm') : 'mai' }}</p>
          @if (s.lastError) {
            <p class="error">Errore: {{ s.lastError }}</p>
          }
          @if (s.lastSummary; as sum) {
            @for (f of files; track f.kind) {
              @if (sum.loaded[f.kind] !== undefined) {
                <p>{{ f.label }}: {{ sum.loaded[f.kind] }} righe caricate</p>
              }
              @for (issue of issuesOf(sum.issues[f.kind]); track $index) {
                <p class="error">{{ f.label }}, riga {{ issue.line }}: {{ issue.message }}</p>
              }
            }
            @for (row of stepRows; track row.label) {
              <p>{{ row.label }}: {{ row.count }}</p>
            }
          }
        </div>

        <div>
          <h3>Tracciato</h3>
          @for (f of files; track f.kind) {
            <p><strong>{{ f.label }}</strong>: <code>{{ f.columns }}</code></p>
          }
          <p class="muted">Importi con la virgola o il punto decimale, date AAAA-MM-GG, cancelled = 1 per le righe annullate.
            Impegni: una riga per anno di competenza. Liquidazioni: liquidation_key univoca, dati della fattura pagata.</p>
        </div>
      } @else {
        <mat-spinner diameter="32"></mat-spinner>
      }
    </div>
  `,
})
export class AccountingImportPageComponent implements OnInit, OnDestroy {
  private service = inject(AccountingImportService);
  private state = inject(AccountingStateService);
  private toast = inject(ToastService);

  readonly files = FILES;
  status: AccountingImportStatus | null = null;
  fromYear: number | null = null;
  chosen: Partial<Record<AccKind, File>> = {};
  stepRows: {label: string; count: number}[] = [];
  saving = false;
  running = false;
  containerWaiting = false;
  readonly tinnLabel = tinnStatusLabel;
  private poll: ReturnType<typeof setTimeout> | null = null;
  private containerPoll: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    if (this.poll) clearTimeout(this.poll);
    if (this.containerPoll) clearTimeout(this.containerPoll);
  }

  dateTimeIt(value: string): string {
    return new Date(value).toLocaleString('it-IT', {dateStyle: 'short', timeStyle: 'short'});
  }

  runContainer(): void {
    const previousStart = this.status?.container?.startedAt ?? null;
    this.containerWaiting = true;
    this.service.runContainer().subscribe({
      next: s => {
        this.apply(s);
        this.toast.add({severity: 'info', summary: 'Scaricamento richiesto', detail: 'Parte entro un minuto.'});
        this.waitForContainer(previousStart, Date.now());
      },
      error: err => {
        this.containerWaiting = false;
        this.error('Scaricamento non avviato', err);
      },
    });
  }

  // Il container legge la richiesta entro un minuto: si rilegge lo stato finché
  // non è partito un giro nuovo e non è finito.
  private waitForContainer(previousStart: string | null, since: number): void {
    this.containerPoll = setTimeout(() => {
      this.service.status().subscribe({
        next: s => {
          this.apply(s);
          const c = s.container;
          const outcome = containerWait(c, previousStart, Date.now() - since);
          if (outcome === 'wait') return this.waitForContainer(previousStart, since);
          this.containerWaiting = false;
          if (outcome === 'timeout' || !c) {
            this.toast.add({
              severity: 'error', summary: 'Il servizio non risponde',
              detail: 'Lo scaricamento automatico non è partito: verificare che il container tinn sia avviato.',
            });
            return;
          }
          if (c.state === 'error') {
            this.toast.add({severity: 'error', summary: 'Scaricamento non riuscito', detail: c.message ?? ''});
          } else {
            this.toast.add({severity: 'success', summary: 'Scaricamento completato', detail: tinnStatusLabel(c)});
          }
        },
        error: () => this.waitForContainer(previousStart, since),
      });
    }, 3000);
  }

  private load(): void {
    this.service.status().subscribe({
      next: s => this.apply(s),
      error: err => this.error('Stato non disponibile', err),
    });
  }

  toggle(enabled: boolean): void {
    this.patch({enabled});
  }

  saveFromYear(): void {
    if (!this.fromYear || this.fromYear === this.status?.fromYear) return;
    this.patch({from_year: Number(this.fromYear)});
  }

  pick(kind: AccKind, input: HTMLInputElement): void {
    const file = input.files?.[0];
    if (file) this.chosen = {...this.chosen, [kind]: file};
    input.value = '';
  }

  hasFiles(): boolean {
    return Object.values(this.chosen).some(Boolean);
  }

  issuesOf(list: CsvIssue[] | undefined): CsvIssue[] {
    return list ?? [];
  }

  upload(): void {
    this.running = true;
    this.service.run(this.chosen).subscribe({
      next: s => {
        this.chosen = {};
        this.apply(s);
        this.waitForRun(s.lastRunAt);
      },
      error: err => {
        this.running = false;
        this.error('Caricamento non riuscito', err);
        this.load();
      },
    });
  }

  // Il giro gira in background: lo stato si rilegge finché non finisce.
  private waitForRun(previousRunAt: string | null): void {
    this.poll = setTimeout(() => {
      this.service.status().subscribe({
        next: s => {
          this.apply(s);
          if (s.running) return this.waitForRun(previousRunAt);
          this.running = false;
          if (s.lastError && s.lastRunAt !== previousRunAt) {
            this.toast.add({severity: 'error', summary: 'Caricamento non riuscito', detail: s.lastError});
          } else {
            this.toast.add({severity: 'success', summary: 'Contabilità caricata'});
          }
        },
        error: () => this.waitForRun(previousRunAt),
      });
    }, 3000);
  }

  private patch(body: {enabled?: boolean; from_year?: number}): void {
    this.saving = true;
    this.service.update(body).subscribe({
      next: s => {
        this.saving = false;
        this.apply(s);
        this.state.refresh();
      },
      error: err => {
        this.saving = false;
        this.error('Salvataggio non riuscito', err);
        if (this.status) this.fromYear = this.status.fromYear;
      },
    });
  }

  private apply(s: AccountingImportStatus): void {
    this.status = s;
    this.fromYear = s.fromYear;
    this.running = s.running;
    this.stepRows = Object.entries(s.lastSummary?.steps ?? {}).flatMap(([step, counts]) =>
      Object.entries(counts).map(([key, count]) => ({label: STEP_LABELS[step]?.[key] ?? `${step} ${key}`, count})),
    );
  }

  private error(summary: string, err: {error?: {message?: string | string[]}}): void {
    const message = err?.error?.message;
    this.toast.add({severity: 'error', summary, detail: Array.isArray(message) ? message.join(', ') : (message ?? '')});
  }
}

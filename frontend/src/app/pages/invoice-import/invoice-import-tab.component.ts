import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { ToastService } from '../../core/services/toast.service';
import { InvoiceImportService, InvoiceImportStatus } from './invoice-import.service';

// Etichette degli esiti del registro messaggi SDI (backend SdiMessageStatus).
// Il giro gira in background sul server: lo stato si interroga finché è in corso.
const STATUS_POLL_MS = 3000;

const MESSAGE_STATUS_LABELS: Record<string, string> = {
  EXTRACTED: 'Importate con un pattern',
  LINKED: 'Collegate a una fattura',
  PENDING: 'In attesa di import',
  IGNORED: 'Strutture ignorate',
  OUT_OF_SCOPE: 'Fuori perimetro',
  NOTIFICATION: 'Esiti e notifiche',
  ERROR: 'Errori',
};

@Component({
  selector: 'app-invoice-import-tab',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatProgressSpinnerModule, MatSlideToggleModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div style="display: flex; flex-direction: column; gap: 1rem; padding: 1rem 0; max-width: 640px;">
      <p>
        Ogni 15 minuti legge la casella PEC dello SDI in sola lettura: collega le fatture già inserite
        (fornitore, numero e data) e ne ricava lo stato (ricevuta, accettata, rifiutata, decorsi i termini).
        Considera solo i fornitori in anagrafica con partita IVA e almeno un contratto di fornitura.
      </p>
      <p style="color: var(--app-muted);">
        Il giro avviene in background: puoi lasciare la pagina, il primo può durare alcuni minuti.
        Spegnere il motore prima di esportare o importare il database e riaccenderlo dopo.
      </p>

      @if (status; as s) {
        @if (!s.configured) {
          <p style="color: var(--app-error);">
            Non configurato: mancano PEC_IMAP_HOST, PEC_IMAP_USER o PEC_IMAP_PASSWORD sul server.
          </p>
        } @else if (s.forcedOff) {
          <p style="color: var(--app-error);">
            Spento dal server (INVOICE_IMPORT_DISABLED=true): l'interruttore non ha effetto.
          </p>
        }

        <div style="display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;">
          <mat-slide-toggle
            [checked]="s.enabled"
            [disabled]="saving || !s.configured"
            (change)="toggle($event.checked)"
          >
            {{ s.enabled ? 'Acceso' : 'Spento' }}
          </mat-slide-toggle>
          <button
            mat-flat-button
            [disabled]="running || !s.configured || s.forcedOff || !s.enabled"
            (click)="runNow()"
          >
            @if (running) {
              <mat-spinner diameter="18" style="display: inline-block; margin-right: 0.5rem;"></mat-spinner>
              In corso…
            } @else {
              Esegui ora
            }
          </button>
        </div>

        <div>
          <p style="margin: 0.25rem 0;">
            Ultimo giro: {{ s.lastRunAt ? (s.lastRunAt | date: 'dd/MM/yyyy HH:mm') : 'mai' }}
          </p>
          <p style="margin: 0.25rem 0;">
            Ultimo giro riuscito: {{ s.lastSuccessAt ? (s.lastSuccessAt | date: 'dd/MM/yyyy HH:mm') : 'mai' }}
          </p>
          @if (s.lastError) {
            <p style="margin: 0.25rem 0; color: var(--app-error);">Ultimo errore: {{ s.lastError }}</p>
          }
        </div>

        <div>
          <h3 style="margin: 0 0 0.5rem;">File letti dalla PEC</h3>
          @for (row of countRows; track row.key) {
            <p style="margin: 0.25rem 0;">{{ row.label }}: {{ row.count }}</p>
          } @empty {
            <p style="margin: 0; color: var(--app-muted);">Nessun file letto finora.</p>
          }
        </div>

        @if (s.recentErrors.length) {
          <div>
            <h3 style="margin: 0 0 0.5rem;">Ultimi file in errore</h3>
            @for (e of s.recentErrors; track $index) {
              <p style="margin: 0.25rem 0;">
                {{ e.create_date | date: 'dd/MM/yyyy HH:mm' }} · {{ e.file_name }}
                <span style="color: var(--app-error);">· {{ e.error || 'errore sconosciuto' }}</span>
              </p>
            }
          </div>
        }
      } @else {
        <mat-spinner diameter="32"></mat-spinner>
      }
    </div>
  `,
})
export class InvoiceImportTabComponent implements OnInit, OnDestroy {
  private service = inject(InvoiceImportService);
  private toastService = inject(ToastService);

  status: InvoiceImportStatus | null = null;
  countRows: { key: string; label: string; count: number }[] = [];
  saving = false;
  running = false;
  private pollHandle: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    if (this.pollHandle) clearTimeout(this.pollHandle);
  }

  private load(): void {
    this.service.status().subscribe({
      next: (status) => this.apply(status),
      error: (err) => this.error('Stato import non disponibile', err),
    });
  }

  private apply(status: InvoiceImportStatus): void {
    const finished = this.running && !status.running;
    this.status = status;
    this.running = status.running;
    if (this.pollHandle) clearTimeout(this.pollHandle);
    this.pollHandle = status.running ? setTimeout(() => this.load(), STATUS_POLL_MS) : null;
    if (finished) {
      this.toastService.add(
        status.lastError
          ? { severity: 'error', summary: 'Import non riuscito', detail: status.lastError }
          : { severity: 'success', summary: 'Import completato' },
      );
    }
    this.countRows = Object.keys(MESSAGE_STATUS_LABELS)
      .filter((key) => status.counts[key])
      .map((key) => ({ key, label: MESSAGE_STATUS_LABELS[key], count: status.counts[key] }));
  }

  toggle(enabled: boolean): void {
    this.saving = true;
    this.service.setEnabled(enabled).subscribe({
      next: (status) => {
        this.saving = false;
        this.apply(status);
      },
      error: (err) => {
        this.saving = false;
        this.error('Interruttore non salvato', err);
        this.load();
      },
    });
  }

  runNow(): void {
    this.running = true;
    this.service.run().subscribe({
      next: (status) => this.apply(status),
      error: (err) => {
        this.running = false;
        this.error('Import non avviato', err);
        this.load();
      },
    });
  }

  private error(summary: string, err: { error?: { message?: string } }): void {
    this.toastService.add({ severity: 'error', summary, detail: err?.error?.message ?? '' });
  }
}

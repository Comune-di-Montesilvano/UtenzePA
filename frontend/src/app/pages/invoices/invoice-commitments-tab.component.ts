import {AccountingStateService} from '../../core/services/accounting-state.service';
import {ChangeDetectionStrategy, Component, EventEmitter, inject, Input, OnChanges, Output} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatDialog} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {FilterableSelectComponent} from '../../core/components/filterable-select.component';
import {ConfirmDialogComponent, ConfirmDialogData} from '../../core/components/confirm-dialog.component';
import {EntityNavigatorService} from '../../core/services/entity-navigator.service';
import type {TOption} from '../../core/types/option.interface';
import {Commitment, CommitmentRef, commitmentRefLabel} from '../commitments/commitment.model';
import {annualityFor, InvoiceCommitmentShare} from './entity/invoice-commitment-share.model';

const eur = (n: number | null | undefined): string =>
  n === null || n === undefined ? '—' : Number(n).toLocaleString('it-IT', {style: 'currency', currency: 'EUR'});

const round2 = (n: number): number => Math.round(n * 100) / 100;

// Quota in modifica: annualità selezionabili dell'impegno scelto (campo cache).
interface EditableShare extends InvoiceCommitmentShare {
  yearOptions: number[];
}

// Tab «Impegni» della scheda fattura. Automatico (default): la quota la
// assegna il ricalcolo dopo il Salva, qui solo in lettura. «Dividi a mano»:
// quote scelte su impegni del contratto della fattura. `edited` = quote
// modificate nel tab (undefined = invariate, [] = torna automatico).
@Component({
  selector: 'app-invoice-commitments-tab',
  standalone: true,
  imports: [FormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule, MatTooltipModule, FilterableSelectComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @if (accounting) {
      <p class="share-auto">
        <mat-icon>account_balance</mat-icon>
        <span>Ripartizione della ragioneria (liquidazioni)</span>
      </p>
      @for (s of autoShares; track $index) {
        <p class="share-auto">
          <button type="button" class="share-link" (click)="openCommitment(s.commitment_id_fk)" matTooltip="Clic per aprire l'impegno">
            {{ refLabel(s.commitment) }} · comp. {{ s.fiscal_year }} · {{ eur(s.amount) }}
          </button>
        </p>
      }
    } @else if (!manual) {
      @if (!contractId) {
        <p class="sheet-empty">Senza contratto in testata la fattura non pesa su nessun impegno: conta sul capitolo dell'utenza delle righe.</p>
      } @else if (pendingAuto || stale) {
        <p class="share-auto">
          <mat-icon>auto_mode</mat-icon>
          <span>Al Salva l'impegno si assegna in automatico, in ordine di numero tra quelli del contratto.</span>
        </p>
      } @else {
        @for (s of autoShares; track $index) {
          <p class="share-auto">
            <mat-icon>auto_mode</mat-icon>
            <button type="button" class="share-link" (click)="openCommitment(s.commitment_id_fk)"
                    matTooltip="Assegnata automaticamente in ordine di numero (si ricalcola salvando la fattura). Clic per aprire l'impegno.">
              Assegnata a {{ refLabel(s.commitment) }} · comp. {{ s.fiscal_year }} · {{ eur(s.amount) }}
            </button>
          </p>
        } @empty {
          <p class="share-auto share-auto--warn">
            <mat-icon>warning</mat-icon>
            <span>Nessun impegno del contratto per l'esercizio {{ competence ?? '—' }}</span>
          </p>
        }
      }
      @if (!readOnly && contractId) {
        <button mat-stroked-button type="button" (click)="startManual()"><mat-icon>call_split</mat-icon> Dividi a mano</button>
      }
    } @else {
      @for (s of rows; track $index; let i = $index) {
        <div class="share-row">
          <span class="share-n">{{ i + 1 }}</span>
          <div class="f-commitment">
            <app-filterable-select label="Impegno *" placeholder="Numero, esercizio o capitolo..." [options]="commitmentOptions"
              [ngModel]="s.commitment_id_fk || null" [ngModelOptions]="{standalone: true}" (ngModelChange)="setCommitment(s, $event)" [disabled]="readOnly"
              [errorMessage]="!s.commitment_id_fk && touched ? 'Obbligatorio' : null"
              [createLabel]="readOnly || !contractId || accountingActive ? null : 'Nuovo impegno'" (create)="newCommitment(s)"></app-filterable-select>
          </div>
          <mat-form-field class="f-year">
            <mat-label>Annualità</mat-label>
            <mat-select [ngModel]="s.fiscal_year" [ngModelOptions]="{standalone: true}" (ngModelChange)="set(s, 'fiscal_year', $event)"
                        [disabled]="readOnly || !s.yearOptions.length">
              @for (y of s.yearOptions; track y) {
                <mat-option [value]="y">{{ y }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field class="f-num">
            <mat-label>Importo €</mat-label>
            <input matInput type="number" step="0.01" [ngModel]="s.amount" [ngModelOptions]="{standalone: true}" (ngModelChange)="set(s, 'amount', $event)" [disabled]="readOnly" required>
          </mat-form-field>
          @if (!readOnly && rows.length > 1) {
            <button mat-icon-button type="button" aria-label="Rimuovi quota" (click)="removeAt(i)"><mat-icon>delete</mat-icon></button>
          }
        </div>
      }
      <p class="shares-total">
        Somma quote: <strong>{{ eur(sum) }}</strong> · Totale fattura: <strong>{{ eur(total) }}</strong>
        · <span [class.shares-diff]="diff !== 0">Differenza: {{ eur(diff) }}</span>
      </p>
      @if (!readOnly) {
        <div class="shares-actions">
          <button mat-stroked-button type="button" (click)="add()"><mat-icon>add</mat-icon> Aggiungi quota</button>
          <button mat-stroked-button type="button" (click)="backToAuto()"><mat-icon>auto_mode</mat-icon> Torna automatico</button>
        </div>
      }
    }
  `,
  styles: [`
    .share-auto { display: flex; align-items: flex-start; gap: 6px; margin: 0 0 12px; }
    .share-auto mat-icon { font-size: 18px; width: 18px; height: 18px; color: var(--sheet-muted); }
    .share-auto--warn, .share-auto--warn mat-icon { color: var(--tone-warn-fg); }
    .share-link { background: none; border: 0; padding: 0; font: inherit; cursor: pointer; color: var(--app-link); font-weight: 500; text-align: left; }
    .share-link:hover { text-decoration: underline; }
    .share-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0 8px;
      align-items: flex-start;
      padding: 8px 0;
      border-bottom: 1px solid var(--sheet-border);
    }
    .share-row > * { flex: 0 0 auto; }
    .share-n { width: 1.5rem; padding-top: 18px; color: var(--sheet-muted); }
    .f-commitment { width: 360px; max-width: 100%; }
    .f-year { width: 130px; }
    .f-num { width: 140px; }
    .shares-total { margin: 12px 0; }
    .shares-diff { color: var(--tone-danger-fg); font-weight: 500; }
    .shares-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  `],
})
export class InvoiceCommitmentsTabComponent implements OnChanges {
  // Import della contabilità acceso: impegni e capitoli solo dalla contabilità.
  accountingActive = false;
  private accountingSub = inject(AccountingStateService).active$.subscribe(a => (this.accountingActive = a));
  // Quote salvate (GET della fattura).
  @Input() shares: InvoiceCommitmentShare[] = [];
  // Quote modificate nel tab: undefined = invariate.
  @Input() edited: InvoiceCommitmentShare[] | undefined;
  // Impegni del contratto della fattura (annualità) e relative opzioni.
  @Input() commitments: Commitment[] = [];
  @Input() commitmentOptions: TOption[] = [];
  // Totale fattura (totale documento, altrimenti somma delle righe).
  @Input() total = 0;
  // Esercizio di competenza della fattura (periodo delle righe o data).
  @Input() competence: number | null = null;
  @Input() readOnly = false;
  @Input() contractId: number | null = null;
  @Input() supplierId: number | null = null;
  // Fattura nuova o contratto cambiato: la quota automatica arriva al Salva.
  @Input() stale = false;
  // Salva tentato con quote incomplete: errori visibili.
  @Input() touched = false;
  @Output() editedChange = new EventEmitter<InvoiceCommitmentShare[] | undefined>();
  @Output() optionsStale = new EventEmitter<'commitments'>();

  private navigator = inject(EntityNavigatorService);
  private dialog = inject(MatDialog);

  manual = false;
  // Quote della ragioneria (import contabilità): sola lettura.
  accounting = false;
  // Tornata automatica nel tab ma non ancora salvata.
  pendingAuto = false;
  autoShares: InvoiceCommitmentShare[] = [];
  rows: EditableShare[] = [];
  sum = 0;
  readonly eur = eur;
  readonly refLabel = (c: CommitmentRef | null | undefined) => commitmentRefLabel(c);
  private lastEmitted: InvoiceCommitmentShare[] | undefined | null = null;

  get diff(): number {
    return round2(Number(this.total || 0) - this.sum);
  }

  ngOnChanges(): void {
    // Ricostruisce solo se le quote in ingresso non sono quelle appena emesse
    // (altrimenti ogni modifica ricreerebbe le righe e farebbe perdere il focus).
    if (this.edited !== this.lastEmitted) {
      const list = this.edited ?? this.shares ?? [];
      this.manual = list.some(s => s.source === 'MANUAL' || !s.source);
      this.accounting = list.some(s => s.source === 'ACCOUNTING');
      this.pendingAuto = this.edited !== undefined && !this.edited.length && !!this.shares?.length;
      this.autoShares = this.manual ? [] : list;
      this.rows = this.manual ? list.map(s => this.editable(s)) : [];
      this.recalc();
    } else {
      // Impegni ricaricati (es. uno nuovo creato al volo): annualità aggiornate.
      for (const r of this.rows) r.yearOptions = this.yearsOf(r.commitment_id_fk);
    }
  }

  // Prima quota precompilata: impegno automatico attuale (se c'è) col totale.
  startManual(): void {
    const auto = this.autoShares[0];
    const first = this.editable({
      commitment_id_fk: auto?.commitment_id_fk ?? (this.commitments.length === 1 ? this.commitments[0].id : 0),
      fiscal_year: auto?.fiscal_year ?? null,
      amount: round2(Number(this.total || 0)),
      source: 'MANUAL',
    });
    if (first.commitment_id_fk && first.fiscal_year === null) first.fiscal_year = this.defaultYear(first.yearOptions);
    this.manual = true;
    this.pendingAuto = false;
    this.rows = [first];
    this.emit();
  }

  backToAuto(): void {
    this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
      width: '420px',
      data: {
        title: 'Torna automatico',
        message: "Le quote scelte a mano si eliminano: al Salva l'impegno si assegna in automatico, in ordine di numero.",
        confirmLabel: 'Torna automatico',
      },
    }).afterClosed().subscribe(confirmed => {
      if (!confirmed) return;
      const savedManual = (this.shares ?? []).some(s => s.source === 'MANUAL');
      this.manual = false;
      this.rows = [];
      // Quote salvate automatiche: nulla da cambiare (quote omesse nel payload).
      this.pendingAuto = savedManual;
      this.autoShares = savedManual ? [] : (this.shares ?? []);
      this.recalc();
      this.lastEmitted = savedManual ? [] : undefined;
      this.editedChange.emit(this.lastEmitted);
    });
  }

  set<K extends keyof InvoiceCommitmentShare>(s: EditableShare, key: K, value: InvoiceCommitmentShare[K]): void {
    (s as InvoiceCommitmentShare)[key] = value;
    this.emit();
  }

  // Annualità predefinita dell'impegno scelto: quella della competenza o la più vicina.
  setCommitment(s: EditableShare, id: number | null, commitment?: Commitment): void {
    s.commitment_id_fk = id ?? 0;
    s.yearOptions = this.yearsOf(s.commitment_id_fk, commitment);
    s.fiscal_year = this.defaultYear(s.yearOptions);
    s.commitment = null;
    this.emit();
  }

  newCommitment(s: EditableShare): void {
    if (!this.contractId) return;
    this.navigator.createCommitment({contract_ids: [this.contractId], supplier_id_fk: this.supplierId}).subscribe(c => {
      if (!c) return;
      this.optionsStale.emit('commitments');
      this.setCommitment(s, c.id, c);
    });
  }

  openCommitment(id: number): void {
    this.navigator.openCommitment(id).subscribe();
  }

  // Nuova quota con la differenza ancora da ripartire.
  add(): void {
    this.rows = [...this.rows, this.editable({commitment_id_fk: 0, fiscal_year: null, amount: this.diff, source: 'MANUAL'})];
    this.emit();
  }

  removeAt(i: number): void {
    this.rows = this.rows.filter((_, j) => j !== i);
    this.emit();
  }

  private editable(s: InvoiceCommitmentShare): EditableShare {
    return {...s, yearOptions: this.yearsOf(s.commitment_id_fk)};
  }

  private yearsOf(id: number | null | undefined, fallback?: Commitment): number[] {
    const c = this.commitments.find(k => k.id === id) ?? (fallback?.id === id ? fallback : undefined);
    return [...new Set((c?.years ?? []).map(y => Number(y.fiscal_year)))].sort((a, b) => a - b);
  }

  private defaultYear(years: number[]): number | null {
    return annualityFor(years, this.competence ?? new Date().getFullYear());
  }

  private emit(): void {
    this.recalc();
    this.lastEmitted = this.rows.map(({yearOptions: _y, ...s}) => ({...s, source: 'MANUAL' as const}));
    this.editedChange.emit(this.lastEmitted);
  }

  private recalc(): void {
    this.sum = round2(this.rows.reduce((t, s) => t + (Number(s.amount) || 0), 0));
  }
}

import {ChangeDetectionStrategy, Component, EventEmitter, inject, Input, OnChanges, Output} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatTooltipModule} from '@angular/material/tooltip';
import {FilterableSelectComponent} from '../../core/components/filterable-select.component';
import type {TOption} from '../../core/types/option.interface';
import {AUTO_COMMITMENT, InvoiceLine, isAutoLine} from './entity/invoice-line.model';
import {commitmentRefLabel} from '../commitments/commitment.model';
import {EntityNavigatorService} from '../../core/services/entity-navigator.service';
import {Utility} from '../utilities/entity/utility.entity';
import {toIsoDate} from '../utilities/consumptions/consumption.model';

// Riga in modifica: date come Date locali per il datepicker, convertite in
// 'AAAA-MM-GG' (giorno locale) a ogni modifica.
interface EditableLine extends InvoiceLine {
  start: Date | null;
  end: Date | null;
}

const toLocalDate = (iso: string | null): Date | null => {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};

const eur = (n: number | null | undefined): string =>
  n === null || n === undefined ? '—' : Number(n).toLocaleString('it-IT', {style: 'currency', currency: 'EUR'});

// Tab "Righe" della scheda fattura: una riga per utenza (o quota non
// ripartita), tutto facoltativo tranne l'importo IVA inclusa.
@Component({
  selector: 'app-invoice-lines-tab',
  standalone: true,
  imports: [FormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, MatDatepickerModule, MatTooltipModule, FilterableSelectComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <p class="lines-total">
      Totale righe: <strong>{{ eur(sum) }}</strong>
      @if (hasTotal) {
        · Totale documento: <strong>{{ eur(total) }}</strong>
        @if (diff !== 0) { · <span class="lines-diff">Differenza: {{ eur(diff) }}</span> }
      }
    </p>
    @for (l of rows; track $index; let i = $index) {
      <div class="line-row">
        <span class="line-n">{{ i + 1 }}</span>
        <div class="f-utility">
          <app-filterable-select label="Utenza" placeholder="POD/PDR o codice cliente..." [options]="utilityOptions"
            [ngModel]="l.utility_id_fk" [ngModelOptions]="{standalone: true}" (ngModelChange)="set(l, 'utility_id_fk', $event)" [disabled]="readOnly"
            [createLabel]="readOnly ? null : 'Nuova utenza'" (create)="newUtility(l)"></app-filterable-select>
          @if (l.utility_id_fk) {
            <button mat-icon-button type="button" class="open-utility" aria-label="Apri scheda utenza"
                    matTooltip="Apri scheda utenza" (click)="openUtility(l.utility_id_fk)">
              <mat-icon>open_in_new</mat-icon>
            </button>
          }
        </div>
        <div class="f-commitment">
          <app-filterable-select label="Impegno" placeholder="Numero, esercizio o capitolo..." [options]="selectOptions"
            [ngModel]="commitmentValue(l)" [ngModelOptions]="{standalone: true}" (ngModelChange)="setCommitment(l, $event)" [disabled]="readOnly"
            [createLabel]="readOnly || !contractId ? null : 'Nuovo impegno'" (create)="newCommitment(l)"></app-filterable-select>
          @if (!readOnly && !contractId) {
            <span class="line-hint">Impegni disponibili scegliendo il contratto.</span>
          } @else if (autoHint(l)) {
            <button type="button" class="line-hint line-hint--link" (click)="openCommitment(l)"
                    matTooltip="Assegnato automaticamente in ordine di numero (cambia salvando la fattura). Clic per aprire l'impegno.">
              <mat-icon>auto_mode</mat-icon> {{ autoHint(l) }}
            </button>
          } @else if (autoMissing(l)) {
            <span class="line-hint line-hint--warn" matTooltip="Nessun impegno del contratto per il capitolo e l'esercizio della riga">
              <mat-icon>warning</mat-icon> Automatico: nessun impegno disponibile
            </span>
          }
        </div>
        <mat-form-field class="f-date">
          <mat-label>Dal</mat-label>
          <input matInput [matDatepicker]="dp1" [ngModel]="l.start" [ngModelOptions]="{standalone: true}" (ngModelChange)="setDate(l, 'start', $event)" [disabled]="readOnly" placeholder="GG/MM/AAAA">
          <mat-datepicker-toggle matIconSuffix [for]="dp1"></mat-datepicker-toggle>
          <mat-datepicker #dp1></mat-datepicker>
        </mat-form-field>
        <mat-form-field class="f-date">
          <mat-label>Al</mat-label>
          <input matInput [matDatepicker]="dp2" [ngModel]="l.end" [ngModelOptions]="{standalone: true}" (ngModelChange)="setDate(l, 'end', $event)" [disabled]="readOnly" placeholder="GG/MM/AAAA">
          <mat-datepicker-toggle matIconSuffix [for]="dp2"></mat-datepicker-toggle>
          <mat-datepicker #dp2></mat-datepicker>
        </mat-form-field>
        <mat-form-field class="f-num">
          <mat-label>Consumo</mat-label>
          <input matInput type="number" [ngModel]="l.consumption" [ngModelOptions]="{standalone: true}" (ngModelChange)="set(l, 'consumption', $event)" [disabled]="readOnly">
        </mat-form-field>
        <mat-form-field class="f-num">
          <mat-label>Importo €</mat-label>
          <input matInput type="number" step="0.01" [ngModel]="l.amount" [ngModelOptions]="{standalone: true}" (ngModelChange)="set(l, 'amount', $event)" [disabled]="readOnly" required>
        </mat-form-field>
        <mat-form-field class="f-code">
          <mat-label>Codice fornitura</mat-label>
          <input matInput [ngModel]="l.supply_code" [ngModelOptions]="{standalone: true}" (ngModelChange)="set(l, 'supply_code', $event)" [disabled]="readOnly">
        </mat-form-field>
        <mat-form-field class="f-desc">
          <mat-label>Descrizione</mat-label>
          <input matInput [ngModel]="l.description" [ngModelOptions]="{standalone: true}" (ngModelChange)="set(l, 'description', $event)" [disabled]="readOnly">
        </mat-form-field>
        @if (!readOnly) {
          <button mat-icon-button type="button" aria-label="Rimuovi riga" (click)="removeAt(i)"><mat-icon>delete</mat-icon></button>
        }
      </div>
    } @empty {
      <p class="sheet-empty">Nessuna riga: la fattura non è ancora ripartita sulle utenze.</p>
    }
    @if (!readOnly) {
      <button mat-stroked-button type="button" (click)="add()"><mat-icon>add</mat-icon> Aggiungi riga</button>
    }
  `,
  styles: [`
    .lines-total { margin: 0 0 12px; }
    .lines-diff { color: var(--tone-warn-fg); }
    .line-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0 8px;
      align-items: flex-start;
      padding: 8px 0;
      border-bottom: 1px solid var(--sheet-border);
    }
    .line-row > * { flex: 0 0 auto; }
    .line-n { width: 1.5rem; padding-top: 18px; color: var(--sheet-muted); }
    .f-utility { width: 300px; display: flex; align-items: flex-start; gap: 4px; }
    .f-utility > app-filterable-select { flex: 1 1 auto; min-width: 0; }
    .open-utility { margin-top: 4px; }
    .f-commitment { width: 240px; }
    .f-date { width: 150px; }
    .f-num { width: 120px; }
    .f-code { width: 160px; }
    .f-desc { flex: 1 1 220px; }
    .line-hint { display: block; font-size: 0.75rem; color: var(--sheet-muted); margin-top: -12px; }
    .line-hint--link, .line-hint--warn { display: flex; align-items: flex-start; gap: 4px; font: inherit; font-size: 0.8125rem; line-height: 1.35; margin-top: -10px; }
    .line-hint--link { background: none; border: 0; padding: 0; cursor: pointer; color: var(--app-link); font-weight: 500; text-align: left; }
    .line-hint--link:hover { text-decoration: underline; }
    .line-hint--warn { color: var(--tone-warn-fg); }
    .line-hint mat-icon { font-size: 16px; width: 16px; height: 16px; }
  `],
})
export class InvoiceLinesTabComponent implements OnChanges {
  @Input() lines: InvoiceLine[] = [];
  @Input() total: number | null | undefined = null;
  @Input() utilityOptions: TOption[] = [];
  // «Automatico» in testa alle opzioni: campo cache, ricalcolato col setter.
  selectOptions: TOption[] = [{label: 'Automatico', value: AUTO_COMMITMENT, sublabel: 'in ordine di numero'}];
  @Input() set commitmentOptions(list: TOption[]) {
    this.selectOptions = [{label: 'Automatico', value: AUTO_COMMITMENT, sublabel: 'in ordine di numero'}, ...(list ?? [])];
  }
  @Input() readOnly = false;
  // Contratto della fattura: serve a creare un impegno dalla riga.
  @Input() contractId: number | null = null;
  // Fornitore della fattura: precompilato sugli impegni creati da una riga.
  @Input() supplierId: number | null = null;
  @Output() linesChange = new EventEmitter<InvoiceLine[]>();
  // Elemento creato da una riga: il padre ricarica quelle opzioni.
  @Output() optionsStale = new EventEmitter<'utilities' | 'commitments'>();

  private navigator = inject(EntityNavigatorService);

  rows: EditableLine[] = [];
  sum = 0;
  readonly eur = eur;
  private lastEmitted: InvoiceLine[] | null = null;

  get hasTotal(): boolean {
    return this.total !== null && this.total !== undefined && `${this.total}` !== '';
  }

  get diff(): number {
    return this.hasTotal ? Math.round((Number(this.total) - this.sum) * 100) / 100 : 0;
  }

  ngOnChanges(): void {
    // Ricostruisce solo se l'array in ingresso non è quello appena emesso
    // (altrimenti ogni modifica ricreerebbe le righe e farebbe perdere il focus).
    if (this.lines !== this.lastEmitted) {
      this.rows = (this.lines ?? []).map(l => ({...l, start: toLocalDate(l.period_start), end: toLocalDate(l.period_end)}));
      this.recalc();
    }
  }

  set<K extends keyof InvoiceLine>(l: EditableLine, key: K, value: InvoiceLine[K]): void {
    (l as InvoiceLine)[key] = value;
    this.emit();
  }

  setDate(l: EditableLine, key: 'start' | 'end', value: Date | null): void {
    l[key] = value;
    const iso = value instanceof Date && !isNaN(value.getTime()) ? toIsoDate(value) : null;
    if (key === 'start') l.period_start = iso;
    else l.period_end = iso;
    this.emit();
  }

  // Scheda dell'utenza sopra quella della fattura; se salvata, etichette
  // delle opzioni ricaricate (POD o codice possono essere cambiati).
  openUtility(id: number): void {
    this.navigator.openUtility(id).subscribe(saved => {
      if (saved) this.optionsStale.emit('utilities');
    });
  }

  newUtility(l: EditableLine): void {
    this.navigator.createUtility(Utility.create()).subscribe(u => {
      if (!u) return;
      this.optionsStale.emit('utilities');
      this.set(l, 'utility_id_fk', u.id);
    });
  }

  // «Automatico» in testa: l'impegno lo sceglie il ricalcolo dopo il Salva.
  commitmentValue(l: EditableLine): number | null {
    return isAutoLine(l) ? AUTO_COMMITMENT : l.commitment_id_fk;
  }

  setCommitment(l: EditableLine, value: number | null): void {
    const auto = value === AUTO_COMMITMENT || value === null;
    l.commitment_auto = auto;
    l.commitment_id_fk = auto ? null : value;
    if (auto) l.commitment = null;
    this.emit();
  }

  // Riga automatica già assegnata dal server: quale impegno sta consumando.
  autoHint(l: EditableLine): string | null {
    const c = l.commitment;
    if (!isAutoLine(l) || !c) return null;
    const chapter = c.budgetChapter?.chapter_code ? ` · cap. ${c.budgetChapter.chapter_code}/${c.budgetChapter.article ?? 0}` : '';
    const year = l.commitment_fiscal_year ? ` · comp. ${l.commitment_fiscal_year}` : '';
    return `Assegnato ${commitmentRefLabel(c)}${chapter}${year}`;
  }

  // Riga salvata, automatica, senza impegno: il ricalcolo non ne ha trovati.
  autoMissing(l: EditableLine): boolean {
    return !!l.id && isAutoLine(l) && !l.commitment && !!this.contractId;
  }

  openCommitment(l: EditableLine): void {
    if (l.commitment) this.navigator.openCommitment(l.commitment.id).subscribe();
  }

  newCommitment(l: EditableLine): void {
    if (!this.contractId) return;
    this.navigator.createCommitment({contract_ids: [this.contractId], supplier_id_fk: this.supplierId}).subscribe(c => {
      if (!c) return;
      this.optionsStale.emit('commitments');
      this.setCommitment(l, c.id);
    });
  }

  add(): void {
    this.rows = [...this.rows, {
      amount: 0, utility_id_fk: null, commitment_id_fk: null, commitment_auto: true, period_start: null, period_end: null,
      consumption: null, supply_code: null, description: null, start: null, end: null,
    }];
    this.emit();
  }

  removeAt(i: number): void {
    this.rows = this.rows.filter((_, j) => j !== i);
    this.emit();
  }

  private emit(): void {
    this.recalc();
    this.lastEmitted = this.rows.map(({start: _s, end: _e, ...l}) => l);
    this.linesChange.emit(this.lastEmitted);
  }

  private recalc(): void {
    this.sum = Math.round(this.rows.reduce((s, l) => s + (Number(l.amount) || 0), 0) * 100) / 100;
  }
}

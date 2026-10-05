import {ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {FilterableSelectComponent} from '../../core/components/filterable-select.component';
import type {TOption} from '../../core/types/option.interface';
import {InvoiceLine} from './entity/invoice-line.model';
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
  imports: [FormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, MatDatepickerModule, FilterableSelectComponent],
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
            [ngModel]="l.utility_id_fk" [ngModelOptions]="{standalone: true}" (ngModelChange)="set(l, 'utility_id_fk', $event)" [disabled]="readOnly"></app-filterable-select>
        </div>
        <div class="f-commitment">
          <app-filterable-select label="Impegno" placeholder="Esercizio o capitolo..." [options]="commitmentOptions"
            [ngModel]="l.commitment_id_fk" [ngModelOptions]="{standalone: true}" (ngModelChange)="set(l, 'commitment_id_fk', $event)" [disabled]="readOnly"></app-filterable-select>
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
    .f-utility { width: 260px; }
    .f-commitment { width: 240px; }
    .f-date { width: 150px; }
    .f-num { width: 120px; }
    .f-code { width: 160px; }
    .f-desc { flex: 1 1 220px; }
  `],
})
export class InvoiceLinesTabComponent implements OnChanges {
  @Input() lines: InvoiceLine[] = [];
  @Input() total: number | null | undefined = null;
  @Input() utilityOptions: TOption[] = [];
  @Input() commitmentOptions: TOption[] = [];
  @Input() readOnly = false;
  @Output() linesChange = new EventEmitter<InvoiceLine[]>();

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

  add(): void {
    this.rows = [...this.rows, {
      amount: 0, utility_id_fk: null, commitment_id_fk: null, period_start: null, period_end: null,
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

import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {FilterableSelectComponent} from '../filterable-select.component';
import type {TOption} from '../../types/option.interface';
import {BOOL_OPTIONS, FilterDef, FilterValues} from './filter-def';
import {toChips} from './filter-values';

export interface AdvancedFiltersData {
  defs: FilterDef[];
  values: FilterValues;
  options: Record<string, TOption[]>;
}

interface Section {
  name: string;
  defs: FilterDef[];
}

// Opzioni oltre questa soglia: select con ricerca.
const LONG_LIST = 12;
// Filtri senza gruppo (di solito quelli in linea nella barra).
const MAIN_SECTION = 'Principali';

const toDate = (v: unknown): Date | null => {
  if (v instanceof Date) return v;
  if (typeof v !== 'string' || !v) return null;
  const [y, m, d] = v.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};

// Dialog generico dei filtri avanzati: sezioni a sinistra (con il numero di
// filtri attivi), campi della sezione scelta a destra, riepilogo in fondo.
@Component({
  selector: 'app-advanced-filters-dialog',
  standalone: true,
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule,
    MatIconModule, MatDatepickerModule, FilterableSelectComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h2 mat-dialog-title>Filtri avanzati</h2>
    <mat-dialog-content class="adv">
      @if (sections.length > 1) {
        <nav class="adv-nav" aria-label="Sezioni dei filtri">
          @for (s of sections; track s.name) {
            <button type="button" class="adv-nav-item" [class.active]="s === current" (click)="current = s">
              <span>{{ s.name }}</span>
              @if (activeIn(s); as n) { <span class="adv-count">{{ n }}</span> }
            </button>
          }
        </nav>
      }
      <section class="adv-fields" [attr.aria-label]="current.name">
        @for (d of current.defs; track d.key) {
          <div class="adv-field" [class.adv-wide]="d.type === 'dateRange' || d.type === 'multi'">
            @switch (d.type) {
              @case ('select') {
                @if (opts(d).length > LONG_LIST) {
                  <app-filterable-select [label]="d.label" [options]="opts(d)" [(ngModel)]="values[d.key]"
                                         subscriptSizing="dynamic" [ngModelOptions]="{standalone: true}"></app-filterable-select>
                } @else {
                  <mat-form-field subscriptSizing="dynamic">
                    <mat-label>{{ d.label }}</mat-label>
                    <mat-select [(ngModel)]="values[d.key]">
                      @if (d.defaultValue === undefined) { <mat-option [value]="null">(qualsiasi)</mat-option> }
                      @for (o of opts(d); track o.value) { <mat-option [value]="o.value">{{ o.label }}</mat-option> }
                    </mat-select>
                  </mat-form-field>
                }
              }
              @case ('bool') {
                <mat-form-field subscriptSizing="dynamic">
                  <mat-label>{{ d.label }}</mat-label>
                  <mat-select [(ngModel)]="values[d.key]">
                    <mat-option [value]="null">(qualsiasi)</mat-option>
                    @for (o of boolOptions; track o.value) { <mat-option [value]="o.value">{{ o.label }}</mat-option> }
                  </mat-select>
                </mat-form-field>
              }
              @case ('multi') {
                <mat-form-field subscriptSizing="dynamic">
                  <mat-label>{{ d.label }}</mat-label>
                  <mat-select multiple [(ngModel)]="values[d.key]">
                    @for (o of opts(d); track o.value) { <mat-option [value]="o.value">{{ o.label }}</mat-option> }
                  </mat-select>
                </mat-form-field>
              }
              @case ('dateRange') {
                <mat-form-field subscriptSizing="dynamic">
                  <mat-label>{{ d.label }}</mat-label>
                  <mat-date-range-input [rangePicker]="picker">
                    <input matStartDate placeholder="dal" [ngModel]="rangeFrom(d.key)" (ngModelChange)="setRange(d.key, 0, $event)">
                    <input matEndDate placeholder="al" [ngModel]="rangeTo(d.key)" (ngModelChange)="setRange(d.key, 1, $event)">
                  </mat-date-range-input>
                  <mat-datepicker-toggle matIconSuffix [for]="picker"></mat-datepicker-toggle>
                  <mat-date-range-picker #picker></mat-date-range-picker>
                </mat-form-field>
              }
              @case ('number') {
                <mat-form-field subscriptSizing="dynamic">
                  <mat-label>{{ d.label }}</mat-label>
                  <input matInput type="number" [(ngModel)]="values[d.key]" (keyup.enter)="apply()">
                </mat-form-field>
              }
              @default {
                <mat-form-field subscriptSizing="dynamic">
                  <mat-label>{{ d.label }}</mat-label>
                  <input matInput [(ngModel)]="values[d.key]" (keyup.enter)="apply()">
                </mat-form-field>
              }
            }
          </div>
        }
      </section>
    </mat-dialog-content>
    <div class="adv-summary">
      @if (summary(); as s) {
        <mat-icon>filter_alt</mat-icon><span>{{ s }}</span>
      } @else {
        <span class="adv-none">Nessun filtro impostato.</span>
      }
    </div>
    <mat-dialog-actions>
      <button mat-stroked-button type="button" (click)="ref.close('clear')">Azzera</button>
      <span style="flex: 1;"></span>
      <button mat-button type="button" (click)="ref.close()">Annulla</button>
      <button mat-flat-button type="button" (click)="apply()">Applica</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .adv { display: flex; gap: 16px; height: 400px; max-height: 60vh; }
    .adv-nav { flex: 0 0 200px; display: flex; flex-direction: column; gap: 2px; overflow-y: auto;
      border-right: 1px solid #e5e7eb; padding-right: 8px; }
    .adv-nav-item { display: flex; align-items: center; justify-content: space-between; gap: 8px; text-align: left;
      border: 0; background: transparent; padding: 10px 12px; border-radius: 8px; cursor: pointer; font: inherit; color: #374151; }
    .adv-nav-item:hover { background: #f3f4f6; }
    .adv-nav-item.active { background: #e8eefc; color: #1d4ed8; font-weight: 600; }
    .adv-count { min-width: 20px; padding: 0 6px; border-radius: 10px; background: #1d4ed8; color: #fff;
      font-size: 0.75rem; line-height: 20px; text-align: center; }
    .adv-fields { flex: 1; overflow-y: auto; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px 16px; align-content: start; padding: 4px 2px; }
    .adv-field mat-form-field, .adv-field app-filterable-select { width: 100%; }
    .adv-wide { grid-column: 1 / -1; }
    .adv-summary { display: flex; align-items: center; gap: 6px; padding: 8px 24px 0; color: #374151; font-size: 0.85rem;
      border-top: 1px solid #e5e7eb; min-height: 28px; }
    .adv-summary mat-icon { font-size: 18px; height: 18px; width: 18px; color: #6b7280; }
    .adv-none { color: #9ca3af; }
    @media (max-width: 700px) {
      .adv { flex-direction: column; height: auto; }
      .adv-nav { flex: none; flex-direction: row; overflow-x: auto; border-right: 0; border-bottom: 1px solid #e5e7eb; }
      .adv-fields { grid-template-columns: 1fr; }
    }
  `],
})
export class AdvancedFiltersDialogComponent {
  readonly ref = inject(MatDialogRef<AdvancedFiltersDialogComponent>);
  readonly data = inject<AdvancedFiltersData>(MAT_DIALOG_DATA);
  readonly LONG_LIST = LONG_LIST;
  readonly boolOptions = BOOL_OPTIONS;
  values: Record<string, any> = {...this.data.values};

  // Sezioni nell'ordine di prima comparsa; i filtri senza gruppo in testa.
  readonly sections: Section[] = this.data.defs.reduce<Section[]>((acc, d) => {
    const name = d.group ?? MAIN_SECTION;
    let s = acc.find(x => x.name === name);
    if (!s) {
      s = {name, defs: []};
      acc.push(s);
    }
    s.defs.push(d);
    return acc;
  }, []).sort((a, b) => (a.name === MAIN_SECTION ? -1 : b.name === MAIN_SECTION ? 1 : 0));

  // Si apre sulla prima sezione con filtri attivi, altrimenti sulla prima.
  current: Section = this.sections.find(s => this.activeIn(s) > 0) ?? this.sections[0];

  opts(d: FilterDef): TOption[] {
    return this.data.options[d.key] ?? [];
  }

  activeIn(s: Section): number {
    return toChips(s.defs, this.values, this.data.options).length;
  }

  summary(): string {
    return toChips(this.data.defs, this.values, this.data.options).map(c => c.text).join(' · ');
  }

  rangeFrom(key: string): Date | null {
    return toDate((this.values[key] as unknown[] | undefined)?.[0]);
  }

  rangeTo(key: string): Date | null {
    return toDate((this.values[key] as unknown[] | undefined)?.[1]);
  }

  setRange(key: string, i: 0 | 1, v: Date | null): void {
    const cur = [...((this.values[key] as unknown[] | undefined) ?? [null, null])];
    cur[i] = v;
    this.values[key] = cur;
  }

  apply(): void {
    this.ref.close(this.values);
  }
}

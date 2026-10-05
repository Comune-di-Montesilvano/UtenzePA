import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {FilterableSelectComponent} from '../filterable-select.component';
import type {TOption} from '../../types/option.interface';
import {BOOL_OPTIONS, FilterDef, FilterValues} from './filter-def';

export interface AdvancedFiltersData {
  defs: FilterDef[];
  values: FilterValues;
  options: Record<string, TOption[]>;
}

// Opzioni oltre questa soglia: select con ricerca.
const LONG_LIST = 12;

const toDate = (v: unknown): Date | null => {
  if (v instanceof Date) return v;
  if (typeof v !== 'string' || !v) return null;
  const [y, m, d] = v.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};

// Dialog generico dei filtri avanzati: tutti i filtri della pagina, divisi per gruppo.
@Component({
  selector: 'app-advanced-filters-dialog',
  standalone: true,
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule,
    MatDatepickerModule, FilterableSelectComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h2 mat-dialog-title>Filtri avanzati</h2>
    <mat-dialog-content>
      @for (g of groups; track g.name) {
        @if (g.name) { <h3 class="adv-group">{{ g.name }}</h3> }
        <div class="adv-grid">
          @for (d of g.defs; track d.key) {
            @switch (d.type) {
              @case ('select') {
                @if (opts(d).length > LONG_LIST) {
                  <app-filterable-select [label]="d.label" [options]="opts(d)" [(ngModel)]="values[d.key]"
                                         [ngModelOptions]="{standalone: true}"></app-filterable-select>
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
          }
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions>
      <button mat-stroked-button type="button" (click)="ref.close('clear')">Azzera</button>
      <span style="flex: 1;"></span>
      <button mat-button type="button" (click)="ref.close()">Annulla</button>
      <button mat-flat-button type="button" (click)="apply()">Applica</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .adv-group { font-size: 0.9rem; font-weight: 600; margin: 16px 0 8px; color: #374151; }
    .adv-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
  `],
})
export class AdvancedFiltersDialogComponent {
  readonly ref = inject(MatDialogRef<AdvancedFiltersDialogComponent>);
  readonly data = inject<AdvancedFiltersData>(MAT_DIALOG_DATA);
  readonly LONG_LIST = LONG_LIST;
  readonly boolOptions = BOOL_OPTIONS;
  values: Record<string, any> = {...this.data.values};

  // Gruppi nell'ordine di prima comparsa; filtri senza gruppo in testa.
  readonly groups = this.data.defs.reduce<{name: string; defs: FilterDef[]}[]>((acc, d) => {
    const name = d.group ?? '';
    let g = acc.find(x => x.name === name);
    if (!g) {
      g = {name, defs: []};
      acc.push(g);
    }
    g.defs.push(d);
    return acc;
  }, []).sort((a, b) => (a.name === '' ? -1 : b.name === '' ? 1 : 0));

  opts(d: FilterDef): TOption[] {
    return this.data.options[d.key] ?? [];
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

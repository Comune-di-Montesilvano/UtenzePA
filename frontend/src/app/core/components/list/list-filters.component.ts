import {ChangeDetectionStrategy, Component, EventEmitter, inject, Input, OnChanges, OnInit, Output} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatDialog} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatChipsModule} from '@angular/material/chips';
import {Observable, Subject, debounceTime, forkJoin} from 'rxjs';
import {FilterableSelectComponent} from '../filterable-select.component';
import type {TOption} from '../../types/option.interface';
import {BOOL_OPTIONS} from './filter-def';
import type {FilterChip, FilterDef, FilterValues} from './filter-def';
import {clearKey, countAdvanced, initialValues, toChips} from './filter-values';
import {AdvancedFiltersData, AdvancedFiltersDialogComponent} from './advanced-filters-dialog.component';

// Opzioni oltre questa soglia: select con ricerca.
const LONG_LIST = 12;

// Barra filtri degli elenchi: ricerca libera, select in linea, filtri avanzati, chip dei filtri attivi.
@Component({
  selector: 'app-list-filters',
  standalone: true,
  imports: [FormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule,
    MatChipsModule, FilterableSelectComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="lf-bar">
      <mat-form-field class="lf-search" subscriptSizing="dynamic">
        <mat-icon matIconPrefix>search</mat-icon>
        <input matInput [placeholder]="placeholder" [(ngModel)]="text" (ngModelChange)="text$.next($event)">
      </mat-form-field>
      @for (d of inlineDefs; track d.key) {
        @if (d.type === 'select' && opts(d).length > LONG_LIST) {
          <app-filterable-select class="lf-inline" [label]="d.label" [options]="opts(d)"
                                 [ngModel]="values[d.key] ?? null" (ngModelChange)="set(d.key, $event)"></app-filterable-select>
        } @else {
          <mat-form-field class="lf-inline" subscriptSizing="dynamic">
            <mat-label>{{ d.label }}</mat-label>
            <mat-select [ngModel]="values[d.key] ?? null" (ngModelChange)="set(d.key, $event)" [multiple]="d.type === 'multi'">
              @if (d.type !== 'multi' && d.defaultValue === undefined) { <mat-option [value]="null">(tutti)</mat-option> }
              @for (o of opts(d); track o.value) { <mat-option [value]="o.value">{{ o.label }}</mat-option> }
            </mat-select>
          </mat-form-field>
        }
      }
      <button mat-stroked-button type="button" class="lf-adv" (click)="openAdvanced()">
        <mat-icon>filter_list</mat-icon> Filtri avanzati{{ advancedCount ? ' (' + advancedCount + ')' : '' }}
      </button>
    </div>
    @if (chips.length) {
      <div class="lf-chips">
        <mat-chip-set aria-label="Filtri attivi">
          @for (c of chips; track c.key) {
            <mat-chip (removed)="remove(c.key)">
              {{ c.text }}
              <button matChipRemove [attr.aria-label]="'Togli ' + c.text"><mat-icon>cancel</mat-icon></button>
            </mat-chip>
          }
        </mat-chip-set>
        <button mat-button type="button" (click)="reset()">Azzera</button>
      </div>
    }
  `,
  styles: [`
    :host { display: block; }
    .lf-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
    .lf-search { flex: 1 1 260px; }
    .lf-inline { flex: 0 1 220px; min-width: 160px; }
    .lf-adv { height: 56px; }
    .lf-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin-top: 0.5rem; }
  `],
})
export class ListFiltersComponent implements OnInit, OnChanges {
  @Input({required: true}) defs: FilterDef[] = [];
  @Input() values: FilterValues = {};
  @Input() placeholder = 'Cerca...';
  @Output() valuesChange = new EventEmitter<FilterValues>();
  @Output() quickSearch = new EventEmitter<string>();

  private dialog = inject(MatDialog);
  readonly text$ = new Subject<string>();
  readonly LONG_LIST = LONG_LIST;
  text = '';
  options: Record<string, TOption[]> = {};
  chips: FilterChip[] = [];
  advancedCount = 0;
  inlineDefs: FilterDef[] = [];

  ngOnInit(): void {
    this.text$.pipe(debounceTime(200)).subscribe(t => this.quickSearch.emit(t));
    // Opzioni: statiche subito, caricate una volta; i chip si ricalcolano all'arrivo.
    for (const d of this.defs) {
      if (d.type === 'bool') this.options[d.key] = BOOL_OPTIONS;
      else if (Array.isArray(d.options)) this.options[d.key] = d.options;
    }
    const loaders = this.defs.filter(d => typeof d.options === 'function');
    if (loaders.length) {
      const calls: Record<string, Observable<TOption[]>> = {};
      for (const d of loaders) calls[d.key] = (d.options as () => Observable<TOption[]>)();
      forkJoin(calls).subscribe({
        next: res => {
          this.options = {...this.options, ...res};
          this.refresh();
        },
        error: err => console.error('Errore nel caricamento delle opzioni dei filtri:', err),
      });
    }
    this.refresh();
  }

  ngOnChanges(): void {
    this.inlineDefs = this.defs.filter(d => d.inline);
    this.refresh();
  }

  opts(d: FilterDef): TOption[] {
    return this.options[d.key] ?? [];
  }

  set(key: string, v: unknown): void {
    this.emit({...this.values, [key]: v});
  }

  remove(key: string): void {
    this.emit(clearKey(this.defs, this.values, key));
  }

  reset(): void {
    this.emit(initialValues(this.defs));
  }

  openAdvanced(): void {
    this.dialog.open<AdvancedFiltersDialogComponent, AdvancedFiltersData, FilterValues | 'clear'>(
      AdvancedFiltersDialogComponent,
      {width: '900px', maxWidth: '95vw', data: {defs: this.defs, values: this.values, options: this.options}},
    ).afterClosed().subscribe(r => {
      if (r === 'clear') this.reset();
      else if (r) this.emit(r);
    });
  }

  private emit(v: FilterValues): void {
    this.values = v;
    this.refresh();
    this.valuesChange.emit(v);
  }

  private refresh(): void {
    this.chips = toChips(this.defs, this.values, this.options);
    this.advancedCount = countAdvanced(this.defs, this.values);
  }
}

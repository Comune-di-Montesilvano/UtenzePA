import {Component, forwardRef, Input, ChangeDetectionStrategy} from '@angular/core';
import {ControlValueAccessor, FormControl, NG_VALUE_ACCESSOR, ReactiveFormsModule} from '@angular/forms';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatSelectModule} from '@angular/material/select';
import {MatInputModule} from '@angular/material/input';
import {MatIconModule} from '@angular/material/icon';
import {TOption} from '../types/option.interface';

/**
 * Multiselect con filtro testuale: mat-select multiple con un campo di
 * ricerca incollato in cima al pannello (pattern comune, non ufficialmente
 * documentato da Material ma funzionante — mat-select renderizza qualunque
 * contenuto proiettato nell'overlay, non solo mat-option). Implementa
 * ControlValueAccessor come FilterableSelectComponent, ma il valore esposto
 * è sempre un array di TOption['value'] (mai un singolo valore).
 *
 * Le opzioni sono sempre ordinate per label — indipendentemente dall'ordine
 * con cui il chiamante le passa.
 */
@Component({
  selector: 'app-multi-select',
  standalone: true,
  imports: [ReactiveFormsModule, MatFormFieldModule, MatSelectModule, MatInputModule, MatIconModule],
  template: `
    <mat-form-field style="width: 100%;">
      <mat-label>{{ label }}</mat-label>
      <mat-select [formControl]="selectControl" multiple [placeholder]="placeholder" (openedChange)="onOpenedChange($event)">
        <div class="multi-select-search" (click)="$event.stopPropagation()">
          <input matInput type="text" placeholder="Cerca..." [formControl]="filterControl" (keydown)="$event.stopPropagation()">
        </div>
        @for (opt of filteredOptions; track opt.value) {
          <mat-option [value]="opt.value">
            @if (opt.icon && isFaIcon(opt.icon)) {
              <i [class]="opt.icon" style="width: 18px; display: inline-block; text-align: center; margin-right: 4px;"></i>
            } @else if (opt.icon) {
              <mat-icon style="font-size: 18px; height: 18px; width: 18px; vertical-align: middle; margin-right: 4px;">{{ opt.icon }}</mat-icon>
            }
            {{ opt.label }}
            @if (opt.count != null) {
              <span style="color: #757575; font-size: 0.85em;"> ({{ opt.count }})</span>
            }
          </mat-option>
        }
      </mat-select>
    </mat-form-field>
  `,
  styles: [`
    .multi-select-search {
      padding: 8px;
      position: sticky;
      top: 0;
      background: white;
      z-index: 1;
    }
    .multi-select-search input {
      width: 100%;
      box-sizing: border-box;
      padding: 4px 8px;
      border: 1px solid #ccc;
      border-radius: 4px;
      font: inherit;
    }
  `],
  changeDetection: ChangeDetectionStrategy.Eager,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => MultiSelectComponent),
      multi: true,
    },
  ],
})
export class MultiSelectComponent implements ControlValueAccessor {
  @Input() label = '';
  @Input() placeholder = '';

  @Input()
  set options(value: TOption[]) {
    this._options = [...(value ?? [])].sort((a, b) => a.label.localeCompare(b.label, 'it'));
    this.applyFilter(this.filterControl.value);
  }

  get options(): TOption[] {
    return this._options;
  }

  private _options: TOption[] = [];

  filteredOptions: TOption[] = [];
  filterControl = new FormControl('', {nonNullable: true});
  selectControl = new FormControl<TOption['value'][]>([], {nonNullable: true});

  private onChangeFn: (value: TOption['value'][]) => void = () => {};
  private onTouchedFn: () => void = () => {};

  constructor() {
    this.filterControl.valueChanges.subscribe(term => this.applyFilter(term));
    this.selectControl.valueChanges.subscribe(v => this.onChangeFn(v));
  }

  private applyFilter(term: string): void {
    const t = (term ?? '').toLowerCase();
    this.filteredOptions = this._options.filter(o => o.label.toLowerCase().includes(t));
  }

  // Reset del filtro alla chiusura del pannello — evita che, riaprendolo,
  // resti un filtro dell'apertura precedente che nasconde opzioni già
  // selezionate ma non più visibili in lista.
  onOpenedChange(opened: boolean): void {
    if (!opened) {
      this.onTouchedFn();
      this.filterControl.setValue('');
    }
  }

  writeValue(value: TOption['value'][] | null): void {
    this.selectControl.setValue(value ?? [], {emitEvent: false});
  }

  registerOnChange(fn: (value: TOption['value'][]) => void): void {
    this.onChangeFn = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouchedFn = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    isDisabled ? this.selectControl.disable() : this.selectControl.enable();
  }

  // Alcune icone in TOption sono classi Font Awesome (es. HardTypeIcon, "fa
  // fa-tint" — usate storicamente per acqua/luce/gas/internet), altre sono
  // ligature Material Icons (es. AssetAggregator.icon, "school"): le prime
  // vanno in un <i class>, le seconde in <mat-icon>. Nessun nuovo campo su
  // TOption, si distingue dal contenuto della stringa.
  isFaIcon(icon: string): boolean {
    return icon.startsWith('fa');
  }
}

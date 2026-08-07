import {Component, forwardRef, Input} from '@angular/core';
import {CommonModule} from '@angular/common';
import {ControlValueAccessor, FormControl, NG_VALUE_ACCESSOR, ReactiveFormsModule} from '@angular/forms';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatAutocompleteModule, MatAutocompleteSelectedEvent} from '@angular/material/autocomplete';
import {ErrorStateMatcher} from '@angular/material/core';
import {TOption} from '../types/option.interface';

/**
 * Select con filtro testuale basata su MatAutocomplete. Implementa
 * ControlValueAccessor: si usa in un FormGroup come qualsiasi altro
 * controllo, con `formControlName="supplier_id"` (il valore esposto e
 * ricevuto è `TOption['value']`, tipicamente l'id numerico dell'opzione
 * selezionata, non l'oggetto TOption).
 */
@Component({
  selector: 'app-filterable-select',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatAutocompleteModule],
  template: `
    <mat-form-field style="width: 100%;">
      <mat-label>{{ label }}</mat-label>
      <input matInput
             [formControl]="searchControl"
             [matAutocomplete]="auto"
             [placeholder]="placeholder"
             [errorStateMatcher]="errorMatcher"
             (blur)="markTouched()">
      <mat-autocomplete #auto="matAutocomplete" [displayWith]="displayFn" (optionSelected)="onOptionSelected($event)">
        @for (opt of filteredOptions; track opt.value) {
          <mat-option [value]="opt">{{ opt.label }}</mat-option>
        }
      </mat-autocomplete>
      @if (errorMessage) {
        <mat-error>{{ errorMessage }}</mat-error>
      }
    </mat-form-field>
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => FilterableSelectComponent),
      multi: true
    }
  ]
})
export class FilterableSelectComponent implements ControlValueAccessor {
  @Input() label = '';
  @Input() placeholder = 'Cerca...';
  @Input() errorMessage: string | null = null;

  errorMatcher: ErrorStateMatcher = {
    isErrorState: (): boolean => !!this.errorMessage,
  };

  @Input()
  set options(value: TOption[]) {
    this._options = value ?? [];
    this.filteredOptions = this._options;
    this.syncDisplayFromValue();
  }

  get options(): TOption[] {
    return this._options;
  }

  private _options: TOption[] = [];

  filteredOptions: TOption[] = [];
  searchControl = new FormControl<string | TOption>('');

  private value: TOption['value'] | null = null;
  private onChangeFn: (value: TOption['value'] | null) => void = () => {};
  private onTouchedFn: () => void = () => {};

  constructor() {
    this.searchControl.valueChanges.subscribe(v => {
      const term = typeof v === 'string' ? v.toLowerCase() : (v?.label ?? '').toLowerCase();
      this.filteredOptions = this._options.filter(o => o.label.toLowerCase().includes(term));

      // L'utente ha digitato del testo libero senza selezionare un'opzione
      // dalla lista (o ha svuotato il campo): il valore selezionato non è
      // più valido, va azzerato invece di lasciare il vecchio id "fantasma".
      if (typeof v === 'string') {
        const exact = this._options.find(o => o.label === v);
        if (exact) {
          if (this.value !== exact.value) {
            this.value = exact.value;
            this.onChangeFn(this.value);
          }
        } else if (this.value !== null) {
          this.value = null;
          this.onChangeFn(null);
        }
      }
    });
  }

  displayFn = (opt: TOption | string): string => {
    if (!opt) return '';
    return typeof opt === 'string' ? opt : opt.label;
  };

  onOptionSelected(event: MatAutocompleteSelectedEvent): void {
    const opt: TOption = event.option.value;
    this.value = opt.value;
    this.onChangeFn(this.value);
    this.markTouched();
  }

  markTouched(): void {
    this.onTouchedFn();
  }

  writeValue(value: TOption['value'] | null): void {
    this.value = value ?? null;
    this.syncDisplayFromValue();
  }

  registerOnChange(fn: (value: TOption['value'] | null) => void): void {
    this.onChangeFn = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouchedFn = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    isDisabled ? this.searchControl.disable() : this.searchControl.enable();
  }

  private syncDisplayFromValue(): void {
    const found = this._options.find(o => o.value === this.value);
    this.searchControl.setValue(found ?? '', {emitEvent: false});
  }
}

import {Component, forwardRef, Input, ChangeDetectionStrategy} from '@angular/core';

import {ControlValueAccessor, FormControl, NG_VALUE_ACCESSOR, ReactiveFormsModule} from '@angular/forms';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatAutocompleteModule, MatAutocompleteSelectedEvent} from '@angular/material/autocomplete';
import {ErrorStateMatcher} from '@angular/material/core';
import {MatIconModule} from '@angular/material/icon';
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
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatAutocompleteModule, MatIconModule],
  template: `
    <mat-form-field style="width: 100%;">
      <mat-label>{{ label }}</mat-label>
      <input matInput
             [formControl]="searchControl"
             [matAutocomplete]="auto"
             [placeholder]="placeholder"
             [errorStateMatcher]="errorMatcher"
             (keydown)="onUserInteraction()"
             (paste)="onUserInteraction()"
             (blur)="markTouched()">
      <mat-autocomplete #auto="matAutocomplete" [displayWith]="displayFn" (optionSelected)="onOptionSelected($event)">
        @for (opt of filteredOptions; track opt.value) {
          <mat-option [value]="opt" style="display: flex; align-items: center; gap: 8px;">
            @if (opt.icon) {
              <mat-icon style="font-size: 20px; height: 20px; width: 20px; vertical-align: middle;">{{ opt.icon }}</mat-icon>
            }
            <span style="flex: 1;">{{ opt.label }}</span>
            @if (opt.count != null) {
              <span style="color: #757575; font-size: 0.85em;">({{ opt.count }})</span>
            }
          </mat-option>
        }
      </mat-autocomplete>
      @if (errorMessage) {
        <mat-error>{{ errorMessage }}</mat-error>
      }
    </mat-form-field>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
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

  // Angular/Material emettono almeno una valueChanges programmatica su searchControl durante il
  // wiring iniziale del form-control (indipendente dalle nostre chiamate a setValue, verificato
  // empiricamente: si presenta anche quando syncDisplayFromValue() non tocca affatto il
  // controllo). Se la interpretassimo come "l'utente ha cancellato il campo" azzereremmo
  // silenziosamente e in modo permanente un valore iniziale valido (es. FK già impostata in un
  // dialog di modifica) prima ancora che le opzioni async siano arrivate. Per questo la logica di
  // "testo libero senza corrispondenza -> azzera" si attiva solo dopo un'interazione reale da
  // tastiera/incolla, mai per emissioni di origine framework.
  private userInteracted = false;

  constructor() {
    this.searchControl.valueChanges.subscribe(v => {
      const term = typeof v === 'string' ? v.toLowerCase() : (v?.label ?? '').toLowerCase();
      this.filteredOptions = this._options.filter(o => o.label.toLowerCase().includes(term));

      if (!this.userInteracted) return;

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

  onUserInteraction(): void {
    this.userInteracted = true;
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
    if (this.value !== null && !found) {
      // Valore selezionato ma opzione non ancora tra quelle caricate (caricamento asincrono in
      // corso): non toccare il display, si aggiornerà alla prossima invocazione quando le opzioni
      // saranno disponibili.
      return;
    }
    this.searchControl.setValue(found ?? '', {emitEvent: false});
  }
}

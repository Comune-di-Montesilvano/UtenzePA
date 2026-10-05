import {Component, EventEmitter, forwardRef, Input, Output, ChangeDetectionStrategy} from '@angular/core';

import {ControlValueAccessor, FormControl, NG_VALUE_ACCESSOR, ReactiveFormsModule} from '@angular/forms';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatAutocompleteModule, MatAutocompleteSelectedEvent} from '@angular/material/autocomplete';
import {ErrorStateMatcher} from '@angular/material/core';
import {MatIconModule} from '@angular/material/icon';
import {MatButtonModule} from '@angular/material/button';
import {MatTooltipModule} from '@angular/material/tooltip';
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
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatAutocompleteModule, MatIconModule, MatButtonModule, MatTooltipModule],
  template: `
    <div class="fs-row">
    <mat-form-field class="fs-field" [subscriptSizing]="subscriptSizing">
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
          <mat-option [value]="opt">
            <span style="display: inline-flex; flex-direction: column; line-height: 1.25; padding: 2px 0;">
              <span style="display: inline-flex; align-items: center; gap: 8px;">
                @if (opt.icon) {
                  <mat-icon style="font-size: 20px; height: 20px; width: 20px; vertical-align: middle;">{{ opt.icon }}</mat-icon>
                }
                <span>{{ opt.label }}</span>
                @if (opt.count != null) {
                  <span style="color: #757575; font-size: 0.85em;">({{ opt.count }})</span>
                }
              </span>
              @if (opt.sublabel) {
                <span style="color: #757575; font-size: 0.8em;">{{ opt.sublabel }}</span>
              }
            </span>
          </mat-option>
        }
        @if (createLabel && filteredOptions.length === 0 && searchText()) {
          <mat-option disabled><span>Nessun risultato</span></mat-option>
          <mat-option [value]="CREATE">
            <span class="fs-create"><mat-icon>add</mat-icon>Crea «{{ searchText() }}»</span>
          </mat-option>
        }
      </mat-autocomplete>
      @if (errorMessage) {
        <mat-error>{{ errorMessage }}</mat-error>
      }
    </mat-form-field>
    @if (createLabel) {
      <button mat-stroked-button type="button" class="fs-add" [disabled]="searchControl.disabled"
              [matTooltip]="createLabel" [attr.aria-label]="createLabel" (click)="create.emit('')">
        <mat-icon>add</mat-icon>
      </button>
    }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .fs-row { display: flex; align-items: flex-start; gap: 8px; }
    .fs-field { flex: 1 1 auto; min-width: 0; }
    .fs-add { min-width: 0; width: 44px; height: 56px; padding: 0; flex: 0 0 auto; }
    .fs-add .mat-icon { margin: 0; }
    .fs-create { display: inline-flex; align-items: center; gap: 8px; font-weight: 500; color: var(--mat-sys-primary, #1d4ed8); }
  `],
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
  // 'dynamic' nelle barre (filtri elenco): niente spazio riservato sotto, allineata alle altre select.
  @Input() subscriptSizing: 'fixed' | 'dynamic' = 'fixed';
  // Pulsante "+" a destra e "Crea «testo»" a ricerca vuota; null = assenti.
  @Input() createLabel: string | null = null;
  // Testo digitato ('' dal pulsante): la scheda crea l'elemento e imposta il valore.
  @Output() create = new EventEmitter<string>();
  // Sentinella dell'opzione "Crea «…»": non è mai un valore del controllo.
  readonly CREATE = {__create: true} as unknown as TOption;

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
      if (typeof v === 'string') this.typed = v.trim();
      const term = typeof v === 'string' ? v.toLowerCase() : (v?.label ?? '').toLowerCase();
      this.filteredOptions = this._options.filter(o => (o.searchText ?? o.label).toLowerCase().includes(term));

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

  // Ultimo testo digitato: alla scelta di "Crea «…»" l'autocomplete ha già
  // scritto nel campo il valore dell'opzione, il testo va tenuto a parte.
  private typed = '';

  searchText(): string {
    return this.typed;
  }

  displayFn = (opt: TOption | string): string => {
    if (!opt) return '';
    if (opt === this.CREATE) return this.searchText();
    return typeof opt === 'string' ? opt : opt.label;
  };

  onOptionSelected(event: MatAutocompleteSelectedEvent): void {
    const opt: TOption = event.option.value;
    if (opt === this.CREATE) {
      const text = this.searchText();
      // Il valore resta com'era (arriva dalla scheda di creazione): il campo
      // torna a mostrarlo, anche se la creazione viene annullata.
      this.searchControl.setValue('', {emitEvent: false});
      this.typed = '';
      this.filteredOptions = this._options;
      this.syncDisplayFromValue();
      // Dopo la scelta l'autocomplete rimette il fuoco sul campo: la scheda si
      // apre al giro successivo, senza fuoco, così alla chiusura il pannello
      // delle opzioni non si riapre sopra la scheda di partenza.
      setTimeout(() => {
        (document.activeElement as HTMLElement | null)?.blur();
        this.create.emit(text);
      });
      return;
    }
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

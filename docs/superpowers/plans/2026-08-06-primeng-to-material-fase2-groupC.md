# Fase 2 Gruppo C: migrazione `consip-agreement` + `utilizer-grant` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrare da PrimeNG ad Angular Material le 2 pagine CRUD del Gruppo C
(`consip-agreement`, `utilizer-grant`) — le prime del progetto con FK legate a
select ricercabili, datepicker singoli/range e un checkbox binario.

**Architecture:** Stesso pattern di Fase 1/Fase 2 Gruppo A (`purpose` è lo
stampo): `MatTableDataSource`/`MatSort`/`MatPaginator` per la tabella,
`MatDialog` per create/edit (`templateUrl` esterno) e filtri/conferma
(template inline). Nuovo in questo gruppo: datepicker singoli
(`MatDatepickerModule`) e un range picker (`MatDateRangePicker`, 2
`FormControl` sincronizzati manualmente col controllo array del form
principale), un `mat-checkbox` binario, e un componente condiviso
`FilterableSelectComponent` (`ControlValueAccessor` su `MatAutocomplete`) per
le select con filtro testuale (`supplier_id`, `asset_id_fk`,
`utilizer_id_fk`) — nel progetto non è installata nessuna libreria di
"searchable select" per Material, quindi si usa solo `@angular/material`
già presente.

**Tech Stack:** Angular 20.3 (invariato), Angular Material 20.2.14 (già
installato), RxJS 7.8, `class-transformer` (già in uso per le entity).

## Global Constraints

- Angular resta `^20.3.0` — non toccare in questo piano.
- `primeng`/`@primeuix/themes`/`primeicons` restano installati — le altre
  pagine non ancora migrate li usano ancora, non rimuovere pacchetti.
- Nessun cambio di comportamento visibile oltre al necessario per Material —
  preservare label, messaggi, validazioni, permessi di ruolo
  (`appHasRole`/gate Lettore) di ciascuna pagina, **tranne** le correzioni di
  bug esplicitamente elencate sotto (sono richieste, non opzionali).
- Correzioni di bug da applicare durante la migrazione (non deviazioni,
  fix espliciti):
  - `consip-agreement`: dialog di eliminazione aveva l'header/testo con il
    refuso "convezione" → "convenzione"; il campo `loadOptions` del
    fornitore nel filtro usava erroneamente `'supplier_id'` come
    `labelField` invece di `'company_name'`.
  - `utilizer-grant`: colonna Immobile usava `item.asset.asset_name` senza
    optional chaining (rischio di eccezione se la relazione non è
    caricata) → `item.asset?.asset_name`.
  - Entrambe le pagine: campo `deleted` nel form di ricerca era presente ma
    mai renderizzato in UI (dead field, valore fisso mai variato
    dall'utente) → rimosso dal `FormGroup`, nessun impatto sul
    comportamento di ricerca (il backend applica comunque il proprio
    default `deleted = false` quando il filtro è assente).
  - `utilizer-grant`: campo `user_name` nel form di ricerca era dead field
    (mai renderizzato) → non riprodotto.
- Il campo backend `safeguard` di `consip-agreement` è una colonna
  `tinyint` (vedi `backend/src/apis/consip-agreement/entity/consip-agreement.entity.ts:32`,
  `@Column({type: 'tinyint', default: 0})`) e il DTO di create/update valida
  `@IsIn([0, 1])` (numero, non booleano — vedi
  `backend/src/apis/consip-agreement/dto/create-consip-agreement.dto.ts:34-35`).
  Il form Angular usa `true`/`false`/`null` (UX richiesta dalla spec), ma la
  conversione a `1`/`0`/`null` avviene esplicitamente in
  `ConsipAgreementEditDialogComponent.save()` prima dell'invio — vedi Task 1.
  Il DTO di ricerca (`search-consip-agreement.dto.ts`) accetta invece un
  booleano reale via query string, quindi il filtro `safeguard` nel dialog
  filtri resta `true`/`false`/`null` senza conversione.
- Il campo `utilities_to_be_taken_over` di `utilizer-grant` è invece una
  colonna reale `boolean` (`@Column({type: 'boolean', default: false})`,
  `backend/src/apis/utilizer-grant/entity/utilizer-grant.entity.ts:24`) e il
  DTO usa `@IsBoolean()` — nessuna conversione necessaria, `mat-checkbox`
  binario diretto.
- I campi data delle entity (`expiration_date`, `grant_date`, `expire_date`)
  sono decorati `@Type(() => Date)` con `@Transform` `toPlainOnly` che
  converte in `.toISOString()` — la conversione avviene automaticamente in
  `AbstractService.parseCreate/parseUpdate` (`instanceToPlain`). I dialog di
  edit **non devono** convertire manualmente le date: gli item in tabella
  arrivano già come istanze `Date` reali (via `service.fromPlain` in
  `AbstractComponent.loadAll`), quindi il form li consuma direttamente.
  `DateHelper` (`core/helpers/date.helper.ts`) **non è necessario** in
  questo piano — non viene importato in nessun file nuovo.
- Verifica per task: `npx tsc --noEmit -p tsconfig.app.json` (toolchain
  locale se il container Docker non è raggiungibile dal worktree), zero
  errori nei file toccati dal task, errori nelle pagine non ancora migrate
  attesi e da ignorare.
- Comandi `npm`/`ng` dentro il container Docker quando possibile (Node ≥24,
  vedi CLAUDE.md del repo).
- Convenzione dialog fissata nella spec: `templateUrl` esterno per
  edit/create, template inline per filtri e conferma.
- Nessuna modifica alle classi base (`AbstractDataTableComponent`,
  `AbstractSearchComponent`, `AbstractComponent`, `ConfirmDialogComponent`,
  `ToastService`) — l'unica eccezione concessa da questo piano è
  `frontend/src/app/app.config.ts` (Task 0, provider datepicker) e
  l'aggiunta del nuovo file condiviso `filterable-select.component.ts`
  (Task 0, nuovo file, non una modifica a codice esistente).
- `restoreItem()`/`openDeleteDialog()` sono overridati in entrambe le pagine
  (nessuna delle due entity ha un campo `name` semplice compatibile col
  default della base class — `consip-agreement` ha `name` ma i testi dei
  messaggi differiscono dal default generico, `utilizer-grant` non ha
  `name` affatto e usa l'`id` numerico).
- Niente skeleton PrimeNG: `<mat-progress-bar mode="indeterminate">` per il
  loading, nessuna riga skeleton (stesso pattern di `purpose`).

---

## File Structure

**Nuovi file condivisi (Task 0):**
- Create: `frontend/src/app/core/components/filterable-select.component.ts`
- Modify: `frontend/src/app/app.config.ts`

**`consip-agreement` (Task 1):**
- Create: `frontend/src/app/pages/consip-agreement/consip-agreement-edit-dialog.component.ts` + `.html`
- Create: `frontend/src/app/pages/consip-agreement/consip-agreement-filter-dialog.component.ts` (template inline)
- Modify: `frontend/src/app/pages/consip-agreement/data-table-consip-agreement.component.ts` + `.html`
- Modify: `frontend/src/app/pages/consip-agreement/search-consip-agreement.component.ts` + `.html`
- Modify: `frontend/src/app/pages/consip-agreement/consip-agreement.component.ts` + `.html`

**`utilizer-grant` (Task 2):**
- Create: `frontend/src/app/pages/utilizer-grant/utilizer-grant-edit-dialog.component.ts` + `.html`
- Create: `frontend/src/app/pages/utilizer-grant/utilizer-grant-filter-dialog.component.ts` (template inline)
- Modify: `frontend/src/app/pages/utilizer-grant/data-table-utilizer-grant.component.ts` + `.html`
- Modify: `frontend/src/app/pages/utilizer-grant/search-utilizer-grant.component.ts` + `.html`
- Modify: `frontend/src/app/pages/utilizer-grant/utilizer-grant.component.ts` + `.html`

**Non toccati in questo piano:** entity/interface/service di
`consip-agreement`, `utilizer-grant`, `suppliers`, `assets`, `utilizer`
(nessuna dipendenza da PrimeNG).

---

### Task 0: Provider datepicker + `FilterableSelectComponent` condiviso

**Files:**
- Modify: `frontend/src/app/app.config.ts`
- Create: `frontend/src/app/core/components/filterable-select.component.ts`

**Interfaces:**
- Produces: provider globali `provideNativeDateAdapter()` +
  `{provide: MAT_DATE_LOCALE, useValue: 'it-IT'}` (rende disponibile
  `MatDatepickerModule`/`MatDateRangePicker` in tutta l'app senza bisogno di
  `MatNativeDateModule` — `provideNativeDateAdapter` lo sostituisce nella API
  a provider di Angular Material 20, verificato in
  `frontend/node_modules/@angular/material/core/index.d.ts:188`).
- Produces: `FilterableSelectComponent` (selector `app-filterable-select`,
  standalone, implementa `ControlValueAccessor` — si usa con
  `formControlName="..."` come un controllo reactive-forms qualsiasi).
  Input pubblici: `label: string`, `placeholder: string`,
  `errorMessage: string | null`, `options: TOption[]` (setter, ricalcola
  `filteredOptions` e risincronizza il testo visualizzato).
- Consumes: `TOption` da `frontend/src/app/core/types/option.interface.ts`
  (`{label: string, value: string|number|boolean}`, già esistente).

- [ ] **Step 1: Aggiungere i provider datepicker a `app.config.ts`**

`frontend/src/app/app.config.ts` — aggiungere l'import e il provider (il file
oggi non ha nessun provider Material per le date, verificato leggendo
l'intero file):

```typescript
import {
  ApplicationConfig,
  ErrorHandler,
  importProvidersFrom,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection
} from '@angular/core';
import {provideRouter, Router} from '@angular/router';
import {routes} from './app.routes';
import {providePrimeNG} from 'primeng/config';
import Aura from '@primeuix/themes/aura';
import {NgIdleKeepaliveModule} from '@ng-idle/keepalive';
import {provideHttpClient, withInterceptors} from '@angular/common/http';
import {provideAnimationsAsync} from '@angular/platform-browser/animations/async';
import {MatPaginatorIntl} from '@angular/material/paginator';
import {MAT_DATE_LOCALE, provideNativeDateAdapter} from '@angular/material/core';
import * as Sentry from '@sentry/angular';
import {authErrorInterceptor} from './core/interceptors/auth-error.interceptor';
import {getItalianPaginatorIntl} from './core/services/it-paginator-intl';

export const appConfig: ApplicationConfig = {
  providers: [
    providePrimeNG(
      {
        theme: {
          preset: Aura,
          options: {
            darkModeSelector: 'none'
          }
        },
        translation: {
          dayNames: ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"],
          dayNamesShort: ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"],
          dayNamesMin: ["D", "L", "M", "M", "G", "V", "S"],
          monthNames: ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"],
          monthNamesShort: ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"],
          today: 'Oggi',
          clear: 'Pulisci',
          dateFormat: 'dd/mm/yy',
          firstDayOfWeek: 1
        }
      }),
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({eventCoalescing: true}),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authErrorInterceptor])),
    provideAnimationsAsync(),
    importProvidersFrom(NgIdleKeepaliveModule.forRoot()),
    provideNativeDateAdapter(),
    {
      provide: MAT_DATE_LOCALE,
      useValue: 'it-IT',
    },
    {
      provide: ErrorHandler,
      useValue: Sentry.createErrorHandler(),
    },
    {
      provide: Sentry.TraceService,
      deps: [Router],
    },
    provideAppInitializer(() => {
      inject(Sentry.TraceService);
    }),
    {
      provide: MatPaginatorIntl,
      useFactory: getItalianPaginatorIntl,
    },
  ]
};
```

- [ ] **Step 2: Creare `FilterableSelectComponent`**

Motivazione: `supplier_id` (consip-agreement, edit + filtro), `asset_id_fk` e
`utilizer_id_fk` (utilizer-grant, edit + filtro) richiedono tutti la stessa
select "con filtro testuale" (equivalente Material di `p-select
[filter]="true"`). Sono 6 punti di utilizzo identici — un componente
condiviso evita 6 copie della stessa logica di ricerca/reset (nessuna
libreria tipo `ngx-mat-select-search` è installata nel progetto, quindi si
compone `MatAutocomplete` con un `ControlValueAccessor`).

`frontend/src/app/core/components/filterable-select.component.ts`:

```typescript
import {Component, forwardRef, Input} from '@angular/core';
import {CommonModule} from '@angular/common';
import {ControlValueAccessor, FormControl, NG_VALUE_ACCESSOR, ReactiveFormsModule} from '@angular/forms';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatAutocompleteModule, MatAutocompleteSelectedEvent} from '@angular/material/autocomplete';
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
             (blur)="markTouched()">
      <mat-autocomplete #auto="matAutocomplete" [displayWith]="displayFn" (optionSelected)="onOptionSelected($event)">
        @for (opt of filteredOptions; track opt.value) {
          <mat-option [value]="opt">{{ opt.label }}</mat-option>
        }
      </mat-autocomplete>
    </mat-form-field>
    @if (errorMessage) {
      <div class="filterable-select-error">{{ errorMessage }}</div>
    }
  `,
  styles: [`
    .filterable-select-error {
      color: #b3261e;
      font-size: 0.75rem;
      margin-top: -0.75rem;
      margin-bottom: 0.5rem;
    }
  `],
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
        if (!exact && this.value !== null) {
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
```

- [ ] **Step 3: Verificare compilazione mirata**

```bash
docker exec utenzepa-frontend-1 npx tsc --noEmit -p tsconfig.app.json
```

(o toolchain locale se il container non è raggiungibile dal worktree). Zero
errori in `app.config.ts` e `filterable-select.component.ts`. Nessun'altra
pagina referenzia ancora questi due file, quindi non ci sono nuovi errori
attesi altrove.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/app.config.ts frontend/src/app/core/components/filterable-select.component.ts
git commit -m "feat(frontend): provider datepicker Material + FilterableSelectComponent condiviso"
```

---

### Task 1: Migrare `consip-agreement`

**Files:**
- Create: `frontend/src/app/pages/consip-agreement/consip-agreement-edit-dialog.component.ts`
- Create: `frontend/src/app/pages/consip-agreement/consip-agreement-edit-dialog.component.html`
- Create: `frontend/src/app/pages/consip-agreement/consip-agreement-filter-dialog.component.ts`
- Modify: `frontend/src/app/pages/consip-agreement/data-table-consip-agreement.component.ts`
- Modify: `frontend/src/app/pages/consip-agreement/data-table-consip-agreement.component.html`
- Modify: `frontend/src/app/pages/consip-agreement/search-consip-agreement.component.ts`
- Modify: `frontend/src/app/pages/consip-agreement/search-consip-agreement.component.html`
- Modify: `frontend/src/app/pages/consip-agreement/consip-agreement.component.ts`
- Modify: `frontend/src/app/pages/consip-agreement/consip-agreement.component.html`

**Interfaces:**
- Consumes: `FilterableSelectComponent` (Task 0), `EditDialogData<T>`,
  `FilterDialogData<V>`, `ConfirmDialogComponent`, `AbstractDataTableComponent`,
  `AbstractSearchComponent`, `AbstractComponent`, `ConsipAgreement` entity
  (`supplier_id: number`, `expiration_date: Date`, `safeguard: boolean`,
  `name`, `cig_master`, `description`, `supplier?: Supplier`), `Supplier`
  (`id`, `company_name`), `SuppliersService.search(filters)`.
- Produces: `ConsipAgreementEditDialogComponent`,
  `ConsipAgreementFilterDialogComponent` + `ConsipAgreementFilterValues`
  interface, `DataTableConsipAgreementComponent` (override
  `openDeleteDialog`/`restoreItem`/`entityLabel`), classe di ricerca
  rinominata `SearchConsipAgreementComponent` (era `SearchConsipAgreement`,
  rinominata per coerenza con la convenzione `Search<Page>Component` già
  usata da `SearchPurposeComponent`/`SearchUtilizerGrantComponent`).

- [ ] **Step 1: Creare `consip-agreement-edit-dialog.component.ts`**

`frontend/src/app/pages/consip-agreement/consip-agreement-edit-dialog.component.ts`:

```typescript
import {Component, inject, OnInit} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {plainToInstance} from 'class-transformer';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {ConsipAgreement} from './entity/consip-agreement.entity';
import {AuthService} from '../../services/auth.service';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';
import {FilterableSelectComponent} from '../../core/components/filterable-select.component';
import {SuppliersService} from '../suppliers/suppliers.service';
import {TOption} from '../../core/types/option.interface';

@Component({
  selector: 'app-consip-agreement-edit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatDatepickerModule,
    HasRoleDirective,
    ReadOnlyDirective,
    FilterableSelectComponent
  ],
  templateUrl: './consip-agreement-edit-dialog.component.html'
})
export class ConsipAgreementEditDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<ConsipAgreementEditDialogComponent, ConsipAgreement | undefined>);
  private authService = inject(AuthService);
  private supplierService = inject(SuppliersService);
  protected data = inject<EditDialogData<ConsipAgreement>>(MAT_DIALOG_DATA);

  isNew = this.data.mode === 'create';
  supplierOptions: TOption[] = [];

  safeguardOptions: { label: string; value: boolean }[] = [
    {label: 'Sì', value: true},
    {label: 'No', value: false},
  ];

  form = this.fb.group({
    name: [this.data.item.name ?? '', Validators.required],
    cig_master: [this.data.item.cig_master ?? '', [Validators.required, Validators.maxLength(10)]],
    expiration_date: [this.data.item.expiration_date ?? null, Validators.required],
    safeguard: [this.normalizeSafeguard(this.data.item.safeguard)],
    description: [this.data.item.description ?? ''],
    supplier_id: [this.data.item.supplier_id ?? null, Validators.required],
  });

  constructor() {
    // ReadOnlyDirective sul <form> nel template imposta solo pointer-events:none,
    // bypassabile da tastiera/screen reader. Qui disabilitiamo esplicitamente il
    // FormGroup per il ruolo Lettore, cosi' i controlli sono anche
    // programmaticamente non modificabili e save() non puo' inviare dati
    // (gate di autorizzazione lato client per il ruolo Lettore).
    const role = this.authService.getCurrentUser()?.role;
    if (!role || role === 'Lettore') {
      this.form.disable();
    }
  }

  ngOnInit(): void {
    this.supplierService.search({deleted: false}).subscribe({
      next: (data) => {
        this.supplierOptions = data
          .map(s => ({label: s.company_name, value: s.id}))
          .sort((a, b) => a.label.localeCompare(b.label));
      },
      error: (err) => console.error('Errore nel caricamento dei fornitori:', err),
    });
  }

  // Il campo backend `safeguard` è una colonna tinyint (0/1), non booleana in
  // senso stretto (vedi backend/src/apis/consip-agreement/entity/consip-agreement.entity.ts:32).
  // `ConsipAgreement.create()` inizializza safeguard a 0 per i nuovi elementi
  // (non a null): la normalizzazione mappa esplicitamente 0/1 -> false/true,
  // preservando il comportamento del vecchio select PrimeNG (che mostrava "No"
  // selezionato di default sui nuovi elementi), e mappa solo null/undefined
  // reali a "nessuna selezione".
  private normalizeSafeguard(value: unknown): boolean | null {
    if (value === true || value === 1) return true;
    if (value === false || value === 0) return false;
    return null;
  }

  save(): void {
    if (!this.form.valid) return;
    const raw = this.form.getRawValue();
    const result = plainToInstance(ConsipAgreement, {
      id: this.data.item.id,
      ...raw,
      // Il DTO backend valida `safeguard` con @IsIn([0, 1]) (numero, non
      // booleano) — va riconvertito esplicitamente prima dell'invio, vedi
      // backend/src/apis/consip-agreement/dto/create-consip-agreement.dto.ts:34-35.
      safeguard: raw.safeguard === true ? 1 : raw.safeguard === false ? 0 : null,
    });
    this.dialogRef.close(result);
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}
```

- [ ] **Step 2: Creare `consip-agreement-edit-dialog.component.html`**

`frontend/src/app/pages/consip-agreement/consip-agreement-edit-dialog.component.html`:

```html
<h2 mat-dialog-title>
  {{ isNew ? 'Crea nuova convenzione CONSIP' : 'Modifica convenzione CONSIP: ' + data.item.name }}
</h2>

<mat-dialog-content>
  <form [formGroup]="form" [readOnly]="['Lettore']" style="display: flex; flex-wrap: wrap; gap: 1rem;">
    <mat-form-field style="flex: 1 1 45%;">
      <mat-label>Nome *</mat-label>
      <input matInput formControlName="name">
      @if (form.controls.name.invalid && form.controls.name.touched) {
        <mat-error>Obbligatorio</mat-error>
      }
    </mat-form-field>

    <mat-form-field style="flex: 1 1 45%;">
      <mat-label>CIG Master *</mat-label>
      <input matInput formControlName="cig_master" maxlength="10">
      @if (form.controls.cig_master.invalid && form.controls.cig_master.touched) {
        <mat-error>Obbligatorio</mat-error>
      }
    </mat-form-field>

    <mat-form-field style="flex: 1 1 45%;">
      <mat-label>Data scadenza *</mat-label>
      <input matInput [matDatepicker]="expirationPicker" formControlName="expiration_date">
      <mat-datepicker-toggle matSuffix [for]="expirationPicker"></mat-datepicker-toggle>
      <mat-datepicker #expirationPicker></mat-datepicker>
      @if (form.controls.expiration_date.invalid && form.controls.expiration_date.touched) {
        <mat-error>Obbligatorio</mat-error>
      }
    </mat-form-field>

    <mat-form-field style="flex: 1 1 45%;">
      <mat-label>Salvaguardia</mat-label>
      <mat-select formControlName="safeguard">
        <mat-option [value]="null">Non specificato</mat-option>
        @for (opt of safeguardOptions; track opt.value) {
          <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
        }
      </mat-select>
    </mat-form-field>

    <mat-form-field style="flex: 1 1 100%;">
      <mat-label>Descrizione</mat-label>
      <input matInput formControlName="description">
    </mat-form-field>

    <div style="flex: 1 1 100%;">
      <app-filterable-select
        label="Fornitore *"
        placeholder="Cerca fornitore..."
        [options]="supplierOptions"
        formControlName="supplier_id"
        [errorMessage]="form.controls.supplier_id.invalid && form.controls.supplier_id.touched ? 'Obbligatorio' : null">
      </app-filterable-select>
    </div>
  </form>
</mat-dialog-content>

<mat-dialog-actions align="end">
  <button mat-stroked-button (click)="cancel()">Annulla</button>
  <button mat-flat-button (click)="save()" [disabled]="!form.valid" [appHasRole]="['Admin','Operatore']">Salva</button>
</mat-dialog-actions>
```

- [ ] **Step 3: Creare `consip-agreement-filter-dialog.component.ts`**

Nota sul date-range: Angular Material non ha un controllo "array di 2 date"
nativo — `MatDateRangePicker` lavora su un `FormGroup` con 2 `FormControl`
(`start`/`end`). Il form principale (`qSearch`, gestito da
`AbstractSearchComponent`) mantiene però `expiration_date_range` come singolo
controllo con valore `[Date|null, Date|null]` (necessario perché
`AbstractSearchComponent.parseSearchForm()`, non modificabile in questo
piano, sa già serializzare un array di `Date` in un array di ISO string — è
lo stesso formato già consumato da
`backend/src/apis/consip-agreement/consip-agreement.service.ts:36-47`). Il
dialog quindi tiene un `dateRangeGroup` locale separato per il binding UI e
lo ricompone nell'array all'`apply()`.

`frontend/src/app/pages/consip-agreement/consip-agreement-filter-dialog.component.ts`:

```typescript
import {Component, inject} from '@angular/core';
import {FormBuilder, FormControl, FormGroup, ReactiveFormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {FilterDialogData} from '../../core/components/abstract-search.component';
import {FilterableSelectComponent} from '../../core/components/filterable-select.component';
import {SuppliersService} from '../suppliers/suppliers.service';
import {TOption} from '../../core/types/option.interface';

export interface ConsipAgreementFilterValues {
  name: string | null;
  supplier_id: number | null;
  description: string | null;
  cig_master: string | null;
  expiration_date_range: (Date | null)[] | null;
  safeguard: boolean | null;
}

@Component({
  selector: 'app-consip-agreement-filter-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatDatepickerModule,
    FilterableSelectComponent
  ],
  template: `
    <h2 mat-dialog-title>Filtri di ricerca</h2>
    <mat-dialog-content>
      <form [formGroup]="form" id="filter-form" (ngSubmit)="apply()" style="display: flex; flex-wrap: wrap; gap: 1rem;">
        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>Nome</mat-label>
          <input matInput formControlName="name">
        </mat-form-field>

        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>CIG Master</mat-label>
          <input matInput formControlName="cig_master">
        </mat-form-field>

        <mat-form-field style="flex: 1 1 100%;">
          <mat-label>Descrizione</mat-label>
          <input matInput formControlName="description">
        </mat-form-field>

        <mat-form-field style="flex: 1 1 100%;">
          <mat-label>Data scadenza</mat-label>
          <mat-date-range-input [formGroup]="dateRangeGroup" [rangePicker]="expirationRangePicker">
            <input matStartDate formControlName="start" placeholder="Data inizio">
            <input matEndDate formControlName="end" placeholder="Data fine">
          </mat-date-range-input>
          <mat-datepicker-toggle matSuffix [for]="expirationRangePicker"></mat-datepicker-toggle>
          <mat-date-range-picker #expirationRangePicker></mat-date-range-picker>
        </mat-form-field>

        <div style="flex: 1 1 100%;">
          <app-filterable-select
            label="Fornitore"
            placeholder="Cerca fornitore..."
            [options]="supplierOptions"
            formControlName="supplier_id">
          </app-filterable-select>
        </div>

        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>Salvaguardia</mat-label>
          <mat-select formControlName="safeguard">
            @for (opt of safeguardOptions; track opt.label) {
              <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button (click)="clear()">Pulisci Filtri</button>
      <button mat-flat-button type="submit" form="filter-form">Applica Filtri</button>
    </mat-dialog-actions>
  `
})
export class ConsipAgreementFilterDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<ConsipAgreementFilterDialogComponent, ConsipAgreementFilterValues | 'clear'>);
  private supplierService = inject(SuppliersService);
  protected data = inject<FilterDialogData<ConsipAgreementFilterValues>>(MAT_DIALOG_DATA);

  supplierOptions: TOption[] = [];

  safeguardOptions: { label: string; value: boolean | null }[] = [
    {label: 'Tutti', value: null},
    {label: 'Sì', value: true},
    {label: 'No', value: false},
  ];

  form = this.fb.group({
    name: [this.data.values.name ?? ''],
    supplier_id: [this.data.values.supplier_id ?? null],
    description: [this.data.values.description ?? ''],
    cig_master: [this.data.values.cig_master ?? ''],
    safeguard: [this.data.values.safeguard ?? null],
  });

  dateRangeGroup = new FormGroup({
    start: new FormControl<Date | null>(this.data.values.expiration_date_range?.[0] ?? null),
    end: new FormControl<Date | null>(this.data.values.expiration_date_range?.[1] ?? null),
  });

  constructor() {
    this.supplierService.search({deleted: false}).subscribe({
      next: (data) => {
        this.supplierOptions = data
          .map(s => ({label: s.company_name, value: s.id}))
          .sort((a, b) => a.label.localeCompare(b.label));
      },
      error: (err) => console.error('Errore nel caricamento dei fornitori:', err),
    });
  }

  apply(): void {
    const raw = this.form.getRawValue();
    const result: ConsipAgreementFilterValues = {
      ...raw,
      expiration_date_range: [
        this.dateRangeGroup.value.start ?? null,
        this.dateRangeGroup.value.end ?? null,
      ],
    };
    this.dialogRef.close(result);
  }

  clear(): void {
    this.dialogRef.close('clear');
  }
}
```

- [ ] **Step 4: Riscrivere `data-table-consip-agreement.component.ts`**

`frontend/src/app/pages/consip-agreement/data-table-consip-agreement.component.ts`:

```typescript
import {Component, Type} from '@angular/core';
import {DatePipe} from '@angular/common';
import {MatTableModule} from '@angular/material/table';
import {MatSortModule} from '@angular/material/sort';
import {MatPaginatorModule} from '@angular/material/paginator';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ScreenSizeService} from '../../services/screen-size.service';
import {ConsipAgreement} from './entity/consip-agreement.entity';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {ConsipAgreementEditDialogComponent} from './consip-agreement-edit-dialog.component';
import {ConfirmDialogComponent} from '../../core/components/confirm-dialog.component';
import {BooleanYesNoPipe} from '../../core/pipes/boolean-yes-no-pipe';

@Component({
  selector: 'app-data-table-consip-agreement',
  standalone: true,
  imports: [
    DatePipe,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressBarModule,
    HasRoleDirective,
    BooleanYesNoPipe
  ],
  templateUrl: './data-table-consip-agreement.component.html'
})
export class DataTableConsipAgreementComponent extends AbstractDataTableComponent<ConsipAgreement> {

  displayedColumns = ['actions', 'id', 'name', 'supplier', 'cig_master', 'expiration_date', 'safeguard'];

  constructor(screen: ScreenSizeService) {
    super(screen);
  }

  override itemInstance(): ConsipAgreement {
    return ConsipAgreement.create();
  }

  override editDialogComponent(): Type<unknown> {
    return ConsipAgreementEditDialogComponent;
  }

  protected override entityLabel(): string {
    return 'convenzione CONSIP';
  }

  override openDeleteDialog(entity: ConsipAgreement): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Elimina convenzione',
        message: `Eliminare convenzione ${entity.name}?`,
        confirmLabel: 'Elimina',
        danger: true
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onDelete.emit(entity);
    });
  }

  override restoreItem(entity: ConsipAgreement): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Ripristina convenzione',
        message: `Riattiva convenzione ${entity.name}?`,
        confirmLabel: 'Ripristina'
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onRestore.emit(entity);
    });
  }
}
```

- [ ] **Step 5: Riscrivere `data-table-consip-agreement.component.html`**

`frontend/src/app/pages/consip-agreement/data-table-consip-agreement.component.html`:

```html
<div style="display: flex; justify-content: space-between; align-items: center;">
  <h3>Elenco ({{data.length}})</h3>
  <button mat-flat-button (click)="openCreateDialog()" [appHasRole]="['Admin', 'Operatore']">
    <mat-icon>add</mat-icon>
    Aggiungi convenzione CONSIP
  </button>
</div>

@if (loading) {
  <mat-progress-bar mode="indeterminate"></mat-progress-bar>
}

<table mat-table [dataSource]="dataSource" matSort #sort="matSort" class="mat-elevation-z1">

  <ng-container matColumnDef="actions">
    <th mat-header-cell *matHeaderCellDef>Azioni</th>
    <td mat-cell *matCellDef="let item">
      @if (!item.deleted) {
        <button mat-icon-button (click)="openEditDialog(item)" [appHasRole]="['Admin', 'Operatore', 'Lettore']"
                matTooltip="Modifica" aria-label="Modifica">
          <mat-icon>edit</mat-icon>
        </button>
      }
      <button mat-icon-button
              [class.mat-action-success]="item.deleted"
              [class.mat-action-danger]="!item.deleted"
              (click)="item.deleted ? restoreItem(item) : openDeleteDialog(item)"
              [appHasRole]="['Admin', 'Operatore']"
              [matTooltip]="item.deleted ? 'Ripristina' : 'Elimina'"
              [attr.aria-label]="item.deleted ? 'Ripristina' : 'Elimina'">
        <mat-icon>{{ item.deleted ? 'restore' : 'delete' }}</mat-icon>
      </button>
    </td>
  </ng-container>

  <ng-container matColumnDef="id">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>ID</th>
    <td mat-cell *matCellDef="let item">{{ item.id }}</td>
  </ng-container>

  <ng-container matColumnDef="name">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Nome</th>
    <td mat-cell *matCellDef="let item">{{ item.name }}</td>
  </ng-container>

  <ng-container matColumnDef="supplier">
    <th mat-header-cell *matHeaderCellDef>Fornitore</th>
    <td mat-cell *matCellDef="let item">{{ item.supplier?.company_name }}</td>
  </ng-container>

  <ng-container matColumnDef="cig_master">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>CIG Master</th>
    <td mat-cell *matCellDef="let item">{{ item.cig_master }}</td>
  </ng-container>

  <ng-container matColumnDef="expiration_date">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Scadenza</th>
    <td mat-cell *matCellDef="let item">{{ item.expiration_date | date: 'dd/MM/yyyy' : 'UTC' }}</td>
  </ng-container>

  <ng-container matColumnDef="safeguard">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Salvaguardia</th>
    <td mat-cell *matCellDef="let item">{{ item.safeguard | booleanToYesNo }}</td>
  </ng-container>

  <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
  <tr mat-row *matRowDef="let row; columns: displayedColumns;" [class.row-deleted]="row.deleted"></tr>

  <tr class="mat-row" *matNoDataRow>
    <td class="mat-cell" [attr.colspan]="displayedColumns.length">Nessuna convenzione disponibile.</td>
  </tr>
</table>

<mat-paginator #paginator [pageSizeOptions]="rowsPerPageOptions" [pageSize]="10"></mat-paginator>
```

- [ ] **Step 6: Riscrivere `search-consip-agreement.component.ts`**

`frontend/src/app/pages/consip-agreement/search-consip-agreement.component.ts`:

```typescript
import {Component, Type} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {AbstractSearchComponent} from '../../core/components/abstract-search.component';
import {ConsipAgreementFilterDialogComponent} from './consip-agreement-filter-dialog.component';

@Component({
  selector: 'app-search-consip-agreement',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule
  ],
  templateUrl: './search-consip-agreement.component.html',
})
export class SearchConsipAgreementComponent extends AbstractSearchComponent {

  constructor(private fb: FormBuilder) {
    super();
    this.qSearch = this.fb.group({
      qsearch: [''],
      name: [''],
      supplier_id: [null],
      description: [''],
      cig_master: [''],
      expiration_date_range: [[null, null]],
      safeguard: [null],
    });
  }

  override filterDialogComponent(): Type<unknown> {
    return ConsipAgreementFilterDialogComponent;
  }

  override filterDialogWidth(): string {
    return '31vw';
  }
}
```

- [ ] **Step 7: Riscrivere `search-consip-agreement.component.html`**

`frontend/src/app/pages/consip-agreement/search-consip-agreement.component.html`:

```html
<div [formGroup]="qSearch" style="display: flex; align-items: center; gap: 0.5rem;">
  <mat-form-field style="flex: 1;" subscriptSizing="dynamic">
    <input matInput placeholder="Cerca..." formControlName="qsearch" (keyup.enter)="onQuickSearch()">
  </mat-form-field>

  <button mat-stroked-button (click)="openFilterDialog()" style="height: 3.5rem;">
    <mat-icon>filter_list</mat-icon>
    Filtri
  </button>
</div>
```

- [ ] **Step 8: Riscrivere `consip-agreement.component.ts`**

`frontend/src/app/pages/consip-agreement/consip-agreement.component.ts`:

```typescript
import {Component} from '@angular/core';
import {DataTableConsipAgreementComponent} from './data-table-consip-agreement.component';
import {SearchConsipAgreementComponent} from './search-consip-agreement.component';
import {ConsipAgreementService} from './consip-agreement.service';
import {AbstractComponent} from '../../core/components/abstract.component';
import {ConsipAgreement} from './entity/consip-agreement.entity';

@Component({
  selector: 'app-consip-agreement',
  standalone: true,
  imports: [
    DataTableConsipAgreementComponent,
    SearchConsipAgreementComponent
  ],
  templateUrl: './consip-agreement.component.html'
})
export class ConsipAgreementComponent extends AbstractComponent<ConsipAgreement> {

  constructor(protected override service: ConsipAgreementService) {
    super();
    this.qsearchFields = ['name', 'description', 'cig_master'];
  }

  protected override entityLabel(): string {
    return 'Convenzione';
  }

  protected override getEntityIdentifier(entity: ConsipAgreement): string {
    return `${entity.name}`;
  }

  protected override entityToPayload(entity: ConsipAgreement): Partial<ConsipAgreement> {
    return {
      supplier_id: entity.supplier_id,
      name: entity.name,
      description: entity.description,
      cig_master: entity.cig_master,
      safeguard: entity.safeguard,
      expiration_date: entity.expiration_date,
      created_by_user_id: this.userId,
      updated_by_user_id: this.userId
    };
  }
}
```

- [ ] **Step 9: Riscrivere `consip-agreement.component.html`**

`frontend/src/app/pages/consip-agreement/consip-agreement.component.html`:

```html
<div style="padding: 1rem;">
  <div>
    <h1>Convenzioni CONSIP</h1>
    <p style="color: #6A7282;">Gestisci le anagrafiche delle convenzioni CONSIP</p>
  </div>
  <div style="margin-top: 1rem;">
    <app-search-consip-agreement (search)="onSearch($event)"></app-search-consip-agreement>
  </div>
  <div style="margin-top: 1.5rem;">
    <app-data-table-consip-agreement [data]="list"
      [loading]="loading"
      (onSave)="onSave($event)"
      (onDelete)="onDelete($event)"
      (onCreate)="onCreate($event)"
      (onRestore)="onRestore($event)"
      [resetPagingTrigger]="resetPagingCount"
    ></app-data-table-consip-agreement>
  </div>
</div>
```

- [ ] **Step 10: Verificare compilazione mirata**

```bash
docker exec utenzepa-frontend-1 npx tsc --noEmit -p tsconfig.app.json
```

Zero errori nei file di `pages/consip-agreement/`. Le pagine non ancora
migrate del Gruppo D/E mostreranno ancora i propri errori (attesi, da
ignorare).

- [ ] **Step 11: Commit**

```bash
git add frontend/src/app/pages/consip-agreement
git commit -m "feat(frontend): migra consip-agreement da PrimeNG ad Angular Material"
```

---

### Task 2: Migrare `utilizer-grant`

**Files:**
- Create: `frontend/src/app/pages/utilizer-grant/utilizer-grant-edit-dialog.component.ts`
- Create: `frontend/src/app/pages/utilizer-grant/utilizer-grant-edit-dialog.component.html`
- Create: `frontend/src/app/pages/utilizer-grant/utilizer-grant-filter-dialog.component.ts`
- Modify: `frontend/src/app/pages/utilizer-grant/data-table-utilizer-grant.component.ts`
- Modify: `frontend/src/app/pages/utilizer-grant/data-table-utilizer-grant.component.html`
- Modify: `frontend/src/app/pages/utilizer-grant/search-utilizer-grant.component.ts`
- Modify: `frontend/src/app/pages/utilizer-grant/search-utilizer-grant.component.html`
- Modify: `frontend/src/app/pages/utilizer-grant/utilizer-grant.component.ts`
- Modify: `frontend/src/app/pages/utilizer-grant/utilizer-grant.component.html`

**Interfaces:**
- Consumes: `FilterableSelectComponent` (Task 0), `EditDialogData<T>`,
  `FilterDialogData<V>`, `ConfirmDialogComponent`, `AbstractDataTableComponent`,
  `AbstractSearchComponent`, `AbstractComponent`, `UtilizerGrant` entity
  (`asset_id_fk: number`, `utilizer_id_fk: number`, `concession_act?: string`,
  `usage_type?: string`, `grant_date?: Date`, `expire_date?: Date`,
  `utilities_to_be_taken_over?: boolean`, `asset?: Asset`,
  `utilizer?: Utilizer`), `Asset` (`id`, `asset_name`), `Utilizer` (`id`,
  `name`), `AssetService.search(filters)`, `UtilizerService.search(filters)`,
  `StringHelper.truncateAt(value, maxLength)` (già esistente in
  `core/helpers/string.helper.ts`).
- Produces: `UtilizerGrantEditDialogComponent`,
  `UtilizerGrantFilterDialogComponent` + `UtilizerGrantFilterValues`
  interface, `DataTableUtilizerGrantComponent` (override
  `openDeleteDialog`/`restoreItem`/`entityLabel`, bottone Modifica sempre
  visibile anche su righe eliminate — comportamento diverso da
  `consip-agreement`, preservato).

- [ ] **Step 1: Creare `utilizer-grant-edit-dialog.component.ts`**

`frontend/src/app/pages/utilizer-grant/utilizer-grant-edit-dialog.component.ts`:

```typescript
import {Component, inject, OnInit} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {plainToInstance} from 'class-transformer';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {UtilizerGrant} from './entity/utilizer-grant.entity';
import {AuthService} from '../../services/auth.service';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';
import {FilterableSelectComponent} from '../../core/components/filterable-select.component';
import {AssetService} from '../assets/asset.service';
import {UtilizerService} from '../utilizer/utilizer.service';
import {TOption} from '../../core/types/option.interface';
import {StringHelper} from '../../core/helpers/string.helper';

@Component({
  selector: 'app-utilizer-grant-edit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatDatepickerModule,
    MatCheckboxModule,
    HasRoleDirective,
    ReadOnlyDirective,
    FilterableSelectComponent
  ],
  templateUrl: './utilizer-grant-edit-dialog.component.html'
})
export class UtilizerGrantEditDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<UtilizerGrantEditDialogComponent, UtilizerGrant | undefined>);
  private authService = inject(AuthService);
  private assetService = inject(AssetService);
  private utilizerService = inject(UtilizerService);
  protected data = inject<EditDialogData<UtilizerGrant>>(MAT_DIALOG_DATA);

  isNew = this.data.mode === 'create';
  assetOptions: TOption[] = [];
  utilizerOptions: TOption[] = [];

  form = this.fb.group({
    asset_id_fk: [this.data.item.asset_id_fk ?? null, Validators.required],
    utilizer_id_fk: [this.data.item.utilizer_id_fk ?? null, Validators.required],
    usage_type: [this.data.item.usage_type ?? ''],
    grant_date: [this.data.item.grant_date ?? null],
    expire_date: [this.data.item.expire_date ?? null],
    concession_act: [this.data.item.concession_act ?? ''],
    utilities_to_be_taken_over: [this.data.item.utilities_to_be_taken_over ?? false],
  });

  constructor() {
    // ReadOnlyDirective sul <form> nel template imposta solo pointer-events:none,
    // bypassabile da tastiera/screen reader. Qui disabilitiamo esplicitamente il
    // FormGroup per il ruolo Lettore, cosi' i controlli sono anche
    // programmaticamente non modificabili e save() non puo' inviare dati
    // (gate di autorizzazione lato client per il ruolo Lettore).
    const role = this.authService.getCurrentUser()?.role;
    if (!role || role === 'Lettore') {
      this.form.disable();
    }
  }

  ngOnInit(): void {
    this.assetService.search({deleted: false}).subscribe({
      next: (data) => {
        this.assetOptions = data
          .map(a => ({label: a.asset_name, value: a.id}))
          .sort((a, b) => a.label.localeCompare(b.label));
      },
      error: (err) => console.error('Errore nel caricamento degli Asset:', err),
    });

    this.utilizerService.search({deleted: false}).subscribe({
      next: (data) => {
        this.utilizerOptions = data
          .map(u => ({label: StringHelper.truncateAt(u.name, 100), value: u.id}))
          .sort((a, b) => a.label.localeCompare(b.label));
      },
      error: (err) => console.error('Errore nel caricamento degli Utilizzatori:', err),
    });
  }

  save(): void {
    if (!this.form.valid) return;
    const result = plainToInstance(UtilizerGrant, {
      id: this.data.item.id,
      ...this.form.getRawValue()
    });
    this.dialogRef.close(result);
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}
```

- [ ] **Step 2: Creare `utilizer-grant-edit-dialog.component.html`**

`frontend/src/app/pages/utilizer-grant/utilizer-grant-edit-dialog.component.html`:

```html
<h2 mat-dialog-title>
  {{ isNew ? 'Aggiungi Concessione' : 'Modifica Concessione: ' + data.item.id }}
</h2>

<mat-dialog-content>
  <form [formGroup]="form" [readOnly]="['Lettore']" style="display: flex; flex-wrap: wrap; gap: 1rem;">
    <div style="flex: 1 1 100%;">
      <app-filterable-select
        label="Utilizzatore *"
        placeholder="Cerca utilizzatore..."
        [options]="utilizerOptions"
        formControlName="utilizer_id_fk"
        [errorMessage]="form.controls.utilizer_id_fk.invalid && form.controls.utilizer_id_fk.touched ? 'Obbligatorio' : null">
      </app-filterable-select>
    </div>

    <div style="flex: 1 1 45%;">
      <app-filterable-select
        label="Immobile Associato *"
        placeholder="Cerca immobile..."
        [options]="assetOptions"
        formControlName="asset_id_fk"
        [errorMessage]="form.controls.asset_id_fk.invalid && form.controls.asset_id_fk.touched ? 'Obbligatorio' : null">
      </app-filterable-select>
    </div>

    <mat-form-field style="flex: 1 1 45%;">
      <mat-label>Tipo Utilizzo</mat-label>
      <input matInput formControlName="usage_type" placeholder="Inserisci il tipo di utilizzo">
    </mat-form-field>

    <mat-form-field style="flex: 1 1 45%;">
      <mat-label>Data Concessione Contratto</mat-label>
      <input matInput [matDatepicker]="grantPicker" formControlName="grant_date">
      <mat-datepicker-toggle matSuffix [for]="grantPicker"></mat-datepicker-toggle>
      <mat-datepicker #grantPicker></mat-datepicker>
    </mat-form-field>

    <mat-form-field style="flex: 1 1 45%;">
      <mat-label>Data Scadenza Contratto</mat-label>
      <input matInput [matDatepicker]="expirePicker" formControlName="expire_date">
      <mat-datepicker-toggle matSuffix [for]="expirePicker"></mat-datepicker-toggle>
      <mat-datepicker #expirePicker></mat-datepicker>
    </mat-form-field>

    <mat-form-field style="flex: 1 1 100%;">
      <mat-label>Atto concessione immobile</mat-label>
      <textarea matInput formControlName="concession_act" rows="4" placeholder="Note sull'atto di concessione"></textarea>
    </mat-form-field>

    <div style="flex: 1 1 100%; display: flex; align-items: center;">
      <mat-checkbox formControlName="utilities_to_be_taken_over">Utenza da volturare?</mat-checkbox>
    </div>
  </form>
</mat-dialog-content>

<mat-dialog-actions align="end">
  <button mat-stroked-button (click)="cancel()">Annulla</button>
  <button mat-flat-button (click)="save()" [disabled]="!form.valid" [appHasRole]="['Admin','Operatore']">Salva Concessione</button>
</mat-dialog-actions>
```

- [ ] **Step 3: Creare `utilizer-grant-filter-dialog.component.ts`**

`frontend/src/app/pages/utilizer-grant/utilizer-grant-filter-dialog.component.ts`:

```typescript
import {Component, inject} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {FilterDialogData} from '../../core/components/abstract-search.component';
import {FilterableSelectComponent} from '../../core/components/filterable-select.component';
import {AssetService} from '../assets/asset.service';
import {UtilizerService} from '../utilizer/utilizer.service';
import {TOption} from '../../core/types/option.interface';
import {StringHelper} from '../../core/helpers/string.helper';

export interface UtilizerGrantFilterValues {
  concession_act: string | null;
  usage_type: string | null;
  utilities_to_be_taken_over: boolean | null;
  grant_date: Date | null;
  expire_date: Date | null;
  asset_id_fk: number | null;
  utilizer_id_fk: number | null;
}

@Component({
  selector: 'app-utilizer-grant-filter-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatDatepickerModule,
    FilterableSelectComponent
  ],
  template: `
    <h2 mat-dialog-title>Filtri Avanzati Concessioni</h2>
    <mat-dialog-content>
      <form [formGroup]="form" id="filter-form" (ngSubmit)="apply()" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <app-filterable-select
          label="Immobile"
          placeholder="Cerca immobile..."
          [options]="assetOptions"
          formControlName="asset_id_fk">
        </app-filterable-select>

        <app-filterable-select
          label="Utilizzatore"
          placeholder="Cerca utilizzatore..."
          [options]="utilizerOptions"
          formControlName="utilizer_id_fk">
        </app-filterable-select>

        <mat-form-field>
          <mat-label>Tipo Utilizzo</mat-label>
          <input matInput formControlName="usage_type">
        </mat-form-field>

        <mat-form-field>
          <mat-label>Atto di Concessione</mat-label>
          <input matInput formControlName="concession_act">
        </mat-form-field>

        <mat-form-field>
          <mat-label>Data Concessione</mat-label>
          <input matInput [matDatepicker]="grantPicker" formControlName="grant_date">
          <mat-datepicker-toggle matSuffix [for]="grantPicker"></mat-datepicker-toggle>
          <mat-datepicker #grantPicker></mat-datepicker>
        </mat-form-field>

        <mat-form-field>
          <mat-label>Data Scadenza</mat-label>
          <input matInput [matDatepicker]="expirePicker" formControlName="expire_date">
          <mat-datepicker-toggle matSuffix [for]="expirePicker"></mat-datepicker-toggle>
          <mat-datepicker #expirePicker></mat-datepicker>
        </mat-form-field>

        <mat-form-field>
          <mat-label>Utenze da volturare</mat-label>
          <mat-select formControlName="utilities_to_be_taken_over">
            @for (opt of utilitiesOptions; track opt.label) {
              <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button (click)="clear()">Pulisci Filtri</button>
      <button mat-flat-button type="submit" form="filter-form">Applica Filtri</button>
    </mat-dialog-actions>
  `
})
export class UtilizerGrantFilterDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<UtilizerGrantFilterDialogComponent, UtilizerGrantFilterValues | 'clear'>);
  private assetService = inject(AssetService);
  private utilizerService = inject(UtilizerService);
  protected data = inject<FilterDialogData<UtilizerGrantFilterValues>>(MAT_DIALOG_DATA);

  assetOptions: TOption[] = [];
  utilizerOptions: TOption[] = [];

  utilitiesOptions: { label: string; value: boolean | null }[] = [
    {label: 'Tutti', value: null},
    {label: 'Sì', value: true},
    {label: 'No', value: false},
  ];

  form = this.fb.group({
    concession_act: [this.data.values.concession_act ?? ''],
    usage_type: [this.data.values.usage_type ?? ''],
    utilities_to_be_taken_over: [this.data.values.utilities_to_be_taken_over ?? null],
    grant_date: [this.data.values.grant_date ?? null],
    expire_date: [this.data.values.expire_date ?? null],
    asset_id_fk: [this.data.values.asset_id_fk ?? null],
    utilizer_id_fk: [this.data.values.utilizer_id_fk ?? null],
  });

  constructor() {
    this.assetService.search({deleted: false}).subscribe({
      next: (data) => {
        this.assetOptions = data
          .map(a => ({label: a.asset_name, value: a.id}))
          .sort((a, b) => a.label.localeCompare(b.label));
      },
      error: (err) => console.error('Errore nel caricamento degli Asset:', err),
    });
    this.utilizerService.search({deleted: false}).subscribe({
      next: (data) => {
        this.utilizerOptions = data
          .map(u => ({label: StringHelper.truncateAt(u.name, 50), value: u.id}))
          .sort((a, b) => a.label.localeCompare(b.label));
      },
      error: (err) => console.error('Errore nel caricamento degli Utilizzatori:', err),
    });
  }

  apply(): void {
    this.dialogRef.close(this.form.getRawValue() as UtilizerGrantFilterValues);
  }

  clear(): void {
    this.dialogRef.close('clear');
  }
}
```

- [ ] **Step 4: Riscrivere `data-table-utilizer-grant.component.ts`**

`frontend/src/app/pages/utilizer-grant/data-table-utilizer-grant.component.ts`:

```typescript
import {Component, Type} from '@angular/core';
import {DatePipe} from '@angular/common';
import {MatTableModule} from '@angular/material/table';
import {MatSortModule} from '@angular/material/sort';
import {MatPaginatorModule} from '@angular/material/paginator';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ScreenSizeService} from '../../services/screen-size.service';
import {UtilizerGrant} from './entity/utilizer-grant.entity';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {UtilizerGrantEditDialogComponent} from './utilizer-grant-edit-dialog.component';
import {ConfirmDialogComponent} from '../../core/components/confirm-dialog.component';
import {StringHelper} from '../../core/helpers/string.helper';

@Component({
  selector: 'app-data-table-utilizer-grant',
  standalone: true,
  imports: [
    DatePipe,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressBarModule,
    HasRoleDirective
  ],
  templateUrl: './data-table-utilizer-grant.component.html'
})
export class DataTableUtilizerGrantComponent extends AbstractDataTableComponent<UtilizerGrant> {

  displayedColumns = [
    'actions', 'id', 'asset', 'utilizer', 'usage_type',
    'grant_date', 'expire_date', 'concession_act', 'utilities_to_be_taken_over'
  ];

  readonly maxDescLength = 50;

  constructor(screen: ScreenSizeService) {
    super(screen);
  }

  override itemInstance(): UtilizerGrant {
    return UtilizerGrant.create();
  }

  override editDialogComponent(): Type<unknown> {
    return UtilizerGrantEditDialogComponent;
  }

  protected override entityLabel(): string {
    return 'concessione';
  }

  truncate(value: string | null | undefined): string {
    return StringHelper.truncateAt(value, this.maxDescLength);
  }

  override openDeleteDialog(entity: UtilizerGrant): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Elimina Concessione',
        message: `Sei sicuro di voler eliminare la Concessione ${entity.id}?`,
        confirmLabel: 'Elimina',
        danger: true
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onDelete.emit(entity);
    });
  }

  override restoreItem(entity: UtilizerGrant): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Ripristina Concessione',
        message: `Riattiva Concessione ${entity.id}?`,
        confirmLabel: 'Ripristina'
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onRestore.emit(entity);
    });
  }
}
```

- [ ] **Step 5: Riscrivere `data-table-utilizer-grant.component.html`**

Nota: a differenza di `consip-agreement`, il bottone Modifica resta
**sempre visibile** (anche sulle righe eliminate) — comportamento originale
preservato, coerente con `utility-types`/`utilizer` dei gruppi precedenti.

`frontend/src/app/pages/utilizer-grant/data-table-utilizer-grant.component.html`:

```html
<div style="display: flex; justify-content: space-between; align-items: center;">
  <h3>Elenco ({{data.length}})</h3>
  <button mat-flat-button (click)="openCreateDialog()" [appHasRole]="['Admin', 'Operatore']">
    <mat-icon>add</mat-icon>
    Aggiungi Concessione
  </button>
</div>

@if (loading) {
  <mat-progress-bar mode="indeterminate"></mat-progress-bar>
}

<table mat-table [dataSource]="dataSource" matSort #sort="matSort" class="mat-elevation-z1">

  <ng-container matColumnDef="actions">
    <th mat-header-cell *matHeaderCellDef>Azioni</th>
    <td mat-cell *matCellDef="let item">
      <button mat-icon-button (click)="openEditDialog(item)" [appHasRole]="['Admin', 'Operatore', 'Lettore']"
              matTooltip="Modifica" aria-label="Modifica">
        <mat-icon>edit</mat-icon>
      </button>
      <button mat-icon-button
              [class.mat-action-success]="item.deleted"
              [class.mat-action-danger]="!item.deleted"
              (click)="item.deleted ? restoreItem(item) : openDeleteDialog(item)"
              [appHasRole]="['Admin', 'Operatore']"
              [matTooltip]="item.deleted ? 'Ripristina' : 'Elimina'"
              [attr.aria-label]="item.deleted ? 'Ripristina' : 'Elimina'">
        <mat-icon>{{ item.deleted ? 'restore' : 'delete' }}</mat-icon>
      </button>
    </td>
  </ng-container>

  <ng-container matColumnDef="id">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>ID</th>
    <td mat-cell *matCellDef="let item">{{ item.id }}</td>
  </ng-container>

  <ng-container matColumnDef="asset">
    <th mat-header-cell *matHeaderCellDef>Immobile</th>
    <td mat-cell *matCellDef="let item">{{ item.asset?.asset_name }}</td>
  </ng-container>

  <ng-container matColumnDef="utilizer">
    <th mat-header-cell *matHeaderCellDef>Utilizzatore</th>
    <td mat-cell *matCellDef="let item">
      <span [matTooltip]="item.utilizer?.name ?? ''">{{ truncate(item.utilizer?.name) }}</span>
    </td>
  </ng-container>

  <ng-container matColumnDef="usage_type">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Tipo Utilizzo</th>
    <td mat-cell *matCellDef="let item">{{ item.usage_type || 'N/D' }}</td>
  </ng-container>

  <ng-container matColumnDef="grant_date">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Data Concessione</th>
    <td mat-cell *matCellDef="let item">{{ item.grant_date | date: 'dd/MM/yyyy' }}</td>
  </ng-container>

  <ng-container matColumnDef="expire_date">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Data Scadenza</th>
    <td mat-cell *matCellDef="let item">{{ item.expire_date | date: 'dd/MM/yyyy' }}</td>
  </ng-container>

  <ng-container matColumnDef="concession_act">
    <th mat-header-cell *matHeaderCellDef>Atto di Concessione</th>
    <td mat-cell *matCellDef="let item">
      @if (item.concession_act) {
        <span [matTooltip]="item.concession_act">{{ truncate(item.concession_act) }}</span>
      }
    </td>
  </ng-container>

  <ng-container matColumnDef="utilities_to_be_taken_over">
    <th mat-header-cell *matHeaderCellDef>Utenze da volturare</th>
    <td mat-cell *matCellDef="let item">
      @if (item.utilities_to_be_taken_over === true) {
        <mat-icon class="mat-action-success">check_circle</mat-icon>
      } @else if (item.utilities_to_be_taken_over === false) {
        <mat-icon class="mat-action-danger">cancel</mat-icon>
      } @else {
        <span>N/D</span>
      }
    </td>
  </ng-container>

  <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
  <tr mat-row *matRowDef="let row; columns: displayedColumns;" [class.row-deleted]="row.deleted"></tr>

  <tr class="mat-row" *matNoDataRow>
    <td class="mat-cell" [attr.colspan]="displayedColumns.length">Nessuna assegnazione utilizzatore trovata.</td>
  </tr>
</table>

<mat-paginator #paginator [pageSizeOptions]="rowsPerPageOptions" [pageSize]="10"></mat-paginator>
```

- [ ] **Step 6: Riscrivere `search-utilizer-grant.component.ts`**

`frontend/src/app/pages/utilizer-grant/search-utilizer-grant.component.ts`:

```typescript
import {Component, Type} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {AbstractSearchComponent} from '../../core/components/abstract-search.component';
import {UtilizerGrantFilterDialogComponent} from './utilizer-grant-filter-dialog.component';

@Component({
  selector: 'app-search-utilizer-grant',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule
  ],
  templateUrl: './search-utilizer-grant.component.html',
})
export class SearchUtilizerGrantComponent extends AbstractSearchComponent {

  constructor(private fb: FormBuilder) {
    super();
    this.qSearch = this.fb.group({
      qsearch: [''],
      concession_act: [''],
      usage_type: [null],
      utilities_to_be_taken_over: [null],
      grant_date: [null],
      expire_date: [null],
      asset_id_fk: [null],
      utilizer_id_fk: [null],
    });
  }

  override filterDialogComponent(): Type<unknown> {
    return UtilizerGrantFilterDialogComponent;
  }

  override filterDialogWidth(): string {
    return '700px';
  }
}
```

- [ ] **Step 7: Riscrivere `search-utilizer-grant.component.html`**

`frontend/src/app/pages/utilizer-grant/search-utilizer-grant.component.html`:

```html
<div [formGroup]="qSearch" style="display: flex; align-items: center; gap: 0.5rem;">
  <mat-form-field style="flex: 1;" subscriptSizing="dynamic">
    <input matInput placeholder="Cerca per Nome Immobile, Nome Utilizzatore o Atto Concessione..." formControlName="qsearch" (keyup.enter)="onQuickSearch()">
  </mat-form-field>

  <button mat-stroked-button (click)="openFilterDialog()" style="height: 3.5rem;">
    <mat-icon>filter_list</mat-icon>
    Filtri
  </button>
</div>
```

- [ ] **Step 8: Riscrivere `utilizer-grant.component.ts`**

`frontend/src/app/pages/utilizer-grant/utilizer-grant.component.ts`:

```typescript
import {Component} from '@angular/core';
import {DataTableUtilizerGrantComponent} from './data-table-utilizer-grant.component';
import {SearchUtilizerGrantComponent} from './search-utilizer-grant.component';
import {UtilizerGrantService} from './utilizer-grant.service';
import {AbstractComponent} from '../../core/components/abstract.component';
import {UtilizerGrant} from './entity/utilizer-grant.entity';

@Component({
  selector: 'app-utilizer-grant',
  standalone: true,
  imports: [
    DataTableUtilizerGrantComponent,
    SearchUtilizerGrantComponent
  ],
  templateUrl: './utilizer-grant.component.html',
})
export class UtilizerGrantComponent extends AbstractComponent<UtilizerGrant> {

  constructor(protected override service: UtilizerGrantService) {
    super();
    this.qsearchFields = ['concession_act', 'usage_type'];
  }

  protected override entityLabel(): string {
    return 'Concessione';
  }

  protected override getEntityIdentifier(entity: UtilizerGrant): string {
    return entity.concession_act ?? '';
  }

  protected override entityToPayload(entity: UtilizerGrant): Partial<UtilizerGrant> {
    return {
      asset_id_fk: entity.asset_id_fk,
      utilizer_id_fk: entity.utilizer_id_fk,
      concession_act: entity.concession_act,
      usage_type: entity.usage_type,
      grant_date: entity.grant_date,
      expire_date: entity.expire_date,
      utilities_to_be_taken_over: entity.utilities_to_be_taken_over,
      created_by_user_id: this.userId,
      updated_by_user_id: this.userId,
    };
  }
}
```

- [ ] **Step 9: Riscrivere `utilizer-grant.component.html`**

`frontend/src/app/pages/utilizer-grant/utilizer-grant.component.html`:

```html
<div style="padding: 1rem;">
  <div>
    <h1>Gestione Concessioni</h1>
    <p style="color: #6A7282;">Gestisci le concessioni.</p>
  </div>
  <div style="margin-top: 1rem;">
    <app-search-utilizer-grant (search)="onSearch($event)"></app-search-utilizer-grant>
  </div>
  <div style="margin-top: 1.5rem;">
    <app-data-table-utilizer-grant [data]="list"
      [loading]="loading"
      (onSave)="onSave($event)"
      (onDelete)="onDelete($event)"
      (onCreate)="onCreate($event)"
      (onRestore)="onRestore($event)"
      [resetPagingTrigger]="resetPagingCount"
    ></app-data-table-utilizer-grant>
  </div>
</div>
```

- [ ] **Step 10: Verificare compilazione mirata**

```bash
docker exec utenzepa-frontend-1 npx tsc --noEmit -p tsconfig.app.json
```

Zero errori nei file di `pages/utilizer-grant/`. Le pagine non ancora
migrate del Gruppo D/E mostreranno ancora i propri errori (attesi, da
ignorare).

- [ ] **Step 11: Commit**

```bash
git add frontend/src/app/pages/utilizer-grant
git commit -m "feat(frontend): migra utilizer-grant da PrimeNG ad Angular Material"
```

---

### Task 3: QA manuale delle 2 pagine del Gruppo C

**Files:** nessuno (verifica manuale)

- [ ] **Step 1: Stub temporaneo per rendere l'app compilabile in isolamento**

Stesso approccio usato in Fase 1/Fase 2 Gruppo A (non committato): aggiungere
temporaneamente a `frontend/tsconfig.app.json` → `exclude` le cartelle delle
pagine ancora non migrate (verificare l'elenco aggiornato con
`git log --oneline -- frontend/src/app/pages` o controllando quali pagine
importano ancora moduli `primeng/*` — a oggi, prima di questo piano:
`budget-chapters`, `suppliers`, `system-users`, `utility-types`, `assets`,
`invoices`, `utilities`), e ridurre temporaneamente `frontend/src/app/app.routes.ts`
alle sole route `dashboard`, `login`, `setup` + tutte le pagine già migrate
(Fase 1 `purpose`, Gruppo A `asset-aggregator`/`maintenance-managers`/
`utility-aggregator`/`utilizer`) + le 2 di questo gruppo (`consip-agreement`,
`utilizer-grant`). Ripristinare entrambi i file (`git checkout --`) a fine
QA, **non committare** questi file temporanei.

- [ ] **Step 2: Avviare il frontend e fare login**

```bash
docker compose up -d
```

Login con un utente esistente (Admin) sull'ambiente dev.

- [ ] **Step 3: Checklist `consip-agreement`**

- [ ] La lista carica ed elenca gli elementi esistenti, colonna Fornitore
      mostra `company_name`, colonna Scadenza mostra `dd/MM/yyyy` (fuso UTC),
      colonna Salvaguardia mostra "Sì"/"No"
- [ ] Ricerca rapida (campo "Cerca...") filtra correttamente
- [ ] Dialog filtri si apre: campo Fornitore digitando del testo filtra le
      opzioni per `company_name` (non più per `supplier_id`, verifica del
      fix del bug elencato nei Global Constraints), selezionando
      un'opzione applica il filtro; date range picker seleziona un
      intervallo (Data inizio/Data fine) e lo applica; select Salvaguardia
      con opzioni Tutti/Sì/No
- [ ] "Pulisci Filtri" resetta E applica subito la ricerca vuota
- [ ] "Aggiungi convenzione CONSIP" apre il dialog di creazione: Nome e CIG
      Master obbligatori, Data scadenza obbligatoria (datepicker singolo),
      Fornitore obbligatorio (select con filtro), Salvaguardia opzionale
      (select 3 stati Sì/No/Non specificato) — salvataggio crea la riga e
      mostra lo snackbar di conferma "Convenzione creato" con il nome
- [ ] Modifica riga esistente apre il dialog precompilato coi valori
      corretti (incluso Fornitore e Data scadenza), salva aggiorna la riga
- [ ] Elimina riga apre `ConfirmDialogComponent` con titolo "Elimina
      convenzione" e testo "Eliminare convenzione &lt;nome&gt;?" (verificare
      che NON compaia più il refuso "convezione")
- [ ] Ripristina riga eliminata apre `ConfirmDialogComponent` con titolo
      "Ripristina convenzione"
- [ ] Bottone "Modifica" **nascosto** sulle righe eliminate
- [ ] Sort per colonna e paginazione funzionano

- [ ] **Step 4: Checklist `utilizer-grant`**

- [ ] La lista carica ed elenca gli elementi esistenti, colonna Immobile
      mostra `asset.asset_name` senza eccezioni anche su righe con relazione
      eventualmente non popolata (verifica del fix optional-chaining),
      colonna Utilizzatore troncata a 50 caratteri con tooltip al hover che
      mostra il nome completo
- [ ] Ricerca rapida filtra correttamente
- [ ] Dialog filtri (700px) si apre: select con filtro per Immobile e
      Utilizzatore, campo testo libero Tipo Utilizzo (NON un select), select
      3 stati Tutti/Sì/No per "Utenze da volturare", datepicker singoli per
      Data Concessione e Data Scadenza
- [ ] "Pulisci Filtri" resetta E applica subito la ricerca vuota
- [ ] "Aggiungi Concessione" apre il dialog di creazione: Utilizzatore e
      Immobile obbligatori (select con filtro, opzioni utilizzatore
      troncate a 100 caratteri), Tipo Utilizzo campo libero, Data
      Concessione/Data Scadenza opzionali (datepicker singoli), Atto di
      concessione (textarea), checkbox "Utenza da volturare?" — salvataggio
      crea la riga e mostra lo snackbar "Concessione creato"
- [ ] Modifica riga esistente apre il dialog precompilato coi valori
      corretti
- [ ] Bottone "Modifica" **resta visibile** anche sulle righe eliminate
      (comportamento diverso da `consip-agreement`, verificare che non sia
      stato uniformato per errore)
- [ ] Elimina riga apre `ConfirmDialogComponent` con titolo "Elimina
      Concessione" e testo che usa l'ID numerico (non un campo testuale)
- [ ] Ripristina riga eliminata apre `ConfirmDialogComponent` con titolo
      "Ripristina Concessione"
- [ ] Colonna "Utenze da volturare" mostra icona verde (check) se `true`,
      icona rossa (cancel) se `false`, "N/D" se null/undefined
- [ ] Sort per colonna e paginazione funzionano

- [ ] **Step 5: Ripristinare `tsconfig.app.json`/`app.routes.ts`**

```bash
git checkout -- frontend/tsconfig.app.json frontend/src/app/app.routes.ts
```

Verificare `git status` pulito prima di procedere oltre.

- [ ] **Step 6: Annotare eventuali problemi trovati e correggerli prima di
  considerare il Gruppo C concluso**

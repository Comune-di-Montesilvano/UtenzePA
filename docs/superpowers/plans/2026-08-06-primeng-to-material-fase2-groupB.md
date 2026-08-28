# Fase 2 Gruppo B: migrazione Material di 4 pagine CRUD (budget-chapters, suppliers, system-users, utility-types) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrare da PrimeNG ad Angular Material le 4 pagine del Gruppo B
(`budget-chapters`, `suppliers`, `system-users`, `utility-types`), applicando
lo stesso pattern già usato con successo in Fase 1 (`purpose`) e Gruppo A
(`asset-aggregator`, `maintenance-managers`, `utility-aggregator`, `utilizer`):
`MatTableDataSource`/`MatSort`/`MatPaginator` per la tabella,
`MatDialog` per create/edit/delete/restore/filtri.

**Architecture:** Nessuna modifica alle classi base (`AbstractDataTableComponent`,
`AbstractSearchComponent`, `AbstractComponent`, `ConfirmDialogComponent`,
`ToastService`) — sono già state rifattorizzate in Fase 1/Gruppo A e restano
condivise. Ogni pagina fornisce: un `<page>-edit-dialog.component.ts` +
`.html` esterno (form create/edit, `MatDialogRef`), un
`<page>-filter-dialog.component.ts` con template inline (form filtri), un
`data-table-<page>.component.ts` + `.html` che estende
`AbstractDataTableComponent<T>` e implementa `itemInstance()`/
`editDialogComponent()`/`entityLabel()`, un `search-<page>.component.ts` +
`.html` che estende `AbstractSearchComponent` e implementa
`filterDialogComponent()`, e un container `<page>.component.ts` + `.html` che
estende `AbstractComponent<T>`.

Caso speciale in questo gruppo: `utility-types` ha una relazione many-to-many
verso `Purpose` gestita nel dialog tramite due `mat-select multiple` virtuali
(`generic_purpose_ids`/`specific_purpose_ids`) che vengono fusi in un unico
array `purposes: Purpose[]` dentro `save()` del dialog stesso (non più nella
classe base, come accadeva nel vecchio pattern PrimeNG con
`enrichItem()`/`prepareFormValue()`, ormai rimossi dalla base class Material).

**Tech Stack:** Angular 20.3 (invariato), Angular Material 20.2.14 (già
installato), RxJS 7.8, `class-transformer` per (de)serializzazione entity.

## Global Constraints

- Angular resta `^20.3.0` — non toccare in questo piano.
- `primeng`/`@primeuix/themes`/`primeicons` restano installati — le altre 5
  pagine non ancora migrate (`assets`, `consip-agreement`, `invoices`,
  `utilities`, `utilizer-grant`) li usano ancora, non rimuovere pacchetti.
- **Non modificare** `frontend/src/app/core/components/abstract-data-table.component.ts`,
  `abstract-search.component.ts`, `abstract.component.ts`,
  `confirm-dialog.component.ts`, `frontend/src/app/core/services/toast.service.ts`
  — sono condivisi con le pagine già migrate (Fase 1 + Gruppo A) e con quelle
  future (Gruppi C-E).
- Ogni pagina segue **esattamente** la struttura a file di `purpose` (Fase 1):
  `<page>.component.ts/.html` (container), `data-table-<page>.component.ts/.html`
  (tabella Material), `<page>-edit-dialog.component.ts` + `.html` esterno
  (form lungo), `<page>-filter-dialog.component.ts` con template **inline**
  (filtri, sempre breve). Nomi file dei dialog basati sul nome singolare
  dell'entità (`budget-chapter-edit-dialog`, `supplier-edit-dialog`,
  `system-user-edit-dialog`, `utility-type-edit-dialog`), coerente con
  `asset-aggregator-edit-dialog` di Gruppo A.
- Gate ruolo Lettore **obbligatorio** su ogni edit-dialog (finding C1 ripetuto
  nei gruppi precedenti, da non dimenticare):
  - `[readOnly]="['Lettore']"` sul `<form>` nel template;
  - `[appHasRole]="['Admin','Operatore']"` sul bottone Salva;
  - nel `constructor()` del dialog: `const role = this.authService.getCurrentUser()?.role; if (!role || role === 'Lettore') { this.form.disable(); }`.
- `restoreItem()`/`openDeleteDialog()` vanno overridati in `DataTable*Component`
  ogni volta che il messaggio generico ereditato (basato su `entity.name`) non
  corrisponde al testo originale PrimeNG: `budget-chapters` (`chapter_code`),
  `suppliers` (`supplier_id`), `system-users` (`firstName`+`lastName`,
  **solo** delete, niente restore per questa entità), `utility-types` (ha
  `name` ma il testo/bottone originali differiscono dal messaggio generico,
  override comunque necessario per correggere "Riattiva" → "Ripristina").
- `filterDialogWidth()`: default 450px ereditato dalla base class, override
  solo su `suppliers` (9 campi filtro) → `'550px'`.
- Niente skeleton PrimeNG: loading indicato con
  `<mat-progress-bar mode="indeterminate">` sopra la tabella quando `loading`
  è `true` (pattern già in `data-table-purpose.component.html`). Vale anche
  per `system-users`, che nella versione PrimeNG **non aveva** loading —
  aggiungerlo qui è una correzione voluta, non una deviazione da segnalare.
- Rimuovere lo `<style>.row-deleted{...}</style>` locale duplicato nei
  template `data-table-*.component.html` di `budget-chapters` e `suppliers`
  (già coperto dallo stile globale `.row-deleted` in
  `frontend/src/styles.scss`, applicato da Fase 1).
- Rimuovere il binding morto `[creationResult]` dai template dei 4 container
  (l'`@Input creationResult` non esiste più su `AbstractDataTableComponent`
  da Fase 1 — finding M2 della review finale Fase 1) e rimuovere i campi
  `creationResult` residui dai container `.ts`.
- Verifica per task: `docker exec utenzepa-frontend-1 npx tsc --noEmit -p tsconfig.app.json`
  (toolchain locale — `npx tsc --noEmit -p frontend/tsconfig.app.json` dalla
  cartella `frontend/` — se il container Docker non è raggiungibile dal
  worktree, problema noto delle fasi precedenti). Zero errori attesi nei file
  toccati dal task; errori sulle 5 pagine non ancora migrate (Gruppi C-E)
  sono attesi e vanno ignorati.
- Comandi `npm`/`ng`/`tsc` dentro il container Docker quando possibile (Node
  ≥24, vedi CLAUDE.md del repo).

---

## File Structure

**Per ciascuna delle 4 pagine, stesso schema di file (nomi dialog basati sul
singolare dell'entità):**

`budget-chapters/`:
- Create: `budget-chapter-edit-dialog.component.ts` + `.html`
- Create: `budget-chapter-filter-dialog.component.ts`
- Modify: `data-table-budget-chapters.component.ts` + `.html`
- Modify: `search-budget-chapters.component.ts` + `.html`
- Modify: `budget-chapters.component.ts` + `.html`

`suppliers/`:
- Create: `supplier-edit-dialog.component.ts` + `.html`
- Create: `supplier-filter-dialog.component.ts`
- Modify: `data-table-suppliers.component.ts` + `.html`
- Modify: `search-suppliers.component.ts` + `.html`
- Modify: `suppliers.component.ts` + `.html`

`system-users/`:
- Create: `system-user-edit-dialog.component.ts` + `.html`
- Create: `system-user-filter-dialog.component.ts`
- Modify: `data-table-users.component.ts` + `.html`
- Modify: `search-users.component.ts` + `.html`
- Modify: `system-users.component.ts` + `.html`

`utility-types/`:
- Create: `utility-type-edit-dialog.component.ts` + `.html`
- Create: `utility-type-filter-dialog.component.ts`
- Modify: `data-table-utility-types.component.ts` + `.html`
- Modify: `search-utility-types.component.ts` + `.html`
- Modify: `utility-types.component.ts` + `.html`

Tutti i path sono relativi a `frontend/src/app/pages/`.

---

### Task 1: Migrare `budget-chapters`

**Files:**
- Create: `frontend/src/app/pages/budget-chapters/budget-chapter-edit-dialog.component.ts` + `.html`
- Create: `frontend/src/app/pages/budget-chapters/budget-chapter-filter-dialog.component.ts`
- Modify: `frontend/src/app/pages/budget-chapters/data-table-budget-chapters.component.ts` + `.html`
- Modify: `frontend/src/app/pages/budget-chapters/search-budget-chapters.component.ts` + `.html`
- Modify: `frontend/src/app/pages/budget-chapters/budget-chapters.component.ts` + `.html`

**Interfaces:**
- Consumes: `EditDialogData<T>`/`ConfirmDialogComponent` (Fase 1),
  `FilterDialogData<V>`/`AbstractSearchComponent.openFilterDialog()`/
  `filterDialogComponent()` (Fase 1/Gruppo A), `OnlyNumbersDirective` (già
  esistente in `core/directives/only-numbers.directive.ts`, selettore
  `[onlyNumbers]`), `SupplyType`/`SupplyTypeDescription`/`SupplyTypeOptions`
  (`./enum/supply-type.enum.ts`, invariato).
- Produces: `BudgetChapterEditDialogComponent` (usato da
  `DataTableBudgetChaptersComponent.editDialogComponent()`),
  `BudgetChapterFilterDialogComponent` (usato da
  `SearchBudgetChapters.filterDialogComponent()`).

- [ ] **Step 1: Creare il dialog di edit/create**

`frontend/src/app/pages/budget-chapters/budget-chapter-edit-dialog.component.ts`:

```typescript
import {Component, inject} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {plainToInstance} from 'class-transformer';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {BudgetChapter} from './entity/budget-chapter.entity';
import {SupplyTypeOptions} from './enum/supply-type.enum';
import {AuthService} from '../../services/auth.service';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';
import {OnlyNumbersDirective} from '../../core/directives/only-numbers.directive';

@Component({
  selector: 'app-budget-chapter-edit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    HasRoleDirective,
    ReadOnlyDirective,
    OnlyNumbersDirective
  ],
  templateUrl: './budget-chapter-edit-dialog.component.html'
})
export class BudgetChapterEditDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<BudgetChapterEditDialogComponent, BudgetChapter | undefined>);
  private authService = inject(AuthService);
  protected data = inject<EditDialogData<BudgetChapter>>(MAT_DIALOG_DATA);

  supplyTypeOptions = SupplyTypeOptions;
  isNew = this.data.mode === 'create';

  form = this.fb.group({
    chapter_code: [{value: this.data.item.chapter_code ?? '', disabled: !this.isNew}, Validators.required],
    article: [this.data.item.article ?? '', Validators.required],
    pdc: [this.data.item.pdc ?? ''],
    supply_type: [this.data.item.supply_type ?? null, Validators.required],
    description: [this.data.item.description ?? ''],
  });

  constructor() {
    // ReadOnlyDirective sul <form> imposta solo pointer-events:none, bypassabile
    // da tastiera/screen reader. Disabilitiamo esplicitamente il FormGroup per il
    // ruolo Lettore (gate lato client, finding C1 dei gruppi precedenti).
    const role = this.authService.getCurrentUser()?.role;
    if (!role || role === 'Lettore') {
      this.form.disable();
    }
  }

  save(): void {
    if (!this.form.valid) return;
    const result = plainToInstance(BudgetChapter, {
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

- [ ] **Step 2: Creare il template del dialog di edit/create**

`frontend/src/app/pages/budget-chapters/budget-chapter-edit-dialog.component.html`:

```html
<h2 mat-dialog-title>
  {{ isNew ? 'Nuovo Capitolo di Spesa' : 'Modifica Capitolo Di Spesa: ' + data.item.chapter_code }}
</h2>

<mat-dialog-content>
  <form [formGroup]="form" [readOnly]="['Lettore']" style="display: flex; flex-wrap: wrap; gap: 1rem;">
    <mat-form-field style="flex: 1 1 45%;">
      <mat-label>Codice Capitolo *</mat-label>
      <input matInput formControlName="chapter_code">
      @if (form.controls.chapter_code.invalid && form.controls.chapter_code.touched) {
        <mat-error>Obbligatorio</mat-error>
      }
    </mat-form-field>

    <mat-form-field style="flex: 1 1 45%;">
      <mat-label>Articolo *</mat-label>
      <input matInput formControlName="article" onlyNumbers>
      @if (form.controls.article.invalid && form.controls.article.touched) {
        <mat-error>Obbligatorio</mat-error>
      }
    </mat-form-field>

    <mat-form-field style="flex: 1 1 45%;">
      <mat-label>PDC</mat-label>
      <input matInput formControlName="pdc">
    </mat-form-field>

    <mat-form-field style="flex: 1 1 45%;">
      <mat-label>Tipo Fornitura *</mat-label>
      <mat-select formControlName="supply_type">
        @for (opt of supplyTypeOptions; track opt.value) {
          <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
        }
      </mat-select>
      @if (form.controls.supply_type.invalid && form.controls.supply_type.touched) {
        <mat-error>Obbligatorio</mat-error>
      }
    </mat-form-field>

    <mat-form-field style="flex: 1 1 100%;">
      <mat-label>Descrizione</mat-label>
      <textarea matInput formControlName="description" rows="3"></textarea>
    </mat-form-field>
  </form>
</mat-dialog-content>

<mat-dialog-actions align="end">
  <button mat-stroked-button (click)="cancel()">Annulla</button>
  <button mat-flat-button (click)="save()" [disabled]="!form.valid" [appHasRole]="['Admin','Operatore']">Salva</button>
</mat-dialog-actions>
```

- [ ] **Step 3: Creare il dialog filtri**

`frontend/src/app/pages/budget-chapters/budget-chapter-filter-dialog.component.ts`:

```typescript
import {Component, inject} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {FilterDialogData} from '../../core/components/abstract-search.component';
import {SupplyTypeOptions} from './enum/supply-type.enum';

export interface BudgetChapterFilterValues {
  chapter_code: string | null;
  article: string | null;
  pdc: string | null;
  description: string | null;
  supply_type: unknown;
}

@Component({
  selector: 'app-budget-chapter-filter-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Filtri di ricerca Capitoli di Spesa</h2>
    <mat-dialog-content>
      <form [formGroup]="form" id="filter-form" (ngSubmit)="apply()" style="display: flex; flex-wrap: wrap; gap: 1rem;">
        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>Codice Capitolo</mat-label>
          <input matInput formControlName="chapter_code">
        </mat-form-field>
        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>Articolo</mat-label>
          <input matInput formControlName="article">
        </mat-form-field>
        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>PDC</mat-label>
          <input matInput formControlName="pdc">
        </mat-form-field>
        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>Tipo Fornitura</mat-label>
          <mat-select formControlName="supply_type">
            @for (opt of supplyTypeOptions; track opt.value) {
              <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field style="flex: 1 1 100%;">
          <mat-label>Descrizione</mat-label>
          <input matInput formControlName="description">
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button (click)="clear()">Pulisci Filtri</button>
      <button mat-flat-button type="submit" form="filter-form">Applica Filtri</button>
    </mat-dialog-actions>
  `
})
export class BudgetChapterFilterDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<BudgetChapterFilterDialogComponent, BudgetChapterFilterValues | 'clear'>);
  protected data = inject<FilterDialogData<BudgetChapterFilterValues>>(MAT_DIALOG_DATA);

  supplyTypeOptions = [
    {label: 'Tutti', value: null},
    ...SupplyTypeOptions
  ];

  form = this.fb.group({
    chapter_code: [this.data.values.chapter_code ?? ''],
    article: [this.data.values.article ?? ''],
    pdc: [this.data.values.pdc ?? ''],
    description: [this.data.values.description ?? ''],
    supply_type: [this.data.values.supply_type ?? null],
  });

  apply(): void {
    this.dialogRef.close(this.form.getRawValue());
  }

  clear(): void {
    this.dialogRef.close('clear');
  }
}
```

- [ ] **Step 4: Riscrivere `data-table-budget-chapters.component.ts`**

```typescript
import {Component, Type} from '@angular/core';
import {MatTableModule} from '@angular/material/table';
import {MatSortModule} from '@angular/material/sort';
import {MatPaginatorModule} from '@angular/material/paginator';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ScreenSizeService} from '../../services/screen-size.service';
import {BudgetChapter} from './entity/budget-chapter.entity';
import {SupplyType, SupplyTypeDescription} from './enum/supply-type.enum';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {BudgetChapterEditDialogComponent} from './budget-chapter-edit-dialog.component';
import {ConfirmDialogComponent} from '../../core/components/confirm-dialog.component';

@Component({
  selector: 'app-data-table-budget-chapters',
  standalone: true,
  imports: [
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressBarModule,
    HasRoleDirective
  ],
  templateUrl: './data-table-budget-chapters.component.html'
})
export class DataTableBudgetChaptersComponent extends AbstractDataTableComponent<BudgetChapter> {

  displayedColumns = ['actions', 'id', 'chapter_code', 'article', 'pdc', 'description', 'supply_type'];
  supplyTypeDescription = SupplyTypeDescription;

  constructor(screen: ScreenSizeService) {
    super(screen);
  }

  override itemInstance(): BudgetChapter {
    return BudgetChapter.create();
  }

  override editDialogComponent(): Type<unknown> {
    return BudgetChapterEditDialogComponent;
  }

  protected override entityLabel(): string {
    return 'capitolo';
  }

  getSupplyTypeDescription(value: any): string {
    return this.supplyTypeDescription[value as SupplyType] || value;
  }

  override openDeleteDialog(entity: BudgetChapter): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Elimina Capitolo',
        message: `Sei sicuro di voler eliminare l'anagrafica ${entity.chapter_code}?`,
        confirmLabel: 'Elimina',
        danger: true
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onDelete.emit(entity);
    });
  }

  override restoreItem(entity: BudgetChapter): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Ripristina Capitolo',
        message: `Riattiva Capitolo ${entity.chapter_code}?`,
        confirmLabel: 'Ripristina'
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onRestore.emit(entity);
    });
  }
}
```

(rimossi: `readonly skeletonRows`/`skeletonCols` e `SkeletonModule` — sostituiti
da `mat-progress-bar`; `buildForm()`/`isFormValid()` — non esistono più
nell'`AbstractDataTableComponent` Material, la logica del form vive interamente
nel dialog)

- [ ] **Step 5: Riscrivere `data-table-budget-chapters.component.html`**

```html
<div style="display: flex; justify-content: space-between; align-items: center;">
  <h3>Elenco ({{data.length}})</h3>
  <button mat-flat-button (click)="openCreateDialog()" [appHasRole]="['Admin', 'Operatore']">
    <mat-icon>add</mat-icon>
    Aggiungi Capitolo Di Spesa
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

  <ng-container matColumnDef="chapter_code">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Cod. Capitolo</th>
    <td mat-cell *matCellDef="let item">{{ item.chapter_code }}</td>
  </ng-container>

  <ng-container matColumnDef="article">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Articolo</th>
    <td mat-cell *matCellDef="let item">{{ item.article }}</td>
  </ng-container>

  <ng-container matColumnDef="pdc">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>PDC</th>
    <td mat-cell *matCellDef="let item">{{ item.pdc }}</td>
  </ng-container>

  <ng-container matColumnDef="description">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Descrizione</th>
    <td mat-cell *matCellDef="let item">{{ item.description }}</td>
  </ng-container>

  <ng-container matColumnDef="supply_type">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Tipo Fornitura</th>
    <td mat-cell *matCellDef="let item">{{ getSupplyTypeDescription(item.supply_type) }}</td>
  </ng-container>

  <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
  <tr mat-row *matRowDef="let row; columns: displayedColumns;" [class.row-deleted]="row.deleted"></tr>

  <tr class="mat-row" *matNoDataRow>
    <td class="mat-cell" [attr.colspan]="displayedColumns.length">Nessun capitolo di spesa trovato.</td>
  </tr>
</table>

<mat-paginator #paginator [pageSizeOptions]="rowsPerPageOptions" [pageSize]="10"></mat-paginator>
```

(rimosso il blocco `<style>.row-deleted{...}.action-button{...}</style>`
locale: `.row-deleted` è già globale in `frontend/src/styles.scss`, le
icon-button Material non richiedono `.action-button`)

- [ ] **Step 6: Riscrivere `search-budget-chapters.component.ts`**

```typescript
import {Component, Type} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {AbstractSearchComponent} from '../../core/components/abstract-search.component';
import {BudgetChapterFilterDialogComponent} from './budget-chapter-filter-dialog.component';

@Component({
  selector: 'app-search-budget-chapters',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule],
  templateUrl: './search-budget-chapters.component.html',
})
export class SearchBudgetChapters extends AbstractSearchComponent {

  constructor(private fb: FormBuilder) {
    super();
    this.qSearch = this.fb.group({
      qsearch: [''],
      chapter_code: [''],
      article: [''],
      description: [''],
      pdc: [''],
      supply_type: [null],
    });
  }

  override filterDialogComponent(): Type<unknown> {
    return BudgetChapterFilterDialogComponent;
  }
}
```

(nome classe `SearchBudgetChapters` invariato — è quello importato da
`budget-chapters.component.ts`; rimosso `deleted: [null]` mai renderizzato nel
form filtri originale)

- [ ] **Step 7: Riscrivere `search-budget-chapters.component.html`**

```html
<div [formGroup]="qSearch" style="display: flex; align-items: center; gap: 0.5rem;">
  <mat-form-field style="flex: 1;" subscriptSizing="dynamic">
    <input matInput placeholder="Cerca per codice, articolo o descrizione..." formControlName="qsearch" (keyup.enter)="onQuickSearch()">
  </mat-form-field>

  <button mat-stroked-button (click)="openFilterDialog()" style="height: 3.5rem;">
    <mat-icon>filter_list</mat-icon>
    Filtri
  </button>
</div>
```

- [ ] **Step 8: Riscrivere `budget-chapters.component.ts`**

```typescript
import {Component} from '@angular/core';
import {DataTableBudgetChaptersComponent} from './data-table-budget-chapters.component';
import {SearchBudgetChapters} from './search-budget-chapters.component';
import {BudgetChaptersService} from './budget-chapters.service';
import {AbstractComponent} from '../../core/components/abstract.component';
import {BudgetChapter} from './entity/budget-chapter.entity';

@Component({
  selector: 'app-budget-chapters',
  standalone: true,
  imports: [
    DataTableBudgetChaptersComponent,
    SearchBudgetChapters
  ],
  templateUrl: './budget-chapters.component.html'
})
export class BudgetChaptersComponent extends AbstractComponent<BudgetChapter> {

  constructor(protected override service: BudgetChaptersService) {
    super();
  }

  protected override getEntityIdentifier(entity: BudgetChapter): string {
    return entity.chapter_code;
  }

  protected override entityToPayload(entity: BudgetChapter): Partial<BudgetChapter> {
    return {
      chapter_code: entity.chapter_code,
      article: entity.article,
      description: entity.description,
      pdc: entity.pdc,
      supply_type: entity.supply_type,
      created_by_user_id: this.userId,
      updated_by_user_id: this.userId
    };
  }

  protected override entityLabel(): string {
    return 'Capitolo';
  }
}
```

(rimossi `creationResult` e l'override di `onCreate` che lo valorizzava: il
toast "Capitolo creato" è ora prodotto dall'`onCreate` ereditato da
`AbstractComponent`, che compone il summary come `${this.entityLabel()} creato`
— con `entityLabel()` sovrascritto a `'Capitolo'` il testo risultante è
identico all'originale, senza bisogno di un override dedicato; rimossi import
PrimeNG `CommonModule`/`FormsModule`/`InputTextModule`/`ButtonModule`/
`TableModule`/`MessageService`/`ToastModule`/`providers: [MessageService]`,
nessuno usato nel nuovo template)

- [ ] **Step 9: Riscrivere `budget-chapters.component.html`**

```html
<div style="padding: 1rem;">
  <div>
    <h1>Capitoli di Spesa</h1>
    <p style="color: #6A7282;">Gestisci i capitoli di spesa</p>
  </div>
  <div style="margin-top: 1rem;">
    <app-search-budget-chapters (search)="onSearch($event)"></app-search-budget-chapters>
  </div>
  <div style="margin-top: 1.5rem;">
    <app-data-table-budget-chapters
      [data]="list"
      [loading]="loading"
      (onSave)="onSave($event)"
      (onDelete)="onDelete($event)"
      (onCreate)="onCreate($event)"
      (onRestore)="onRestore($event)"
      [resetPagingTrigger]="resetPagingCount"
    ></app-data-table-budget-chapters>
  </div>
</div>
```

- [ ] **Step 10: Verificare compilazione mirata**

```bash
docker exec utenzepa-frontend-1 npx tsc --noEmit -p tsconfig.app.json
```

Zero errori attesi nei file sotto `pages/budget-chapters/`.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/app/pages/budget-chapters/
git commit -m "refactor(frontend): migra pagina budget-chapters a Angular Material"
```

---

### Task 2: Migrare `suppliers`

**Files:**
- Create: `frontend/src/app/pages/suppliers/supplier-edit-dialog.component.ts` + `.html`
- Create: `frontend/src/app/pages/suppliers/supplier-filter-dialog.component.ts`
- Modify: `frontend/src/app/pages/suppliers/data-table-suppliers.component.ts` + `.html`
- Modify: `frontend/src/app/pages/suppliers/search-suppliers.component.ts` + `.html`
- Modify: `frontend/src/app/pages/suppliers/suppliers.component.ts` + `.html`

**Interfaces:**
- Consumes: `EditDialogData<T>`/`ConfirmDialogComponent`,
  `FilterDialogData<V>`/`AbstractSearchComponent`, validators custom da
  `frontend/src/app/core/validators/italian.validators.ts` (invariato):
  `italianVatNumberValidator()`, `italianTaxCodeValidator()`,
  `italianPostalCodeValidator()`, `taxCodeMatchesVatNumberValidator()`
  (validator di `FormGroup`, richiede che `tax_code` sia un controllo
  **sibling** di `vat_number` nello stesso gruppo — `italianTaxCodeValidator`
  legge `control.parent?.get('vat_number')`).
- Produces: `SupplierEditDialogComponent`, `SupplierFilterDialogComponent`.

- [ ] **Step 1: Creare il dialog di edit/create**

`frontend/src/app/pages/suppliers/supplier-edit-dialog.component.ts`:

```typescript
import {Component, inject} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {plainToInstance} from 'class-transformer';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {Supplier} from './entity/supplier.entity';
import {AuthService} from '../../services/auth.service';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';
import {
  italianPostalCodeValidator,
  italianTaxCodeValidator,
  italianVatNumberValidator,
  taxCodeMatchesVatNumberValidator
} from '../../core/validators/italian.validators';

@Component({
  selector: 'app-supplier-edit-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, HasRoleDirective, ReadOnlyDirective],
  templateUrl: './supplier-edit-dialog.component.html'
})
export class SupplierEditDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<SupplierEditDialogComponent, Supplier | undefined>);
  private authService = inject(AuthService);
  protected data = inject<EditDialogData<Supplier>>(MAT_DIALOG_DATA);

  isNew = this.data.mode === 'create';

  form = this.fb.group({
    supplier_id: [{value: this.data.item.supplier_id ?? '', disabled: !this.isNew}, Validators.required],
    company_name: [this.data.item.company_name ?? '', Validators.required],
    vat_number: [this.data.item.vat_number ?? '', [italianVatNumberValidator()]],
    tax_code: [this.data.item.tax_code ?? '', [italianTaxCodeValidator()]],
    address: [this.data.item.address ?? ''],
    city: [this.data.item.city ?? ''],
    postal_code: [this.data.item.postal_code ?? '', [italianPostalCodeValidator()]],
    email: [this.data.item.email ?? ''],
    pec: [this.data.item.pec ?? ''],
  }, {validators: taxCodeMatchesVatNumberValidator()});

  constructor() {
    const role = this.authService.getCurrentUser()?.role;
    if (!role || role === 'Lettore') {
      this.form.disable();
    }
  }

  save(): void {
    if (!this.form.valid) return;
    const result = plainToInstance(Supplier, {
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

- [ ] **Step 2: Creare il template del dialog di edit/create**

`frontend/src/app/pages/suppliers/supplier-edit-dialog.component.html`:

```html
<h2 mat-dialog-title>
  {{ isNew ? 'Crea nuovo fornitore' : 'Modifica fornitore: ' + data.item.company_name }}
</h2>

<mat-dialog-content>
  <form [formGroup]="form" [readOnly]="['Lettore']" style="display: flex; flex-wrap: wrap; gap: 1rem;">
    <mat-form-field style="flex: 1 1 45%;">
      <mat-label>ID Fornitore *</mat-label>
      <input matInput formControlName="supplier_id">
      @if (form.controls.supplier_id.invalid && form.controls.supplier_id.touched) {
        <mat-error>Obbligatorio</mat-error>
      }
    </mat-form-field>

    <mat-form-field style="flex: 1 1 45%;">
      <mat-label>Ragione Sociale *</mat-label>
      <input matInput formControlName="company_name">
      @if (form.controls.company_name.invalid && form.controls.company_name.touched) {
        <mat-error>Obbligatorio</mat-error>
      }
    </mat-form-field>

    <mat-form-field style="flex: 1 1 45%;">
      <mat-label>Partita IVA</mat-label>
      <input matInput formControlName="vat_number">
      @if (form.controls.vat_number.hasError('italianVatNumber') && form.controls.vat_number.touched) {
        <mat-error>Partita IVA non valida</mat-error>
      }
    </mat-form-field>

    <mat-form-field style="flex: 1 1 45%;">
      <mat-label>Codice Fiscale</mat-label>
      <input matInput formControlName="tax_code">
      @if (form.controls.tax_code.hasError('italianTaxCode') && form.controls.tax_code.touched) {
        <mat-error>Codice fiscale non valido</mat-error>
      }
    </mat-form-field>

    <mat-form-field style="flex: 1 1 45%;">
      <mat-label>Indirizzo</mat-label>
      <input matInput formControlName="address">
    </mat-form-field>

    <mat-form-field style="flex: 1 1 45%;">
      <mat-label>Città</mat-label>
      <input matInput formControlName="city">
    </mat-form-field>

    <mat-form-field style="flex: 1 1 45%;">
      <mat-label>CAP</mat-label>
      <input matInput formControlName="postal_code">
      @if (form.controls.postal_code.hasError('italianPostalCode') && form.controls.postal_code.touched) {
        <mat-error>CAP non valido</mat-error>
      }
    </mat-form-field>

    <mat-form-field style="flex: 1 1 45%;">
      <mat-label>Email</mat-label>
      <input matInput formControlName="email">
    </mat-form-field>

    <mat-form-field style="flex: 1 1 45%;">
      <mat-label>PEC</mat-label>
      <input matInput formControlName="pec">
    </mat-form-field>
  </form>
</mat-dialog-content>

<mat-dialog-actions align="end">
  <button mat-stroked-button (click)="cancel()">Annulla</button>
  <button mat-flat-button (click)="save()" [disabled]="!form.valid" [appHasRole]="['Admin','Operatore']">Salva</button>
</mat-dialog-actions>
```

(nessun messaggio dedicato per l'errore di gruppo `taxCodeMustMatchVatNumber`
— nel form originale non c'era un messaggio a schermo per questo caso, il
comportamento visibile era solo il bottone Salva disabilitato via
`form.invalid`; preservato identico)

- [ ] **Step 3: Creare il dialog filtri**

`frontend/src/app/pages/suppliers/supplier-filter-dialog.component.ts`:

```typescript
import {Component, inject} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {FilterDialogData} from '../../core/components/abstract-search.component';

export interface SupplierFilterValues {
  supplier_id: string | null;
  company_name: string | null;
  vat_number: string | null;
  tax_code: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  email: string | null;
  pec: string | null;
}

@Component({
  selector: 'app-supplier-filter-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Filtri di ricerca</h2>
    <mat-dialog-content>
      <form [formGroup]="form" id="filter-form" (ngSubmit)="apply()" style="display: flex; flex-wrap: wrap; gap: 1rem;">
        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>ID Fornitore</mat-label>
          <input matInput formControlName="supplier_id">
        </mat-form-field>
        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>Ragione Sociale</mat-label>
          <input matInput formControlName="company_name">
        </mat-form-field>
        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>Partita IVA</mat-label>
          <input matInput formControlName="vat_number">
        </mat-form-field>
        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>Codice Fiscale</mat-label>
          <input matInput formControlName="tax_code">
        </mat-form-field>
        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>Indirizzo</mat-label>
          <input matInput formControlName="address">
        </mat-form-field>
        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>Città</mat-label>
          <input matInput formControlName="city">
        </mat-form-field>
        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>CAP</mat-label>
          <input matInput formControlName="postal_code">
        </mat-form-field>
        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>Email</mat-label>
          <input matInput formControlName="email">
        </mat-form-field>
        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>PEC</mat-label>
          <input matInput formControlName="pec">
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button (click)="clear()">Pulisci Filtri</button>
      <button mat-flat-button type="submit" form="filter-form">Applica Filtri</button>
    </mat-dialog-actions>
  `
})
export class SupplierFilterDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<SupplierFilterDialogComponent, SupplierFilterValues | 'clear'>);
  protected data = inject<FilterDialogData<SupplierFilterValues>>(MAT_DIALOG_DATA);

  form = this.fb.group({
    supplier_id: [this.data.values.supplier_id ?? ''],
    company_name: [this.data.values.company_name ?? ''],
    vat_number: [this.data.values.vat_number ?? ''],
    tax_code: [this.data.values.tax_code ?? ''],
    address: [this.data.values.address ?? ''],
    city: [this.data.values.city ?? ''],
    postal_code: [this.data.values.postal_code ?? ''],
    email: [this.data.values.email ?? ''],
    pec: [this.data.values.pec ?? ''],
  });

  apply(): void {
    this.dialogRef.close(this.form.getRawValue());
  }

  clear(): void {
    this.dialogRef.close('clear');
  }
}
```

- [ ] **Step 4: Riscrivere `data-table-suppliers.component.ts`**

```typescript
import {Component, Type} from '@angular/core';
import {MatTableModule} from '@angular/material/table';
import {MatSortModule} from '@angular/material/sort';
import {MatPaginatorModule} from '@angular/material/paginator';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ScreenSizeService} from '../../services/screen-size.service';
import {Supplier} from './entity/supplier.entity';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {SupplierEditDialogComponent} from './supplier-edit-dialog.component';
import {ConfirmDialogComponent} from '../../core/components/confirm-dialog.component';

@Component({
  selector: 'app-data-table-suppliers',
  standalone: true,
  imports: [
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressBarModule,
    HasRoleDirective
  ],
  templateUrl: './data-table-suppliers.component.html'
})
export class DataTableSuppliersComponent extends AbstractDataTableComponent<Supplier> {

  displayedColumns = ['actions', 'id', 'supplier_id', 'company_name', 'vat_number', 'tax_code', 'address', 'city', 'postal_code', 'email', 'pec'];

  constructor(screen: ScreenSizeService) {
    super(screen);
  }

  override itemInstance(): Supplier {
    return Supplier.create();
  }

  override editDialogComponent(): Type<unknown> {
    return SupplierEditDialogComponent;
  }

  protected override entityLabel(): string {
    return 'fornitore';
  }

  override openDeleteDialog(entity: Supplier): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Elimina anagrafica',
        message: `Disattiva fornitore ${entity.supplier_id}?`,
        confirmLabel: 'Elimina',
        danger: true
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onDelete.emit(entity);
    });
  }

  override restoreItem(entity: Supplier): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Ripristina anagrafica',
        message: `Riattiva fornitore ${entity.supplier_id}?`,
        confirmLabel: 'Ripristina'
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onRestore.emit(entity);
    });
  }
}
```

(corretto un bug del dialog originale: l'header del dialog di restore era
`'Elimina anagrafica'`, identico a quello di delete — copia-incolla non
corretto in PrimeNG. Qui l'header di restore è `'Ripristina anagrafica'`,
coerente col resto del gruppo)

- [ ] **Step 5: Riscrivere `data-table-suppliers.component.html`**

```html
<div style="display: flex; justify-content: space-between; align-items: center;">
  <h3>Elenco ({{data.length}})</h3>
  <button mat-flat-button (click)="openCreateDialog()" [appHasRole]="['Admin', 'Operatore']">
    <mat-icon>add</mat-icon>
    Aggiungi Fornitore
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

  <ng-container matColumnDef="supplier_id">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Nome Fornitore</th>
    <td mat-cell *matCellDef="let item">{{ item.supplier_id }}</td>
  </ng-container>

  <ng-container matColumnDef="company_name">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Ragione Sociale</th>
    <td mat-cell *matCellDef="let item">{{ item.company_name }}</td>
  </ng-container>

  <ng-container matColumnDef="vat_number">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Partita IVA</th>
    <td mat-cell *matCellDef="let item">{{ item.vat_number }}</td>
  </ng-container>

  <ng-container matColumnDef="tax_code">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Codice Fiscale</th>
    <td mat-cell *matCellDef="let item">{{ item.tax_code }}</td>
  </ng-container>

  <ng-container matColumnDef="address">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Indirizzo Sede</th>
    <td mat-cell *matCellDef="let item">{{ item.address }}</td>
  </ng-container>

  <ng-container matColumnDef="city">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Città Sede</th>
    <td mat-cell *matCellDef="let item">{{ item.city }}</td>
  </ng-container>

  <ng-container matColumnDef="postal_code">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>CAP</th>
    <td mat-cell *matCellDef="let item">{{ item.postal_code }}</td>
  </ng-container>

  <ng-container matColumnDef="email">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Email</th>
    <td mat-cell *matCellDef="let item">{{ item.email }}</td>
  </ng-container>

  <ng-container matColumnDef="pec">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>PEC</th>
    <td mat-cell *matCellDef="let item">{{ item.pec }}</td>
  </ng-container>

  <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
  <tr mat-row *matRowDef="let row; columns: displayedColumns;" [class.row-deleted]="row.deleted"></tr>

  <tr class="mat-row" *matNoDataRow>
    <td class="mat-cell" [attr.colspan]="displayedColumns.length">Nessun fornitore trovato.</td>
  </tr>
</table>

<mat-paginator #paginator [pageSizeOptions]="rowsPerPageOptions" [pageSize]="10"></mat-paginator>
```

- [ ] **Step 6: Riscrivere `search-suppliers.component.ts`**

```typescript
import {Component, Type} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {AbstractSearchComponent} from '../../core/components/abstract-search.component';
import {SupplierFilterDialogComponent} from './supplier-filter-dialog.component';

@Component({
  selector: 'app-search-suppliers',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule],
  templateUrl: './search-suppliers.component.html',
})
export class SearchSuppliersComponent extends AbstractSearchComponent {

  constructor(private fb: FormBuilder) {
    super();
    this.qSearch = this.fb.group({
      qsearch: [''],
      supplier_id: [''],
      company_name: [''],
      vat_number: [''],
      tax_code: [''],
      address: [''],
      city: [''],
      postal_code: [''],
      email: [''],
      pec: [''],
    });
  }

  override filterDialogComponent(): Type<unknown> {
    return SupplierFilterDialogComponent;
  }

  override filterDialogWidth(): string {
    return '550px';
  }
}
```

- [ ] **Step 7: Riscrivere `search-suppliers.component.html`**

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

- [ ] **Step 8: Riscrivere `suppliers.component.ts`**

```typescript
import {Component} from '@angular/core';
import {DataTableSuppliersComponent} from './data-table-suppliers.component';
import {SearchSuppliersComponent} from './search-suppliers.component';
import {SuppliersService} from './suppliers.service';
import {AbstractComponent} from '../../core/components/abstract.component';
import {Supplier} from './entity/supplier.entity';

@Component({
  selector: 'app-suppliers',
  standalone: true,
  imports: [
    DataTableSuppliersComponent,
    SearchSuppliersComponent
  ],
  templateUrl: './suppliers.component.html'
})
export class SuppliersComponent extends AbstractComponent<Supplier> {

  constructor(protected override service: SuppliersService) {
    super();
  }

  protected override getEntityIdentifier(entity: Supplier): string {
    return entity.supplier_id;
  }

  protected override entityToPayload(entity: Supplier): Partial<Supplier> {
    return {
      supplier_id: entity.supplier_id,
      company_name: entity.company_name,
      vat_number: entity.vat_number,
      tax_code: entity.tax_code,
      address: entity.address,
      city: entity.city,
      postal_code: entity.postal_code,
      email: entity.email,
      pec: entity.pec,
      created_by_user_id: this.userId,
      updated_by_user_id: this.userId
    };
  }

  override onCreate(entity: Supplier) {
    const payload = this.entityToPayload(entity);
    this.service.create(payload).subscribe({
      next: (item: Supplier) => {
        this.list.push(item);
        this.messageService.add({
          severity: 'success',
          summary: 'Anagrafica Fornitore creata',
          detail: this.getEntityIdentifier(item),
          key: 'global'
        });
        this.loadAll();
      },
      error: (err: any) => {
        this.handleError(err, 'Errore generico nella creazione anagrafica');
      }
    });
  }
}
```

(mantenuto l'override esplicito di `onCreate` — a differenza di
`budget-chapters`, il testo del toast è "Anagrafica Fornitore **creata**"
[genere femminile per "anagrafica"], mentre l'`onCreate` ereditato da
`AbstractComponent` compone sempre `${entityLabel()} creat**o**` [maschile
fisso]: `entityLabel()` da solo non basta a riprodurre il testo esatto, serve
l'override completo; rimossi `creationResult`, `get suppliers()` mai
referenziato nel template, import PrimeNG morti)

- [ ] **Step 9: Riscrivere `suppliers.component.html`**

```html
<div style="padding: 1rem;">
  <div>
    <h1>Fornitori</h1>
    <p style="color: #6A7282;">Gestisci le anagrafiche dei fornitori</p>
  </div>
  <div style="margin-top: 1rem;">
    <app-search-suppliers (search)="onSearch($event)"></app-search-suppliers>
  </div>
  <div style="margin-top: 1.5rem;">
    <app-data-table-suppliers
      [data]="list"
      [loading]="loading"
      (onSave)="onSave($event)"
      (onDelete)="onDelete($event)"
      (onCreate)="onCreate($event)"
      (onRestore)="onRestore($event)"
      [resetPagingTrigger]="resetPagingCount"
    ></app-data-table-suppliers>
  </div>
</div>
```

- [ ] **Step 10: Verificare compilazione mirata**

```bash
docker exec utenzepa-frontend-1 npx tsc --noEmit -p tsconfig.app.json
```

Zero errori attesi nei file sotto `pages/suppliers/`.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/app/pages/suppliers/
git commit -m "refactor(frontend): migra pagina suppliers a Angular Material, fix header dialog restore"
```

---

### Task 3: Migrare `system-users`

**Files:**
- Create: `frontend/src/app/pages/system-users/system-user-edit-dialog.component.ts` + `.html`
- Create: `frontend/src/app/pages/system-users/system-user-filter-dialog.component.ts`
- Modify: `frontend/src/app/pages/system-users/data-table-users.component.ts` + `.html`
- Modify: `frontend/src/app/pages/system-users/search-users.component.ts` + `.html`
- Modify: `frontend/src/app/pages/system-users/system-users.component.ts` + `.html`

**Interfaces:**
- Consumes: `EditDialogData<T>`/`ConfirmDialogComponent`,
  `FilterDialogData<V>`/`AbstractSearchComponent`.
- Produces: `SystemUserEditDialogComponent`, `SYSTEM_USER_ROLE_OPTIONS`/
  `SYSTEM_USER_STATUS_OPTIONS` (costanti esportate da
  `system-user-edit-dialog.component.ts`, riusate dal filtro),
  `SystemUserFilterDialogComponent`.

Differenze rispetto alle altre 3 pagine del gruppo (da riprodurre
fedelmente, non correggere): **nessun restore/ripristino** per questa
entità (niente bottone, niente dialog, niente override di `restoreItem()`);
bottone Modifica visibile solo per `['Admin','Operatore']` (Lettore
escluso, diverso dal solito `['Admin','Operatore','Lettore']`); bottone
Elimina visibile solo per `['Admin']`; generazione password random lato
container in `onCreate()`, mai in `onSave()`/nel dialog, mai mostrata a
schermo.

- [ ] **Step 1: Creare il dialog di edit/create**

`frontend/src/app/pages/system-users/system-user-edit-dialog.component.ts`:

```typescript
import {Component, inject} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {plainToInstance} from 'class-transformer';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {SystemUser} from './entity/system-user.entity';
import {AuthService} from '../../services/auth.service';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';

export const SYSTEM_USER_ROLE_OPTIONS: { label: string; value: SystemUser['role'] }[] = [
  {label: 'Admin', value: 'Admin'},
  {label: 'Operatore', value: 'Operatore'},
  {label: 'Lettore', value: 'Lettore'},
];

export const SYSTEM_USER_STATUS_OPTIONS: { label: string; value: SystemUser['status'] }[] = [
  {label: 'Attivo', value: 'Attivo'},
  {label: 'Disattivo', value: 'Disattivo'},
];

@Component({
  selector: 'app-system-user-edit-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, HasRoleDirective, ReadOnlyDirective],
  templateUrl: './system-user-edit-dialog.component.html'
})
export class SystemUserEditDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<SystemUserEditDialogComponent, SystemUser | undefined>);
  private authService = inject(AuthService);
  protected data = inject<EditDialogData<SystemUser>>(MAT_DIALOG_DATA);

  roleOptions = SYSTEM_USER_ROLE_OPTIONS;
  statusOptions = SYSTEM_USER_STATUS_OPTIONS;
  isNew = this.data.mode === 'create';

  form = this.fb.group({
    firstName: [this.data.item.firstName ?? '', Validators.required],
    lastName: [this.data.item.lastName ?? '', Validators.required],
    email: [this.data.item.email ?? '', [Validators.required, Validators.email]],
    role: [this.data.item.role ?? 'Operatore', Validators.required],
    status: [this.data.item.status ?? 'Attivo', Validators.required],
  });

  constructor() {
    const role = this.authService.getCurrentUser()?.role;
    if (!role || role === 'Lettore') {
      this.form.disable();
    }
  }

  save(): void {
    if (!this.form.valid) return;
    const result = plainToInstance(SystemUser, {
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

- [ ] **Step 2: Creare il template del dialog di edit/create**

`frontend/src/app/pages/system-users/system-user-edit-dialog.component.html`:

```html
<h2 mat-dialog-title>
  {{ isNew ? 'Crea nuovo utente' : 'Modifica utente: ' + data.item.firstName + ' ' + data.item.lastName }}
</h2>

<mat-dialog-content>
  <form [formGroup]="form" [readOnly]="['Lettore']" style="display: flex; flex-wrap: wrap; gap: 1rem;">
    <mat-form-field style="flex: 1 1 45%;">
      <mat-label>Nome *</mat-label>
      <input matInput formControlName="firstName">
      @if (form.controls.firstName.invalid && form.controls.firstName.touched) {
        <mat-error>Obbligatorio</mat-error>
      }
    </mat-form-field>

    <mat-form-field style="flex: 1 1 45%;">
      <mat-label>Cognome *</mat-label>
      <input matInput formControlName="lastName">
      @if (form.controls.lastName.invalid && form.controls.lastName.touched) {
        <mat-error>Obbligatorio</mat-error>
      }
    </mat-form-field>

    <mat-form-field style="flex: 1 1 45%;">
      <mat-label>Email *</mat-label>
      <input matInput type="email" formControlName="email">
      @if (form.controls.email.errors?.['required'] && form.controls.email.touched) {
        <mat-error>Obbligatorio</mat-error>
      } @else if (form.controls.email.errors?.['email'] && form.controls.email.touched) {
        <mat-error>Email non valida</mat-error>
      }
    </mat-form-field>

    <mat-form-field style="flex: 1 1 45%;">
      <mat-label>Ruolo *</mat-label>
      <mat-select formControlName="role">
        @for (opt of roleOptions; track opt.value) {
          <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
        }
      </mat-select>
      @if (form.controls.role.invalid && form.controls.role.touched) {
        <mat-error>Obbligatorio</mat-error>
      }
    </mat-form-field>

    <mat-form-field style="flex: 1 1 45%;">
      <mat-label>Status *</mat-label>
      <mat-select formControlName="status">
        @for (opt of statusOptions; track opt.value) {
          <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
        }
      </mat-select>
      @if (form.controls.status.invalid && form.controls.status.touched) {
        <mat-error>Obbligatorio</mat-error>
      }
    </mat-form-field>
  </form>
</mat-dialog-content>

<mat-dialog-actions align="end">
  <button mat-stroked-button (click)="cancel()">Annulla</button>
  <button mat-flat-button (click)="save()" [disabled]="!form.valid" [appHasRole]="['Admin','Operatore']">Salva</button>
</mat-dialog-actions>
```

- [ ] **Step 3: Creare il dialog filtri**

`frontend/src/app/pages/system-users/system-user-filter-dialog.component.ts`:

```typescript
import {Component, inject} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {FilterDialogData} from '../../core/components/abstract-search.component';
import {SYSTEM_USER_ROLE_OPTIONS, SYSTEM_USER_STATUS_OPTIONS} from './system-user-edit-dialog.component';

export interface SystemUserFilterValues {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  role: string | null;
  status: string | null;
}

@Component({
  selector: 'app-system-user-filter-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Filtri di ricerca</h2>
    <mat-dialog-content>
      <form [formGroup]="form" id="filter-form" (ngSubmit)="apply()" style="display: flex; flex-wrap: wrap; gap: 1rem;">
        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>Nome</mat-label>
          <input matInput formControlName="firstName">
        </mat-form-field>
        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>Cognome</mat-label>
          <input matInput formControlName="lastName">
        </mat-form-field>
        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>Email</mat-label>
          <input matInput formControlName="email">
        </mat-form-field>
        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>Ruolo</mat-label>
          <mat-select formControlName="role">
            @for (opt of roleOptions; track opt.value) {
              <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>Stato</mat-label>
          <mat-select formControlName="status">
            @for (opt of statusOptions; track opt.value) {
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
export class SystemUserFilterDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<SystemUserFilterDialogComponent, SystemUserFilterValues | 'clear'>);
  protected data = inject<FilterDialogData<SystemUserFilterValues>>(MAT_DIALOG_DATA);

  roleOptions = SYSTEM_USER_ROLE_OPTIONS;
  statusOptions = SYSTEM_USER_STATUS_OPTIONS;

  form = this.fb.group({
    firstName: [this.data.values.firstName ?? ''],
    lastName: [this.data.values.lastName ?? ''],
    email: [this.data.values.email ?? ''],
    role: [this.data.values.role ?? null],
    status: [this.data.values.status ?? null],
  });

  apply(): void {
    this.dialogRef.close(this.form.getRawValue());
  }

  clear(): void {
    this.dialogRef.close('clear');
  }
}
```

- [ ] **Step 4: Riscrivere `data-table-users.component.ts`**

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
import {SystemUser} from './entity/system-user.entity';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {SystemUserEditDialogComponent} from './system-user-edit-dialog.component';
import {ConfirmDialogComponent} from '../../core/components/confirm-dialog.component';

@Component({
  selector: 'app-data-table-users',
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
  templateUrl: './data-table-users.component.html'
})
export class DataTableUsersComponent extends AbstractDataTableComponent<SystemUser> {

  displayedColumns = ['actions', 'id', 'firstName', 'lastName', 'email', 'role', 'status', 'create_date'];

  constructor(screen: ScreenSizeService) {
    super(screen);
  }

  override itemInstance(): SystemUser {
    return SystemUser.create({role: 'Operatore', status: 'Attivo'});
  }

  override editDialogComponent(): Type<unknown> {
    return SystemUserEditDialogComponent;
  }

  protected override entityLabel(): string {
    return 'utente';
  }

  override openDeleteDialog(entity: SystemUser): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Elimina utente',
        message: `Vuoi eliminare ${entity.firstName} ${entity.lastName}?`,
        confirmLabel: 'Elimina',
        danger: true
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onDelete.emit(entity);
    });
  }
}
```

(nessun override di `restoreItem()`: questa entità non ha funzionalità di
ripristino, l'implementazione ereditata resta inutilizzata perché il template
non espone mai un bottone "Ripristina")

- [ ] **Step 5: Riscrivere `data-table-users.component.html`**

```html
<div style="display: flex; justify-content: space-between; align-items: center;">
  <h3>Elenco utenti ({{ data.length }})</h3>
  <button mat-flat-button (click)="openCreateDialog()" [appHasRole]="['Admin', 'Operatore']">
    <mat-icon>add</mat-icon>
    Aggiungi utente
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
        <button mat-icon-button (click)="openEditDialog(item)" [appHasRole]="['Admin', 'Operatore']"
                matTooltip="Modifica" aria-label="Modifica">
          <mat-icon>edit</mat-icon>
        </button>
      }
      <button mat-icon-button class="mat-action-danger" (click)="openDeleteDialog(item)"
              [appHasRole]="['Admin']" matTooltip="Elimina" aria-label="Elimina">
        <mat-icon>delete</mat-icon>
      </button>
    </td>
  </ng-container>

  <ng-container matColumnDef="id">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>ID</th>
    <td mat-cell *matCellDef="let item">{{ item.id }}</td>
  </ng-container>

  <ng-container matColumnDef="firstName">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Nome</th>
    <td mat-cell *matCellDef="let item">{{ item.firstName }}</td>
  </ng-container>

  <ng-container matColumnDef="lastName">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Cognome</th>
    <td mat-cell *matCellDef="let item">{{ item.lastName }}</td>
  </ng-container>

  <ng-container matColumnDef="email">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Email</th>
    <td mat-cell *matCellDef="let item">{{ item.email }}</td>
  </ng-container>

  <ng-container matColumnDef="role">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Ruolo</th>
    <td mat-cell *matCellDef="let item">{{ item.role }}</td>
  </ng-container>

  <ng-container matColumnDef="status">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Status</th>
    <td mat-cell *matCellDef="let item">{{ item.status }}</td>
  </ng-container>

  <ng-container matColumnDef="create_date">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Data Creazione</th>
    <td mat-cell *matCellDef="let item">{{ item.create_date | date:'dd/MM/yyyy HH:mm' }}</td>
  </ng-container>

  <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
  <tr mat-row *matRowDef="let row; columns: displayedColumns;" [class.row-deleted]="row.deleted"></tr>

  <tr class="mat-row" *matNoDataRow>
    <td class="mat-cell" [attr.colspan]="displayedColumns.length">Nessun utente trovato.</td>
  </tr>
</table>

<mat-paginator #paginator [pageSizeOptions]="rowsPerPageOptions" [pageSize]="10"></mat-paginator>
```

(nessun bottone "Ripristina" in nessun caso — a differenza delle altre 3
pagine del gruppo, `item.deleted` non abilita mai un'azione alternativa qui;
`@if (!item.deleted)` avvolge **solo** Modifica come nell'originale, Elimina
resta sempre cliccabile per l'Admin anche su righe già eliminate — comportamento
preservato dall'originale, non è in scope correggerlo qui)

- [ ] **Step 6: Riscrivere `search-users.component.ts`**

```typescript
import {Component, Type} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {AbstractSearchComponent} from '../../core/components/abstract-search.component';
import {SystemUserFilterDialogComponent} from './system-user-filter-dialog.component';

@Component({
  selector: 'app-search-users',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule],
  templateUrl: './search-users.component.html',
})
export class SearchUsersComponent extends AbstractSearchComponent {

  constructor(private fb: FormBuilder) {
    super();
    this.qSearch = this.fb.group({
      qsearch: [''],
      firstName: [''],
      lastName: [''],
      email: [''],
      role: [null],
      status: [null],
    });
  }

  override filterDialogComponent(): Type<unknown> {
    return SystemUserFilterDialogComponent;
  }
}
```

- [ ] **Step 7: Riscrivere `search-users.component.html`**

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

- [ ] **Step 8: Riscrivere `system-users.component.ts`**

```typescript
import {Component} from '@angular/core';
import {SystemUsersService} from './system-users.service';
import {DataTableUsersComponent} from './data-table-users.component';
import {SearchUsersComponent} from './search-users.component';
import {SystemUser} from './entity/system-user.entity';
import {AbstractComponent} from '../../core/components/abstract.component';

@Component({
  selector: 'app-systemUsers',
  standalone: true,
  imports: [
    DataTableUsersComponent,
    SearchUsersComponent,
  ],
  templateUrl: './system-users.component.html'
})
export class SystemUsersComponent extends AbstractComponent<SystemUser> {

  constructor(protected override service: SystemUsersService) {
    super();
  }

  protected override getEntityIdentifier(entity: SystemUser): string {
    return `${entity.firstName} ${entity.lastName}`;
  }

  private generateRandomPassword(length = 6): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({length}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  override onCreate(entity: SystemUser) {
    const payload = {
      ...entity,
      password: this.generateRandomPassword(),
      created_by_user_id: this.userId,
    };
    this.service.create(payload).subscribe({
      next: (user: SystemUser) => {
        this.list.push(user);
        this.messageService.add({
          key: 'global',
          severity: 'success',
          summary: 'Utente creato',
          detail: `${user.firstName} ${user.lastName}`,
        });
        this.loadAll();
      },
      error: (err: any) => this.handleError(err, 'Errore generico nella creazione utente'),
    });
  }
}
```

(payload identico all'originale: spread di `entity` + `password` +
**solo** `created_by_user_id`, senza `updated_by_user_id` — comportamento noto
e da preservare, non è nello scope di questo piano correggerlo; rimossi
`creationResult` e import PrimeNG morti)

- [ ] **Step 9: Riscrivere `system-users.component.html`**

```html
<div style="padding: 1rem;">
  <div>
    <h1>Utenti e ruoli</h1>
    <p style="color: #6A7282;">Gestisci gli utenti del sistema e i loro ruoli</p>
  </div>
  <div style="margin-top: 1rem;">
    <app-search-users (search)="onSearch($event)"></app-search-users>
  </div>
  <div style="margin-top: 1.5rem;">
    <app-data-table-users
      [data]="list"
      [loading]="loading"
      (onSave)="onSave($event)"
      (onDelete)="onDelete($event)"
      (onCreate)="onCreate($event)"
      [resetPagingTrigger]="resetPagingCount"
    ></app-data-table-users>
  </div>
</div>
```

(nessun `(onRestore)` — coerente con l'assenza di ripristino per questa
entità; `@Output onRestore` resta nella base class ma non viene mai emesso da
`DataTableUsersComponent`, quindi il binding è superfluo qui)

- [ ] **Step 10: Verificare compilazione mirata**

```bash
docker exec utenzepa-frontend-1 npx tsc --noEmit -p tsconfig.app.json
```

Zero errori attesi nei file sotto `pages/system-users/`.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/app/pages/system-users/
git commit -m "refactor(frontend): migra pagina system-users a Angular Material"
```

---

### Task 4: Migrare `utility-types`

**Files:**
- Create: `frontend/src/app/pages/utility-types/utility-type-edit-dialog.component.ts` + `.html`
- Create: `frontend/src/app/pages/utility-types/utility-type-filter-dialog.component.ts`
- Modify: `frontend/src/app/pages/utility-types/data-table-utility-types.component.ts` + `.html`
- Modify: `frontend/src/app/pages/utility-types/search-utility-types.component.ts` + `.html`
- Modify: `frontend/src/app/pages/utility-types/utility-types.component.ts` + `.html`

**Interfaces:**
- Consumes: `EditDialogData<T>`/`ConfirmDialogComponent`,
  `FilterDialogData<V>`/`AbstractSearchComponent`, `Purpose`
  (`../purpose/entity/purpose.entity.ts`, invariato), `UseType`
  (`../purpose/enum/use-type.enum.ts`, invariato), `PurposeService`
  (`../purpose/purpose.service.ts`, invariato — `search(filters?: Partial<Purpose>): Observable<Purpose[]>`).
- Produces: `UtilityTypeEditDialogComponent`, `UtilityTypeFilterDialogComponent`.

Pattern speciale di questa pagina: il dialog di edit/create carica
autonomamente (via `PurposeService.search({deleted: false})`, in `ngOnInit`)
le liste `genericPurposes`/`specificPurposes` (filtrate per
`use_type === UseType.GENERIC`/`SPECIFIC`), le espone come opzioni di due
`mat-select multiple` (`generic_purpose_ids`/`specific_purpose_ids`, campi
virtuali del form, non presenti sull'entity) e in `save()` le fonde in un
unico array `purposes: Purpose[]` completo, assegnato all'entity risultante.
Questa logica di fusione sostituisce `enrichItem()`/`prepareFormValue()` del
vecchio `AbstractDataTableComponent` PrimeNG (non più presenti nella base
class Material).

- [ ] **Step 1: Creare il dialog di edit/create**

`frontend/src/app/pages/utility-types/utility-type-edit-dialog.component.ts`:

```typescript
import {Component, inject, OnInit} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {plainToInstance} from 'class-transformer';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {UtilityType} from './entity/utility-type.entity';
import {HardTypeOptions} from './enum/hard-type.enum';
import {AuthService} from '../../services/auth.service';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';
import {PurposeService} from '../purpose/purpose.service';
import {Purpose} from '../purpose/entity/purpose.entity';
import {UseType} from '../purpose/enum/use-type.enum';

@Component({
  selector: 'app-utility-type-edit-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, HasRoleDirective, ReadOnlyDirective],
  templateUrl: './utility-type-edit-dialog.component.html'
})
export class UtilityTypeEditDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<UtilityTypeEditDialogComponent, UtilityType | undefined>);
  private authService = inject(AuthService);
  private purposeService = inject(PurposeService);
  protected data = inject<EditDialogData<UtilityType>>(MAT_DIALOG_DATA);

  hardTypeOptions = HardTypeOptions;
  isNew = this.data.mode === 'create';

  genericPurposes: Purpose[] = [];
  specificPurposes: Purpose[] = [];

  form = this.fb.group({
    name: [this.data.item.name ?? '', Validators.required],
    hard_type: [this.data.item.hard_type ?? null, Validators.required],
    description: [this.data.item.description ?? ''],
    generic_purpose_ids: [(this.data.item.purposes ?? []).filter(p => p.use_type === UseType.GENERIC).map(p => p.id)],
    specific_purpose_ids: [(this.data.item.purposes ?? []).filter(p => p.use_type === UseType.SPECIFIC).map(p => p.id)],
  });

  constructor() {
    const role = this.authService.getCurrentUser()?.role;
    if (!role || role === 'Lettore') {
      this.form.disable();
    }
  }

  ngOnInit(): void {
    this.purposeService.search({deleted: false}).subscribe(purposes => {
      this.genericPurposes = purposes.filter(p => p.use_type === UseType.GENERIC);
      this.specificPurposes = purposes.filter(p => p.use_type === UseType.SPECIFIC);
    });
  }

  save(): void {
    if (!this.form.valid) return;
    const {generic_purpose_ids, specific_purpose_ids, ...rest} = this.form.getRawValue();
    const allIds = [...(generic_purpose_ids ?? []), ...(specific_purpose_ids ?? [])];
    const purposes = allIds
      .map(id => [...this.genericPurposes, ...this.specificPurposes].find(p => p.id === id))
      .filter((p): p is Purpose => p != null);
    const result = plainToInstance(UtilityType, {
      id: this.data.item.id,
      ...rest,
      purposes
    });
    this.dialogRef.close(result);
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}
```

- [ ] **Step 2: Creare il template del dialog di edit/create**

`frontend/src/app/pages/utility-types/utility-type-edit-dialog.component.html`:

```html
<h2 mat-dialog-title>
  {{ isNew ? 'Crea nuova tipologia' : 'Modifica tipologia: ' + data.item.name }}
</h2>

<mat-dialog-content>
  <form [formGroup]="form" [readOnly]="['Lettore']" style="display: flex; flex-wrap: wrap; gap: 1rem;">
    <mat-form-field style="flex: 1 1 45%;">
      <mat-label>Nome *</mat-label>
      <input matInput formControlName="name">
      @if (form.controls.name.invalid && form.controls.name.touched) {
        <mat-error>Il nome è Obbligatorio</mat-error>
      }
    </mat-form-field>

    <mat-form-field style="flex: 1 1 50%;">
      <mat-label>Tipo Contatore *</mat-label>
      <mat-select formControlName="hard_type">
        @for (opt of hardTypeOptions; track opt.value) {
          <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
        }
      </mat-select>
      @if (form.controls.hard_type.invalid && form.controls.hard_type.touched) {
        <mat-error>Il tipo contatore è Obbligatorio</mat-error>
      }
    </mat-form-field>

    <mat-form-field style="flex: 1 1 100%;">
      <mat-label>Descrizione</mat-label>
      <input matInput formControlName="description">
    </mat-form-field>

    <mat-form-field style="flex: 1 1 45%;">
      <mat-label>Finalità Generiche</mat-label>
      <mat-select formControlName="generic_purpose_ids" multiple>
        @for (p of genericPurposes; track p.id) {
          <mat-option [value]="p.id">{{ p.name }}</mat-option>
        }
      </mat-select>
    </mat-form-field>

    <mat-form-field style="flex: 1 1 45%;">
      <mat-label>Finalità Specifiche</mat-label>
      <mat-select formControlName="specific_purpose_ids" multiple>
        @for (p of specificPurposes; track p.id) {
          <mat-option [value]="p.id">{{ p.name }}</mat-option>
        }
      </mat-select>
    </mat-form-field>
  </form>
</mat-dialog-content>

<mat-dialog-actions align="end">
  <button mat-stroked-button (click)="cancel()">Annulla</button>
  <button mat-flat-button (click)="save()" [disabled]="!form.valid" [appHasRole]="['Admin','Operatore']">Salva</button>
</mat-dialog-actions>
```

- [ ] **Step 3: Creare il dialog filtri**

`frontend/src/app/pages/utility-types/utility-type-filter-dialog.component.ts`:

```typescript
import {Component, inject} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {FilterDialogData} from '../../core/components/abstract-search.component';
import {HardTypeOptions} from './enum/hard-type.enum';

export interface UtilityTypeFilterValues {
  name: string | null;
  description: string | null;
  hard_type: unknown;
}

@Component({
  selector: 'app-utility-type-filter-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Filtri di ricerca</h2>
    <mat-dialog-content>
      <form [formGroup]="form" id="filter-form" (ngSubmit)="apply()" style="display: flex; flex-wrap: wrap; gap: 1rem;">
        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>Nome</mat-label>
          <input matInput formControlName="name">
        </mat-form-field>
        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>Descrizione</mat-label>
          <input matInput formControlName="description">
        </mat-form-field>
        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>Tipo</mat-label>
          <mat-select formControlName="hard_type">
            @for (opt of hardTypeOptions; track opt.value) {
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
export class UtilityTypeFilterDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<UtilityTypeFilterDialogComponent, UtilityTypeFilterValues | 'clear'>);
  protected data = inject<FilterDialogData<UtilityTypeFilterValues>>(MAT_DIALOG_DATA);

  hardTypeOptions = [
    {label: 'Tutti', value: null},
    ...HardTypeOptions
  ];

  form = this.fb.group({
    name: [this.data.values.name ?? ''],
    description: [this.data.values.description ?? ''],
    hard_type: [this.data.values.hard_type ?? null],
  });

  apply(): void {
    this.dialogRef.close(this.form.getRawValue());
  }

  clear(): void {
    this.dialogRef.close('clear');
  }
}
```

(rimossi `createDateFrom`/`createDateTo`/`updateDateFrom`/`updateDateTo`:
campi mai renderizzati nel form filtri originale, dead code coerente con la
pulizia già fatta in Gruppo A su `search-utilizer.component.ts`)

- [ ] **Step 4: Riscrivere `data-table-utility-types.component.ts`**

```typescript
import {Component, Type} from '@angular/core';
import {MatTableModule} from '@angular/material/table';
import {MatSortModule} from '@angular/material/sort';
import {MatPaginatorModule} from '@angular/material/paginator';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ScreenSizeService} from '../../services/screen-size.service';
import {UtilityType} from './entity/utility-type.entity';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {UtilityTypeEditDialogComponent} from './utility-type-edit-dialog.component';
import {ConfirmDialogComponent} from '../../core/components/confirm-dialog.component';
import {HardType, HardTypeDescription} from './enum/hard-type.enum';

@Component({
  selector: 'app-data-table-utility-types',
  standalone: true,
  imports: [
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressBarModule,
    HasRoleDirective
  ],
  templateUrl: './data-table-utility-types.component.html'
})
export class DataTableUtilityTypesComponent extends AbstractDataTableComponent<UtilityType> {

  displayedColumns = ['actions', 'id', 'name', 'hard_type', 'description'];
  hardTypeDescription = HardTypeDescription;

  constructor(screen: ScreenSizeService) {
    super(screen);
  }

  override itemInstance(): UtilityType {
    return UtilityType.create();
  }

  override editDialogComponent(): Type<unknown> {
    return UtilityTypeEditDialogComponent;
  }

  protected override entityLabel(): string {
    return 'tipologia uso contatore';
  }

  getHardTypeDescription(value: any): string {
    return this.hardTypeDescription[value as HardType] || value;
  }

  override openDeleteDialog(entity: UtilityType): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Elimina tipologia',
        message: `Elimina tipologia ${entity.name}?`,
        confirmLabel: 'Elimina',
        danger: true
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onDelete.emit(entity);
    });
  }

  override restoreItem(entity: UtilityType): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Ripristina tipologia',
        message: `Riattiva tipologia ${entity.name}?`,
        confirmLabel: 'Ripristina'
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onRestore.emit(entity);
    });
  }
}
```

(`UtilityType` ha `name`, quindi il messaggio generico ereditato sarebbe già
vicino all'originale, ma il **bottone** di conferma restore nel
`ConfirmDialogComponent` generico usa sempre `confirmLabel: 'Ripristina'` — è
il **testo del dialog PrimeNG originale** ad avere il bottone etichettato
`'Riattiva'`, incoerente con le altre pagine del gruppo dopo il fix
applicato in Gruppo A alla base class. L'override qui uniforma a
`'Ripristina'` come richiesto)

- [ ] **Step 5: Riscrivere `data-table-utility-types.component.html`**

```html
<div style="display: flex; justify-content: space-between; align-items: center;">
  <h3>Elenco ({{data.length}})</h3>
  <button mat-flat-button (click)="openCreateDialog()" [appHasRole]="['Admin', 'Operatore']">
    <mat-icon>add</mat-icon>
    Aggiungi tipologia
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

  <ng-container matColumnDef="name">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Nome Tipologia Uso</th>
    <td mat-cell *matCellDef="let item">{{ item.name }}</td>
  </ng-container>

  <ng-container matColumnDef="hard_type">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Tipo Contatore</th>
    <td mat-cell *matCellDef="let item">{{ getHardTypeDescription(item.hard_type) }}</td>
  </ng-container>

  <ng-container matColumnDef="description">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Descrizione</th>
    <td mat-cell *matCellDef="let item">{{ item.description }}</td>
  </ng-container>

  <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
  <tr mat-row *matRowDef="let row; columns: displayedColumns;" [class.row-deleted]="row.deleted"></tr>

  <tr class="mat-row" *matNoDataRow>
    <td class="mat-cell" [attr.colspan]="displayedColumns.length">Nessuna tipologia contatore trovata.</td>
  </tr>
</table>

<mat-paginator #paginator [pageSizeOptions]="rowsPerPageOptions" [pageSize]="10"></mat-paginator>
```

(bottone Modifica **non** avvolto in `@if (!item.deleted)`: resta sempre
visibile anche sulle righe eliminate, comportamento diverso dalle altre 3
pagine del gruppo e da preservare così com'è — stesso quirk già preservato
per `utility-aggregator`/`utilizer` in Gruppo A)

- [ ] **Step 6: Riscrivere `search-utility-types.component.ts`**

```typescript
import {Component, Type} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {AbstractSearchComponent} from '../../core/components/abstract-search.component';
import {UtilityTypeFilterDialogComponent} from './utility-type-filter-dialog.component';

@Component({
  selector: 'app-search-utility-type',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule],
  templateUrl: './search-utility-types.component.html',
})
export class SearchFormUtilityTypes extends AbstractSearchComponent {

  constructor(private fb: FormBuilder) {
    super();
    this.qSearch = this.fb.group({
      qsearch: [''],
      name: [''],
      description: [''],
      hard_type: [null],
    });
  }

  override filterDialogComponent(): Type<unknown> {
    return UtilityTypeFilterDialogComponent;
  }
}
```

(nome classe `SearchFormUtilityTypes` invariato — è quello importato da
`utility-types.component.ts`, verificato non simmetrico col nome cartella)

- [ ] **Step 7: Riscrivere `search-utility-types.component.html`**

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

- [ ] **Step 8: Riscrivere `utility-types.component.ts`**

```typescript
import {Component} from '@angular/core';
import {UtilityTypesService} from './utility-types.service';
import {AbstractComponent} from '../../core/components/abstract.component';
import {UtilityType} from './entity/utility-type.entity';
import {DataTableUtilityTypesComponent} from './data-table-utility-types.component';
import {SearchFormUtilityTypes} from './search-utility-types.component';

@Component({
  selector: 'app-utilityTypes',
  standalone: true,
  imports: [
    DataTableUtilityTypesComponent,
    SearchFormUtilityTypes
  ],
  templateUrl: './utility-types.component.html'
})
export class UtilityTypesComponent extends AbstractComponent<UtilityType> {

  constructor(protected override service: UtilityTypesService) {
    super();
    this.qsearchFields = ['name', 'description'];
  }

  protected override getEntityIdentifier(entity: UtilityType): string {
    return `${entity.name}`;
  }

  protected override entityToPayload(entity: UtilityType): Partial<UtilityType> {
    return {
      name: entity.name,
      description: entity.description,
      hard_type: entity.hard_type,
      purposes: entity.purposes,
      created_by_user_id: this.userId,
      updated_by_user_id: this.userId
    };
  }

  override onCreate(entity: UtilityType) {
    const payload = this.entityToPayload(entity);
    this.service.create(payload).subscribe({
      next: (item: UtilityType) => {
        this.list.push(item);
        this.messageService.add({
          severity: 'success',
          summary: 'Tipologia Uso Contatore creata',
          detail: this.getEntityIdentifier(item),
          key: 'global'
        });
        this.loadAll();
      },
      error: (err: any) => {
        this.handleError(err, 'Errore generico nella creazione anagrafica');
      }
    });
  }
}
```

(`entityToPayload` include `purposes: entity.purposes` — l'override
originale (versione PrimeNG) non lo includeva, un probabile bug per cui le
finalità selezionate in creazione non venivano mai inviate al backend; qui è
necessario includerlo perché `UtilityTypeEditDialogComponent.save()` compone
già l'array `purposes` completo e lo passa nell'entity emessa da
`(onCreate)`. `UtilityType.purposes` ha `@Transform(..., {toPlainOnly: true})`
sull'entity — `AbstractService.parseCreate()` chiama `instanceToPlain()`
sull'istanza risultante da `plainToInstance(this.entityClass, entity)`,
quindi il transform serializza automaticamente l'array di `Purpose` in un
array di id prima dell'invio HTTP, nessun codice aggiuntivo necessario qui)

- [ ] **Step 9: Riscrivere `utility-types.component.html`**

```html
<div style="padding: 1rem;">
  <div>
    <h1>Tipologie Uso Contatore</h1>
    <p style="color: #6A7282;">Gestisci le Tipologie Uso Contatore per le utenze</p>
  </div>
  <div style="margin-top: 1rem;">
    <app-search-utility-type (search)="onSearch($event)"></app-search-utility-type>
  </div>
  <div style="margin-top: 1.5rem;">
    <app-data-table-utility-types [data]="list"
      [loading]="loading"
      (onSave)="onSave($event)"
      (onDelete)="onDelete($event)"
      (onCreate)="onCreate($event)"
      (onRestore)="onRestore($event)"
      [resetPagingTrigger]="resetPagingCount"
    ></app-data-table-utility-types>
  </div>
</div>
```

- [ ] **Step 10: Verificare compilazione mirata**

```bash
docker exec utenzepa-frontend-1 npx tsc --noEmit -p tsconfig.app.json
```

Zero errori attesi nei file sotto `pages/utility-types/`.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/app/pages/utility-types/
git commit -m "refactor(frontend): migra pagina utility-types a Angular Material, fix bottone restore e invio purposes in creazione"
```

---

### Task 5: QA manuale delle 4 pagine del Gruppo B

**Files:** nessuno (verifica manuale, nessuna modifica da committare oltre
allo stub temporaneo, che va ripristinato a fine task)

- [ ] **Step 1: Stub temporaneo per rendere l'app compilabile in isolamento**

Stesso approccio usato in Fase 1 e Gruppo A (non committato): aggiungere
temporaneamente a `frontend/tsconfig.app.json` → `exclude` le cartelle delle
5 pagine ancora non migrate a questa data (`assets`, `consip-agreement`,
`invoices`, `utilities`, `utilizer-grant` — verificare l'elenco corrente con
`ls frontend/src/app/pages/` prima di procedere: se nel frattempo un altro
gruppo ha già migrato una di queste, non escluderla), e ridurre
temporaneamente `frontend/src/app/app.routes.ts` alle sole route `dashboard`,
`login`, `setup` + le 4 route di questo gruppo. Verificare i path esatti in
`app.routes.ts` prima di editare — non sono tutti simmetrici al nome
cartella:

```typescript
{path: 'system-users', component: SystemUsersComponent},
{path: 'utility-types', component: UtilityTypesComponent},
{path: 'suppliers', component: SuppliersComponent},
{path: 'budget-chapter', component: BudgetChaptersComponent}, // singolare, non 'budget-chapters'
```

Ripristinare entrambi i file (`git checkout --`) a fine QA, **non
committare** questi file temporanei.

- [ ] **Step 2: Avviare il frontend e fare login**

```bash
docker compose up -d
```

Login con un utente esistente (Admin) sull'ambiente dev.

- [ ] **Step 3: Checklist per ciascuna delle 4 pagine**

`budget-chapters` (route `/budget-chapter`):
- [ ] La lista carica ed elenca i capitoli esistenti, colonne Azioni/ID/Cod.
      Capitolo/Articolo/PDC/Descrizione/Tipo Fornitura
- [ ] Ricerca rapida e dialog filtri (5 campi) funzionano, "Pulisci Filtri"
      resetta e riapplica subito
- [ ] "Aggiungi Capitolo Di Spesa" apre il dialog, `chapter_code` è editabile
      in creazione, `article` accetta solo cifre (direttiva `onlyNumbers`),
      validazione required su `chapter_code`/`article`/`supply_type`, salva e
      mostra toast "Capitolo creato"
- [ ] Modifica riga esistente: `chapter_code` è **disabilitato** (sola
      lettura) nel dialog di edit, resto dei campi editabile
- [ ] Bottone Modifica **nascosto** sulle righe eliminate
- [ ] Elimina apre `ConfirmDialogComponent` con header "Elimina Capitolo" e
      testo con `chapter_code`, conferma elimina
- [ ] Ripristina apre `ConfirmDialogComponent` con header "Ripristina
      Capitolo", conferma ripristina
- [ ] Sort per colonna e paginazione funzionano

`suppliers` (route `/suppliers`):
- [ ] La lista carica, 11 colonne visibili incluse Partita IVA/Codice
      Fiscale/CAP
- [ ] Dialog filtri (9 campi) si apre a **550px** di larghezza
- [ ] "Aggiungi Fornitore" apre il dialog, `supplier_id` editabile in
      creazione e **disabilitato** in modifica
- [ ] Validazione: P.IVA con meno/più di 11 cifre mostra "Partita IVA non
      valida"; codice fiscale con pattern errato mostra "Codice fiscale non
      valido"; CAP diverso da 5 cifre mostra "CAP non valido"; inserire un
      codice fiscale diverso dalla P.IVA quando la P.IVA è valida (11 cifre)
      rende il form invalido (bottone Salva disabilitato) senza messaggio a
      schermo — verificare che il comportamento sia esattamente questo,
      senza bloccare la digitazione
- [ ] Salvataggio con dati validi crea la riga, toast "Anagrafica Fornitore
      creata"
- [ ] Bottone Modifica nascosto sulle righe eliminate
- [ ] Elimina apre dialog con header "Elimina anagrafica", testo "Disattiva
      fornitore `<id>`?"
- [ ] Ripristina apre dialog con header "Ripristina anagrafica" (**non**
      "Elimina anagrafica" — verificare il fix del bug di copia-incolla
      dell'header nell'originale PrimeNG), testo "Riattiva fornitore
      `<id>`?"

`system-users` (route `/system-users`):
- [ ] La lista carica, colonna "Data Creazione" formattata `dd/MM/yyyy
      HH:mm`, `mat-progress-bar` visibile durante il caricamento (nuovo
      rispetto all'originale PrimeNG, che non aveva loading)
- [ ] "Aggiungi utente" apre il dialog: Nome/Cognome/Email required, Email
      con validazione formato, Ruolo/Status select con opzioni
      Admin/Operatore/Lettore e Attivo/Disattivo
- [ ] Creazione utente: verificare via Network tab che il payload includa
      `password` (6 caratteri alfanumerici) e **non** mostri mai la password
      generata nel toast o altrove; toast "Utente creato"
- [ ] Bottone Modifica visibile **solo** per Admin/Operatore (fare login
      anche come Lettore, se disponibile, e verificare che il bottone
      Modifica non compaia su questa pagina — a differenza delle altre
      pagine dove il Lettore vede Modifica in sola lettura)
- [ ] Bottone Elimina visibile **solo** per Admin (login come Operatore:
      Elimina non deve comparire)
- [ ] **Nessun bottone Ripristina** in nessuna condizione, nessuna riga
      mostra lo stato "eliminato" con azione di ripristino
- [ ] Sort per colonna e paginazione funzionano

`utility-types` (route `/utility-types`):
- [ ] La lista carica, colonne Nome Tipologia Uso/Tipo Contatore/Descrizione
- [ ] "Aggiungi tipologia" apre il dialog: Nome required (messaggio "Il nome
      è Obbligatorio"), Tipo Contatore required (messaggio "Il tipo
      contatore è Obbligatorio"), due `mat-select multiple` "Finalità
      Generiche"/"Finalità Specifiche" popolati dalle finalità esistenti
      (create prima almeno una finalità generica e una specifica dalla
      pagina `/purpose` se non già presenti)
- [ ] Selezionare finalità in entrambi i multiselect, salvare, e verificare
      (Network tab o riapertura del dialog di modifica sulla riga appena
      creata) che le finalità selezionate siano state effettivamente
      persistite lato backend
- [ ] Bottone Modifica **sempre visibile**, anche sulle righe eliminate
      (comportamento diverso dalle altre 3 pagine del gruppo, verificare che
      NON sia stato uniformato per errore)
- [ ] Elimina apre dialog "Elimina tipologia", testo "Elimina tipologia
      `<name>`?"
- [ ] Ripristina apre dialog "Ripristina tipologia", testo "Riattiva
      tipologia `<name>`?", **bottone di conferma etichettato "Ripristina"**
      (non "Riattiva" — verificare il fix rispetto all'originale PrimeNG)
- [ ] Sort per colonna e paginazione funzionano

Trasversale a tutte e 4 le pagine:
- [ ] Gate Lettore: login come Lettore, aprire ciascun dialog di edit/create
      raggiungibile, verificare che tutti i campi risultino non modificabili
      (form disabilitato) e che il bottone Salva sia assente o disabilitato
- [ ] Icone Material visibili correttamente, nessun residuo di stile PrimeNG
      (skeleton, `p-button`, ecc.)

- [ ] **Step 4: Ripristinare `tsconfig.app.json`/`app.routes.ts`**

```bash
git checkout -- frontend/tsconfig.app.json frontend/src/app/app.routes.ts
```

Verificare `git status` pulito prima di procedere oltre.

- [ ] **Step 5: Annotare eventuali problemi trovati e correggerli prima di
  considerare il Gruppo B concluso**

Se la checklist dello Step 3 rivela scostamenti dal comportamento atteso
(messaggi di errore, permessi di ruolo, testi dei dialog, invio mancato delle
`purposes` in creazione su `utility-types`), tornare al task della pagina
interessata, correggere, ricommittare con un commit dedicato (non ammendare
i commit dei Task 1-4), e ripetere la porzione di checklist rilevante.

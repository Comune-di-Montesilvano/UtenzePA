# Fase 2 Gruppo A: refactor filtri condiviso + 4 pagine CRUD minimali Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rifattorizzare `AbstractSearchComponent` per il pattern dialog-filtri
generico (simmetrico a `editDialogComponent()` di Fase 1), poi migrare le 4
pagine del Gruppo A (`asset-aggregator`, `maintenance-managers`,
`utility-aggregator`, `utilizer`) da PrimeNG ad Angular Material — sono cloni
strutturali l'uno dell'altro (2 campi, nessuna relazione FK).

**Architecture:** Stesso pattern di Fase 1 (`purpose`): `MatTableDataSource`/
`MatSort`/`MatPaginator` per la tabella, `MatDialog` per create/edit/delete/
restore/filtri. Nuovo in questo piano: `AbstractSearchComponent` guadagna
`filterDialogComponent(): Type<unknown>` (astratto) e `openFilterDialog()`
(concreto, apre il dialog passando una **copia** dei valori correnti, non la
`FormGroup` per riferimento — fixa la mutazione-per-riferimento di Fase 1,
finding M7 della review finale). Ogni pagina fornisce il proprio dialog filtri
con form interno indipendente.

**Tech Stack:** Angular 20.3 (invariato), Angular Material 20.2.14 (già
installato, Fase 1), RxJS 7.8.

## Global Constraints

- Angular resta `^20.3.0` — non toccare in questo piano.
- `primeng`/`@primeuix/themes`/`primeicons` restano installati — le altre 9
  pagine (Gruppi B-E) li usano ancora, non rimuovere pacchetti.
- Nessun cambio di comportamento visibile oltre al necessario per Material —
  preservare esattamente label, messaggi, larghezze dialog, validazioni,
  permessi di ruolo (`appHasRole`/gate Lettore) di ciascuna pagina.
- Questo refactor rompe **intenzionalmente e immediatamente** i
  `search-*.component.ts`/`.html` delle 9 pagine dei Gruppi B-E (si aggiunge
  alla rottura già presente sui `data-table-*.component.ts` da Fase 1 Task 5)
  — non è un errore, non vanno sistemate qui.
- Verifica per task: `npx tsc --noEmit -p tsconfig.app.json` (toolchain locale
  se il container Docker non è raggiungibile dal worktree — problema noto di
  Fase 1, vedi ledger), zero errori nei file toccati dal task, errori nelle
  pagine non ancora migrate attesi e da ignorare.
- Comandi `npm`/`ng` dentro il container Docker quando possibile (Node ≥24,
  vedi CLAUDE.md del repo).
- Convenzione dialog fissata nella spec: `templateUrl` esterno per edit/create,
  template inline per filtri e conferma.

---

## File Structure

**Nuovi/modificati file condivisi:**
- Modify: `frontend/src/app/core/components/abstract-search.component.ts`

**Per ciascuna delle 4 pagine (`asset-aggregator`, `maintenance-managers`,
`utility-aggregator`, `utilizer`), stesso schema di file:**
- Create: `<page>/<page>-edit-dialog.component.ts` + `.html`
- Create: `<page>/<page>-filter-dialog.component.ts` (template inline)
- Modify: `<page>/data-table-<page>.component.ts` + `.html`
- Modify: `<page>/search-<page>.component.ts` + `.html`
- Modify: `<page>/<page>.component.ts` + `.html` (container)

---

### Task 1: Refactor `AbstractSearchComponent` — dialog filtri generico

**Files:**
- Modify: `frontend/src/app/core/components/abstract-search.component.ts`

**Interfaces:**
- Produces: `FilterDialogData<V> = {values: V}` (nuova interfaccia esportata),
  `abstract filterDialogComponent(): Type<unknown>`, `openFilterDialog(): void`
  (apre il dialog, su risultato `'clear'` fa `qSearch.reset()` + `onSearch()`,
  su risultato oggetto fa `qSearch.patchValue(result)` + `onSearch()`, su
  `undefined` non fa nulla).
- Consumes: `MatDialog` (`@angular/material/dialog`).
- Rimossi: campo `filterDialogVisible` (rottura intenzionale delle pagine non
  ancora migrate, vedi Global Constraints).

- [ ] **Step 1: Riscrivere il file**

`frontend/src/app/core/components/abstract-search.component.ts`:

```typescript
import {Component, EventEmitter, inject, OnInit, Output, Type} from '@angular/core';
import {FormGroup} from '@angular/forms';
import {MatDialog} from '@angular/material/dialog';
import {debounceTime, map, Observable} from 'rxjs';

export interface FilterDialogData<V> {
  values: V;
}

@Component(
  {
    template: ''
  })
export abstract class AbstractSearchComponent implements OnInit {

  qSearch!: FormGroup;
  @Output() search = new EventEmitter<any>();

  protected dialog = inject(MatDialog);

  ngOnInit() {
    this.qSearch.get('qsearch')?.valueChanges
        .pipe(debounceTime(200))
        .subscribe(value => {
          this.search.emit({qsearch: value});
        });
  }

  protected onQuickSearch() {
    this.search.emit({qsearch: this.qSearch.get('qsearch')?.value});
  }

  onSearch() {
    this.parseSearchForm();
  }

  abstract filterDialogComponent(): Type<unknown>;

  openFilterDialog(): void {
    this.dialog.open<unknown, FilterDialogData<unknown>, unknown>(this.filterDialogComponent(), {
      width: '450px',
      data: {values: this.qSearch.value}
    }).afterClosed().subscribe(result => {
      if (result === 'clear') {
        this.qSearch.reset();
        this.onSearch();
      } else if (result) {
        this.qSearch.patchValue(result as object);
        this.onSearch();
      }
    });
  }

  protected loadOptions(
    service: { search: (filters?: any) => Observable<any[]> },
    valueField: string,
    labelField: string | ((item: any) => string),
    filters?: any,
    maxLength?: number
  ): Observable<{ label: string; value: any }[]> {
    const getLabel = typeof labelField === 'function'
      ? labelField
      : (item: any) => item[labelField as string];

    const truncate = (label: string) =>
      maxLength && label?.length > maxLength ? label.substring(0, maxLength) + '…' : label;

    return service.search(filters).pipe(
      map(data =>
        data
          .map(item => ({ label: truncate(getLabel(item)), value: item[valueField] }))
          .sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''))
      )
    );
  }

  protected parseSearchForm(): void {
    const raw = this.qSearch.value;

    Object.keys(raw).forEach(key => {
      const v = raw[key];

      if (Array.isArray(v)) {
        const isDateArray = v.some(el => el instanceof Date);
        if (isDateArray) {
          const mapped = (v as (Date | null)[]).map(el => (el instanceof Date ? el.toISOString() : null));
          if (mapped.every(el => el === null)) {
            delete raw[key];
          } else {
            raw[key] = mapped;
          }
        } else {
          if (v.length === 0 || v.every(el => el === null || el === undefined)) {
            delete raw[key];
          }
        }
        return;
      }

      if (v === null || v === undefined || v === '') {
        delete raw[key];
        return;
      }

      if (v instanceof Date) {
        raw[key] = v.toISOString();
      }
    });

    this.search.emit(raw);
  }

}
```

Nota: `parseSearchForm()` non ha più la riga `this.filterDialogVisible = false;`
in coda (il campo non esiste più, la chiusura del dialog è già gestita da
`MatDialog`).

- [ ] **Step 2: Verificare compilazione mirata**

```bash
docker exec utenzepa-frontend-1 npx tsc --noEmit -p tsconfig.app.json
```

(o toolchain locale se il container non è raggiungibile dal worktree). Zero
errori attesi in `abstract-search.component.ts` stesso. Le 13 pagine non ancora
migrate del Gruppo A-E mostreranno nuovi errori sui propri `search-*` (atteso,
si somma alla rottura già nota sui `data-table-*`).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/core/components/abstract-search.component.ts
git commit -m "refactor(frontend): AbstractSearchComponent usa MatDialog per il filtro, dialog riceve copia dei valori"
```

---

### Task 2: Migrare `asset-aggregator`

**Files:**
- Create: `frontend/src/app/pages/asset-aggregator/asset-aggregator-edit-dialog.component.ts` + `.html`
- Create: `frontend/src/app/pages/asset-aggregator/asset-aggregator-filter-dialog.component.ts`
- Modify: `frontend/src/app/pages/asset-aggregator/data-table-asset-aggregator.component.ts` + `.html`
- Modify: `frontend/src/app/pages/asset-aggregator/search-asset-aggregator.component.ts` + `.html`
- Modify: `frontend/src/app/pages/asset-aggregator/asset-aggregator.component.ts` + `.html`

**Interfaces:**
- Consumes: `EditDialogData<T>`/`ConfirmDialogComponent` (Fase 1),
  `FilterDialogData<V>`/`AbstractSearchComponent.openFilterDialog()` (Task 1).

- [ ] **Step 1: Creare il dialog di edit/create**

`frontend/src/app/pages/asset-aggregator/asset-aggregator-edit-dialog.component.ts`:

```typescript
import {Component, inject} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {plainToInstance} from 'class-transformer';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {AssetAggregator} from './entity/asset-aggregator.entity';

@Component({
  selector: 'app-asset-aggregator-edit-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  templateUrl: './asset-aggregator-edit-dialog.component.html'
})
export class AssetAggregatorEditDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<AssetAggregatorEditDialogComponent, AssetAggregator | undefined>);
  protected data = inject<EditDialogData<AssetAggregator>>(MAT_DIALOG_DATA);

  isNew = this.data.mode === 'create';

  form = this.fb.group({
    code: [this.data.item.code ?? '', Validators.required],
    description: [this.data.item.description ?? '', Validators.required],
  });

  save(): void {
    if (!this.form.valid) return;
    const result = plainToInstance(AssetAggregator, {
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

`frontend/src/app/pages/asset-aggregator/asset-aggregator-edit-dialog.component.html`:

```html
<h2 mat-dialog-title>
  {{ isNew ? 'Nuovo aggregato immobile' : 'Modifica aggregato immobile: ' + data.item.description }}
</h2>

<mat-dialog-content>
  <form [formGroup]="form" style="display: flex; flex-wrap: wrap; gap: 1rem;">
    <mat-form-field style="flex: 1 1 45%;">
      <mat-label>Codice *</mat-label>
      <input matInput formControlName="code">
      @if (form.controls.code.invalid && form.controls.code.touched) {
        <mat-error>Obbligatorio</mat-error>
      }
    </mat-form-field>

    <mat-form-field style="flex: 1 1 100%;">
      <mat-label>Descrizione *</mat-label>
      <textarea matInput formControlName="description" rows="3"></textarea>
      @if (form.controls.description.invalid && form.controls.description.touched) {
        <mat-error>Obbligatorio</mat-error>
      }
    </mat-form-field>
  </form>
</mat-dialog-content>

<mat-dialog-actions align="end">
  <button mat-stroked-button (click)="cancel()">Annulla</button>
  <button mat-flat-button (click)="save()" [disabled]="!form.valid">Salva</button>
</mat-dialog-actions>
```

- [ ] **Step 3: Creare il dialog filtri**

`frontend/src/app/pages/asset-aggregator/asset-aggregator-filter-dialog.component.ts`:

```typescript
import {Component, inject} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {FilterDialogData} from '../../core/components/abstract-search.component';

interface AssetAggregatorFilterValues {
  code: string | null;
  description: string | null;
}

@Component({
  selector: 'app-asset-aggregator-filter-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Filtri di ricerca</h2>
    <mat-dialog-content>
      <form [formGroup]="form" id="filter-form" (ngSubmit)="apply()" style="display: flex; flex-direction: column; gap: 1rem;">
        <mat-form-field>
          <mat-label>Codice</mat-label>
          <input matInput formControlName="code">
        </mat-form-field>
        <mat-form-field>
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
export class AssetAggregatorFilterDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<AssetAggregatorFilterDialogComponent, AssetAggregatorFilterValues | 'clear'>);
  protected data = inject<FilterDialogData<AssetAggregatorFilterValues>>(MAT_DIALOG_DATA);

  form = this.fb.group({
    code: [this.data.values.code ?? ''],
    description: [this.data.values.description ?? ''],
  });

  apply(): void {
    this.dialogRef.close(this.form.getRawValue());
  }

  clear(): void {
    this.dialogRef.close('clear');
  }
}
```

- [ ] **Step 4: Riscrivere `data-table-asset-aggregator.component.ts`**

```typescript
import {Component, Type} from '@angular/core';
import {CommonModule} from '@angular/common';
import {MatTableModule} from '@angular/material/table';
import {MatSortModule} from '@angular/material/sort';
import {MatPaginatorModule} from '@angular/material/paginator';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';
import {AssetAggregator} from './entity/asset-aggregator.entity';
import {ScreenSizeService} from '../../services/screen-size.service';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {AssetAggregatorEditDialogComponent} from './asset-aggregator-edit-dialog.component';

@Component({
  selector: 'app-data-table-aggregators',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressBarModule,
    HasRoleDirective,
    ReadOnlyDirective
  ],
  templateUrl: './data-table-asset-aggregator.component.html'
})
export class DataTableAggregatorsComponent extends AbstractDataTableComponent<AssetAggregator> {

  displayedColumns = ['actions', 'id', 'code', 'description'];

  constructor(screen: ScreenSizeService) {
    super(screen);
  }

  override itemInstance(): AssetAggregator {
    return AssetAggregator.create();
  }

  override editDialogComponent(): Type<unknown> {
    return AssetAggregatorEditDialogComponent;
  }

  protected override entityLabel(): string {
    return 'aggregato immobile';
  }
}
```

Nota: `AbstractDataTableComponent<T extends {id: any; name?: string}>` usa
`entity.name` nei messaggi generici di `ConfirmDialogComponent` (delete/
restore) — `AssetAggregator` non ha `name`, il messaggio mostrerà solo il testo
fisso (`Elimina aggregato immobile ?`, `name` risulta `undefined` → stringa
vuota, per via di `entity.name ?? ''` già presente in
`abstract-data-table.component.ts`). Per restare fedeli al testo originale
PrimeNG (che mostrava `code`), aggiungere due override dedicati invece di
affidarsi al messaggio generico:

```typescript
  override openDeleteDialog(entity: AssetAggregator): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Elimina aggregato',
        message: `Sei sicuro di voler eliminare l'anagrafica dell'aggregato immobili ${entity.code}?`,
        confirmLabel: 'Elimina',
        danger: true
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onDelete.emit(entity);
    });
  }

  override restoreItem(entity: AssetAggregator): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Ripristina aggregato',
        message: `Riattiva aggregato ${entity.description}?`,
        confirmLabel: 'Ripristina'
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onRestore.emit(entity);
    });
  }
```

Per usare questi override, aggiungere l'import
`import {ConfirmDialogComponent} from '../../core/components/confirm-dialog.component';`
e rendere `openDeleteDialog`/`restoreItem` **non `private`** in
`AbstractDataTableComponent` (verificare: sono già senza modificatore, quindi
`public` di default — nessuna modifica necessaria lì) e aggiungere `override`
davanti a entrambi in questo file.

- [ ] **Step 5: Riscrivere `data-table-asset-aggregator.component.html`**

```html
<div style="display: flex; justify-content: space-between; align-items: center;">
  <h3>Elenco ({{data.length}})</h3>
  <button mat-flat-button (click)="openCreateDialog()" [appHasRole]="['Admin', 'Operatore']">
    <mat-icon>add</mat-icon>
    Aggiungi aggregato
  </button>
</div>

@if (loading) {
  <mat-progress-bar mode="indeterminate"></mat-progress-bar>
}

<table mat-table [dataSource]="dataSource" matSort #sort="matSort" class="mat-elevation-z1">

  <ng-container matColumnDef="actions">
    <th mat-header-cell *matHeaderCellDef>Azioni</th>
    <td mat-cell *matCellDef="let item">
      <button mat-icon-button (click)="openEditDialog(item)" matTooltip="Modifica" aria-label="Modifica"
              [appHasRole]="['Admin', 'Operatore', 'Lettore']">
        <mat-icon>edit</mat-icon>
      </button>
      <button mat-icon-button
              [class.mat-action-success]="item.deleted"
              [class.mat-action-danger]="!item.deleted"
              [matTooltip]="item.deleted ? 'Ripristina' : 'Elimina'"
              [attr.aria-label]="item.deleted ? 'Ripristina' : 'Elimina'"
              (click)="item.deleted ? restoreItem(item) : openDeleteDialog(item)"
              [appHasRole]="['Admin', 'Operatore']">
        <mat-icon>{{ item.deleted ? 'restore' : 'delete' }}</mat-icon>
      </button>
    </td>
  </ng-container>

  <ng-container matColumnDef="id">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>ID</th>
    <td mat-cell *matCellDef="let item">{{ item.id }}</td>
  </ng-container>

  <ng-container matColumnDef="code">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Codice</th>
    <td mat-cell *matCellDef="let item">{{ item.code }}</td>
  </ng-container>

  <ng-container matColumnDef="description">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Descrizione</th>
    <td mat-cell *matCellDef="let item">{{ item.description }}</td>
  </ng-container>

  <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
  <tr mat-row *matRowDef="let row; columns: displayedColumns;" [class.row-deleted]="row.deleted"></tr>

  <tr class="mat-row" *matNoDataRow>
    <td class="mat-cell" [attr.colspan]="displayedColumns.length">Nessun aggregato immobile trovato.</td>
  </tr>
</table>

<mat-paginator #paginator [pageSizeOptions]="rowsPerPageOptions" [pageSize]="10"></mat-paginator>
```

- [ ] **Step 6: Riscrivere `search-asset-aggregator.component.ts`**

```typescript
import {Component} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {Type} from '@angular/core';
import {AbstractSearchComponent} from '../../core/components/abstract-search.component';
import {AssetAggregatorFilterDialogComponent} from './asset-aggregator-filter-dialog.component';

@Component({
  selector: 'app-search-aggregators',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule],
  templateUrl: './search-asset-aggregator.component.html',
})
export class SearchAggregators extends AbstractSearchComponent {

  constructor(private fb: FormBuilder) {
    super();
    this.qSearch = this.fb.group({
      qsearch: [''],
      description: [''],
      code: [''],
    });
  }

  override filterDialogComponent(): Type<unknown> {
    return AssetAggregatorFilterDialogComponent;
  }
}
```

(rimosso `implements OnInit` — `ngOnInit` non è più sovrascritto in nessuna
delle 4 pagine di questo gruppo, l'implementazione ereditata da
`AbstractSearchComponent` basta)

- [ ] **Step 7: Riscrivere `search-asset-aggregator.component.html`**

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

- [ ] **Step 8: Riscrivere `asset-aggregator.component.ts`**

```typescript
import {Component} from '@angular/core';
import {CommonModule} from '@angular/common';
import {DataTableAggregatorsComponent} from './data-table-asset-aggregator.component';
import {SearchAggregators} from './search-asset-aggregator.component';
import {AssetAggregatorsService} from './asset-aggregator.service';
import {AbstractComponent} from '../../core/components/abstract.component';
import {AssetAggregator} from './entity/asset-aggregator.entity';

@Component({
  selector: 'app-asset-aggregators',
  standalone: true,
  imports: [
    CommonModule,
    DataTableAggregatorsComponent,
    SearchAggregators
  ],
  templateUrl: './asset-aggregator.component.html'
})
export class AssetAggregatorsComponent extends AbstractComponent<AssetAggregator> {

  constructor(protected override service: AssetAggregatorsService) {
    super();
    this.qsearchFields = ['description', 'code'];
  }

  protected override getEntityIdentifier(entity: AssetAggregator): string {
    return entity.code ?? '';
  }

  protected override entityToPayload(entity: AssetAggregator): Partial<AssetAggregator> {
    return {
      description: entity.description,
      code: entity.code,
      created_by_user_id: this.userId,
      updated_by_user_id: this.userId
    };
  }
}
```

(rimossi `FormsModule`/`InputTextModule`/`ButtonModule`/`TableModule`/
`MessageService`/`ToastModule`/`providers: [MessageService]` — nessuno usato
nel template del container, `ToastService` è `providedIn: 'root'`, stesso
pattern di `purpose.component.ts` in Fase 1)

- [ ] **Step 9: Riscrivere `asset-aggregator.component.html`**

```html
<div style="padding: 1rem;">
  <div>
    <h1>Aggregati Immobili</h1>
    <p style="color: #6A7282;">Gestisci gli aggregati di immobili</p>
  </div>
  <div style="margin-top: 1rem;">
    <app-search-aggregators (search)="onSearch($event)"></app-search-aggregators>
  </div>
  <div style="margin-top: 1.5rem;">
    <app-data-table-aggregators
      [data]="list"
      [loading]="loading"
      (onSave)="onSave($event)"
      (onDelete)="onDelete($event)"
      (onCreate)="onCreate($event)"
      (onRestore)="onRestore($event)"
      [resetPagingTrigger]="resetPagingCount"
    ></app-data-table-aggregators>
  </div>
</div>
```

- [ ] **Step 10: Verificare compilazione mirata**

```bash
docker exec utenzepa-frontend-1 npx tsc --noEmit -p tsconfig.app.json
```

Zero errori attesi nei file sotto `pages/asset-aggregator/`.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/app/pages/asset-aggregator/
git commit -m "refactor(frontend): migra pagina asset-aggregator a Angular Material"
```

---

### Task 3: Migrare `maintenance-managers`

**Files:**
- Create: `frontend/src/app/pages/maintenance-managers/maintenance-manager-edit-dialog.component.ts` + `.html`
- Create: `frontend/src/app/pages/maintenance-managers/maintenance-manager-filter-dialog.component.ts`
- Modify: `frontend/src/app/pages/maintenance-managers/data-table-maintenance-managers.component.ts` + `.html`
- Modify: `frontend/src/app/pages/maintenance-managers/search-maintenance-managers.component.ts` + `.html`
- Modify: `frontend/src/app/pages/maintenance-managers/maintenance-managers.component.ts` + `.html`

**Interfaces:** stesse di Task 2.

- [ ] **Step 1: Creare il dialog di edit/create**

`frontend/src/app/pages/maintenance-managers/maintenance-manager-edit-dialog.component.ts`:

```typescript
import {Component, inject} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {plainToInstance} from 'class-transformer';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {MaintenanceManager} from './entity/maintenance-manager.entity';

@Component({
  selector: 'app-maintenance-manager-edit-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  templateUrl: './maintenance-manager-edit-dialog.component.html'
})
export class MaintenanceManagerEditDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<MaintenanceManagerEditDialogComponent, MaintenanceManager | undefined>);
  protected data = inject<EditDialogData<MaintenanceManager>>(MAT_DIALOG_DATA);

  isNew = this.data.mode === 'create';

  form = this.fb.group({
    code: [this.data.item.code ?? '', Validators.required],
    description: [this.data.item.description ?? ''],
  });

  save(): void {
    if (!this.form.valid) return;
    const result = plainToInstance(MaintenanceManager, {
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

`frontend/src/app/pages/maintenance-managers/maintenance-manager-edit-dialog.component.html`:

```html
<h2 mat-dialog-title>
  {{ isNew ? 'Nuovo Gestore Manutenzione' : 'Modifica Gestore: ' + data.item.code }}
</h2>

<mat-dialog-content>
  <form [formGroup]="form" style="display: flex; flex-wrap: wrap; gap: 1rem;">
    <mat-form-field style="flex: 1 1 45%;">
      <mat-label>Codice Gestore *</mat-label>
      <input matInput formControlName="code">
      @if (form.controls.code.invalid && form.controls.code.touched) {
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
  <button mat-flat-button (click)="save()" [disabled]="!form.valid">
    {{ isNew ? 'Aggiungi Gestore Manutenzione' : 'Salva Gestore' }}
  </button>
</mat-dialog-actions>
```

- [ ] **Step 3: Creare il dialog filtri**

`frontend/src/app/pages/maintenance-managers/maintenance-manager-filter-dialog.component.ts`:

```typescript
import {Component, inject} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {FilterDialogData} from '../../core/components/abstract-search.component';

interface MaintenanceManagerFilterValues {
  code: string | null;
  description: string | null;
}

@Component({
  selector: 'app-maintenance-manager-filter-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Filtri di ricerca Gestori Manutenzione</h2>
    <mat-dialog-content>
      <form [formGroup]="form" id="filter-form" (ngSubmit)="apply()" style="display: flex; flex-wrap: wrap; gap: 1rem;">
        <mat-form-field style="flex: 1 1 calc(50% - 0.5rem);">
          <mat-label>Codice Gestore</mat-label>
          <input matInput formControlName="code">
        </mat-form-field>
        <mat-form-field style="flex: 1 1 calc(50% - 0.5rem);">
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
export class MaintenanceManagerFilterDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<MaintenanceManagerFilterDialogComponent, MaintenanceManagerFilterValues | 'clear'>);
  protected data = inject<FilterDialogData<MaintenanceManagerFilterValues>>(MAT_DIALOG_DATA);

  form = this.fb.group({
    code: [this.data.values.code ?? ''],
    description: [this.data.values.description ?? ''],
  });

  apply(): void {
    this.dialogRef.close(this.form.getRawValue());
  }

  clear(): void {
    this.dialogRef.close('clear');
  }
}
```

- [ ] **Step 4: Riscrivere `data-table-maintenance-managers.component.ts`**

```typescript
import {Component, Type} from '@angular/core';
import {CommonModule} from '@angular/common';
import {MatTableModule} from '@angular/material/table';
import {MatSortModule} from '@angular/material/sort';
import {MatPaginatorModule} from '@angular/material/paginator';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';
import {ScreenSizeService} from '../../services/screen-size.service';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {MaintenanceManager} from './entity/maintenance-manager.entity';
import {MaintenanceManagerEditDialogComponent} from './maintenance-manager-edit-dialog.component';

@Component({
  selector: 'app-data-table-maintenance-managers',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressBarModule,
    HasRoleDirective,
    ReadOnlyDirective
  ],
  templateUrl: './data-table-maintenance-managers.component.html'
})
export class DataTableMaintenanceManagersComponent extends AbstractDataTableComponent<MaintenanceManager> {

  displayedColumns = ['actions', 'id', 'code', 'description'];

  constructor(screen: ScreenSizeService) {
    super(screen);
  }

  override itemInstance(): MaintenanceManager {
    return MaintenanceManager.create();
  }

  override editDialogComponent(): Type<unknown> {
    return MaintenanceManagerEditDialogComponent;
  }

  protected override entityLabel(): string {
    return 'gestore manutenzione';
  }
}
```

Nota: a differenza di `asset-aggregator`, qui i messaggi generici del
`ConfirmDialogComponent` ereditato (`Elimina gestore manutenzione ?`) sono
sufficientemente vicini all'originale (`Sei sicuro di voler eliminare
l'anagrafica <code>?`) da non giustificare un override dedicato — ma
`MaintenanceManager` non ha `name`, quindi il messaggio generico userà
`entity.name ?? ''` → stringa vuota. Per preservare il testo esatto originale
(che mostrava `code`), applicare lo stesso pattern di override di Task 2:

```typescript
  override openDeleteDialog(entity: MaintenanceManager): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Elimina Gestore',
        message: `Sei sicuro di voler eliminare l'anagrafica ${entity.code}?`,
        confirmLabel: 'Elimina',
        danger: true
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onDelete.emit(entity);
    });
  }

  override restoreItem(entity: MaintenanceManager): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Ripristina Gestore',
        message: `Riattiva Gestore ${entity.code}?`,
        confirmLabel: 'Ripristina'
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onRestore.emit(entity);
    });
  }
```

con `import {ConfirmDialogComponent} from '../../core/components/confirm-dialog.component';`
aggiunto in cima al file.

**Comportamento da preservare (non un bug da correggere qui):** nell'HTML
originale il bottone "Modifica" è nascosto sulle righe eliminate (`@if
(!manager.deleted)` avvolge sia modifica che elimina, mostra solo "Ripristina"
altrimenti) — diverso dal pattern di `purpose`/`asset-aggregator` (dove
"Modifica" resta sempre visibile). Riprodurre esattamente questo comportamento
nel nuovo template Material, non uniformarlo alle altre pagine.

- [ ] **Step 5: Riscrivere `data-table-maintenance-managers.component.html`**

```html
<div style="display: flex; justify-content: space-between; align-items: center;">
  <h3>Elenco ({{ data.length }})</h3>
  <button mat-flat-button (click)="openCreateDialog()" [appHasRole]="['Admin', 'Operatore']">
    <mat-icon>add</mat-icon>
    Aggiungi Gestore
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
        <button mat-icon-button (click)="openEditDialog(item)" matTooltip="Modifica" aria-label="Modifica"
                [appHasRole]="['Admin', 'Operatore', 'Lettore']">
          <mat-icon>edit</mat-icon>
        </button>
        <button mat-icon-button class="mat-action-danger" (click)="openDeleteDialog(item)"
                matTooltip="Elimina" aria-label="Elimina" [appHasRole]="['Admin', 'Operatore']">
          <mat-icon>delete</mat-icon>
        </button>
      } @else {
        <button mat-icon-button class="mat-action-success" (click)="restoreItem(item)"
                matTooltip="Ripristina" aria-label="Ripristina" [appHasRole]="['Admin', 'Operatore']">
          <mat-icon>restore</mat-icon>
        </button>
      }
    </td>
  </ng-container>

  <ng-container matColumnDef="id">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>ID</th>
    <td mat-cell *matCellDef="let item">{{ item.id }}</td>
  </ng-container>

  <ng-container matColumnDef="code">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Codice Gestore</th>
    <td mat-cell *matCellDef="let item">{{ item.code }}</td>
  </ng-container>

  <ng-container matColumnDef="description">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Descrizione</th>
    <td mat-cell *matCellDef="let item">{{ item.description }}</td>
  </ng-container>

  <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
  <tr mat-row *matRowDef="let row; columns: displayedColumns;" [class.row-deleted]="row.deleted"></tr>

  <tr class="mat-row" *matNoDataRow>
    <td class="mat-cell" [attr.colspan]="displayedColumns.length">Nessun gestore manutenzione trovato.</td>
  </tr>
</table>

<mat-paginator #paginator [pageSizeOptions]="rowsPerPageOptions" [pageSize]="10"></mat-paginator>
```

(il blocco `<style>` locale con `.row-deleted`/`.action-button` del file
PrimeNG originale non serve più: `.row-deleted` è già definita globalmente in
`frontend/src/styles.scss`, applicata da Fase 1 su `purpose` con lo stesso
selettore di classe; le icon-button Material non necessitano di
`.action-button` per il padding)

- [ ] **Step 6: Riscrivere `search-maintenance-managers.component.ts`**

```typescript
import {Component, Type} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {AbstractSearchComponent} from '../../core/components/abstract-search.component';
import {MaintenanceManagerFilterDialogComponent} from './maintenance-manager-filter-dialog.component';

@Component({
  selector: 'app-search-maintenance-managers',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule],
  templateUrl: './search-maintenance-managers.component.html',
})
export class SearchFormMaintenanceManagers extends AbstractSearchComponent {

  constructor(private fb: FormBuilder) {
    super();
    this.qSearch = this.fb.group({
      qsearch: [''],
      code: [''],
      description: [''],
    });
  }

  override filterDialogComponent(): Type<unknown> {
    return MaintenanceManagerFilterDialogComponent;
  }
}
```

- [ ] **Step 7: Riscrivere `search-maintenance-managers.component.html`**

```html
<div [formGroup]="qSearch" style="display: flex; align-items: center; gap: 0.5rem;">
  <mat-form-field style="flex: 1;" subscriptSizing="dynamic">
    <input matInput placeholder="Cerca per codice o descrizione..." formControlName="qsearch" (keyup.enter)="onQuickSearch()">
  </mat-form-field>

  <button mat-stroked-button (click)="openFilterDialog()" style="height: 3.5rem;">
    <mat-icon>filter_list</mat-icon>
    Filtri
  </button>
</div>
```

- [ ] **Step 8: Riscrivere `maintenance-managers.component.ts`**

```typescript
import {Component} from '@angular/core';
import {CommonModule} from '@angular/common';
import {MaintenanceManagersService} from './maintenance-managers.service';
import {DataTableMaintenanceManagersComponent} from './data-table-maintenance-managers.component';
import {SearchFormMaintenanceManagers} from './search-maintenance-managers.component';
import {AbstractComponent} from '../../core/components/abstract.component';
import {MaintenanceManager} from './entity/maintenance-manager.entity';

@Component({
  selector: 'app-maintenance-managers',
  standalone: true,
  imports: [
    CommonModule,
    DataTableMaintenanceManagersComponent,
    SearchFormMaintenanceManagers
  ],
  templateUrl: './maintenance-managers.component.html'
})
export class MaintenanceManagersComponent extends AbstractComponent<MaintenanceManager> {

  constructor(protected override service: MaintenanceManagersService) {
    super();
  }

  protected override getEntityIdentifier(entity: MaintenanceManager): string {
    return entity.code;
  }

  protected override entityToPayload(entity: MaintenanceManager): Partial<MaintenanceManager> {
    return {
      code: entity.code,
      description: entity.description,
      created_by_user_id: this.userId,
      updated_by_user_id: this.userId
    };
  }
}
```

(rimossi `creationResult` e l'override di `onCreate` che lo valorizzava — Fase 1
ha già rimosso l'`@Input creationResult` da `AbstractDataTableComponent`
[finding M2 della review finale]; questo override qui non serviva più a nulla
oltre a valorizzare quel binding morto, la creazione passa dall'`onCreate`
ereditato da `AbstractComponent`, identico nel comportamento verso il servizio)

- [ ] **Step 9: Riscrivere `maintenance-managers.component.html`**

```html
<div style="padding: 1rem;">
  <div>
    <h1>Gestori Manutenzione</h1>
    <p style="color: #6A7282;">Gestisci le anagrafiche dei gestori di manutenzione</p>
  </div>
  <div style="margin-top: 1rem;">
    <app-search-maintenance-managers (search)="onSearch($event)"></app-search-maintenance-managers>
  </div>
  <div style="margin-top: 1.5rem;">
    <app-data-table-maintenance-managers
      [data]="list"
      [loading]="loading"
      (onSave)="onSave($event)"
      (onDelete)="onDelete($event)"
      (onCreate)="onCreate($event)"
      (onRestore)="onRestore($event)"
      [resetPagingTrigger]="resetPagingCount"
    ></app-data-table-maintenance-managers>
  </div>
</div>
```

(rimosso `[creationResult]="creationResult"` — coerente con lo Step 8)

- [ ] **Step 10: Verificare compilazione mirata**

```bash
docker exec utenzepa-frontend-1 npx tsc --noEmit -p tsconfig.app.json
```

Zero errori attesi nei file sotto `pages/maintenance-managers/`.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/app/pages/maintenance-managers/
git commit -m "refactor(frontend): migra pagina maintenance-managers a Angular Material"
```

---

### Task 4: Migrare `utility-aggregator`

**Files:**
- Create: `frontend/src/app/pages/utility-aggregator/utility-aggregator-edit-dialog.component.ts` + `.html`
- Create: `frontend/src/app/pages/utility-aggregator/utility-aggregator-filter-dialog.component.ts`
- Modify: `frontend/src/app/pages/utility-aggregator/data-table-utility-aggregator.component.ts` + `.html`
- Modify: `frontend/src/app/pages/utility-aggregator/search-utility-aggregator.component.ts` + `.html`
- Modify: `frontend/src/app/pages/utility-aggregator/utility-aggregator.component.ts` + `.html`

**Interfaces:** stesse di Task 2/3.

Struttura identica a `maintenance-managers` (Task 3): stesso schema campi
(`code` required, `description` opzionale), stesso pattern "Modifica" nascosto
su riga eliminata, stesso blocco `<style>` locale da rimuovere (già coperto
globalmente da `styles.scss`).

- [ ] **Step 1: Creare il dialog di edit/create**

`frontend/src/app/pages/utility-aggregator/utility-aggregator-edit-dialog.component.ts`:

```typescript
import {Component, inject} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {plainToInstance} from 'class-transformer';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {UtilityAggregator} from './entity/utility-aggregator.entity';

@Component({
  selector: 'app-utility-aggregator-edit-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  templateUrl: './utility-aggregator-edit-dialog.component.html'
})
export class UtilityAggregatorEditDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<UtilityAggregatorEditDialogComponent, UtilityAggregator | undefined>);
  protected data = inject<EditDialogData<UtilityAggregator>>(MAT_DIALOG_DATA);

  isNew = this.data.mode === 'create';

  form = this.fb.group({
    code: [this.data.item.code ?? '', Validators.required],
    description: [this.data.item.description ?? ''],
  });

  save(): void {
    if (!this.form.valid) return;
    const result = plainToInstance(UtilityAggregator, {
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

`frontend/src/app/pages/utility-aggregator/utility-aggregator-edit-dialog.component.html`:

```html
<h2 mat-dialog-title>
  {{ isNew ? 'Nuovo Aggregato Utenza' : 'Modifica Aggregato Utenza: ' + data.item.code }}
</h2>

<mat-dialog-content>
  <form [formGroup]="form" style="display: flex; flex-wrap: wrap; gap: 1rem;">
    <mat-form-field style="flex: 1 1 45%;">
      <mat-label>Codice *</mat-label>
      <input matInput formControlName="code">
      @if (form.controls.code.invalid && form.controls.code.touched) {
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
  <button mat-flat-button (click)="save()" [disabled]="!form.valid">Salva</button>
</mat-dialog-actions>
```

- [ ] **Step 3: Creare il dialog filtri**

`frontend/src/app/pages/utility-aggregator/utility-aggregator-filter-dialog.component.ts`:

```typescript
import {Component, inject} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {FilterDialogData} from '../../core/components/abstract-search.component';

interface UtilityAggregatorFilterValues {
  code: string | null;
  description: string | null;
}

@Component({
  selector: 'app-utility-aggregator-filter-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Filtri di ricerca Aggregato Utenza</h2>
    <mat-dialog-content>
      <form [formGroup]="form" id="filter-form" (ngSubmit)="apply()" style="display: flex; flex-direction: column; gap: 1rem;">
        <mat-form-field>
          <mat-label>Codice</mat-label>
          <input matInput formControlName="code">
        </mat-form-field>
        <mat-form-field>
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
export class UtilityAggregatorFilterDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<UtilityAggregatorFilterDialogComponent, UtilityAggregatorFilterValues | 'clear'>);
  protected data = inject<FilterDialogData<UtilityAggregatorFilterValues>>(MAT_DIALOG_DATA);

  form = this.fb.group({
    code: [this.data.values.code ?? ''],
    description: [this.data.values.description ?? ''],
  });

  apply(): void {
    this.dialogRef.close(this.form.getRawValue());
  }

  clear(): void {
    this.dialogRef.close('clear');
  }
}
```

(il campo `deleted` presente nel `FormGroup` originale di
`search-utility-aggregator.component.ts` non è mai stato renderizzato
nell'HTML — dead field, non riportarlo nel dialog filtri)

- [ ] **Step 4: Riscrivere `data-table-utility-aggregator.component.ts`**

```typescript
import {Component, Type} from '@angular/core';
import {CommonModule} from '@angular/common';
import {MatTableModule} from '@angular/material/table';
import {MatSortModule} from '@angular/material/sort';
import {MatPaginatorModule} from '@angular/material/paginator';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';
import {ScreenSizeService} from '../../services/screen-size.service';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {ConfirmDialogComponent} from '../../core/components/confirm-dialog.component';
import {UtilityAggregator} from './entity/utility-aggregator.entity';
import {UtilityAggregatorEditDialogComponent} from './utility-aggregator-edit-dialog.component';

@Component({
  selector: 'app-data-table-utility-aggregators',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressBarModule,
    HasRoleDirective,
    ReadOnlyDirective
  ],
  templateUrl: './data-table-utility-aggregator.component.html'
})
export class DataTableUtilityAggregatorsComponent extends AbstractDataTableComponent<UtilityAggregator> {

  displayedColumns = ['actions', 'id', 'code', 'description'];

  constructor(screen: ScreenSizeService) {
    super(screen);
  }

  override itemInstance(): UtilityAggregator {
    return UtilityAggregator.create();
  }

  override editDialogComponent(): Type<unknown> {
    return UtilityAggregatorEditDialogComponent;
  }

  protected override entityLabel(): string {
    return 'aggregato utenza';
  }

  override openDeleteDialog(entity: UtilityAggregator): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Elimina Aggregato Utenza',
        message: `Sei sicuro di voler eliminare l'anagrafica ${entity.code}?`,
        confirmLabel: 'Elimina',
        danger: true
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onDelete.emit(entity);
    });
  }

  override restoreItem(entity: UtilityAggregator): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Ripristina Aggregato Utenza',
        message: `Riattiva Aggregato Utenza ${entity.code}?`,
        confirmLabel: 'Ripristina'
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onRestore.emit(entity);
    });
  }
}
```

- [ ] **Step 5: Riscrivere `data-table-utility-aggregator.component.html`**

```html
<div style="display: flex; justify-content: space-between; align-items: center;">
  <h3>Elenco ({{ data.length }})</h3>
  <button mat-flat-button (click)="openCreateDialog()" [appHasRole]="['Admin', 'Operatore']">
    <mat-icon>add</mat-icon>
    Aggiungi Aggregato Utenza
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
        <button mat-icon-button (click)="openEditDialog(item)" matTooltip="Modifica" aria-label="Modifica"
                [appHasRole]="['Admin', 'Operatore', 'Lettore']">
          <mat-icon>edit</mat-icon>
        </button>
        <button mat-icon-button class="mat-action-danger" (click)="openDeleteDialog(item)"
                matTooltip="Elimina" aria-label="Elimina" [appHasRole]="['Admin', 'Operatore']">
          <mat-icon>delete</mat-icon>
        </button>
      } @else {
        <button mat-icon-button class="mat-action-success" (click)="restoreItem(item)"
                matTooltip="Ripristina" aria-label="Ripristina" [appHasRole]="['Admin', 'Operatore']">
          <mat-icon>restore</mat-icon>
        </button>
      }
    </td>
  </ng-container>

  <ng-container matColumnDef="id">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>ID</th>
    <td mat-cell *matCellDef="let item">{{ item.id }}</td>
  </ng-container>

  <ng-container matColumnDef="code">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Codice</th>
    <td mat-cell *matCellDef="let item">{{ item.code }}</td>
  </ng-container>

  <ng-container matColumnDef="description">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Descrizione</th>
    <td mat-cell *matCellDef="let item">{{ item.description }}</td>
  </ng-container>

  <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
  <tr mat-row *matRowDef="let row; columns: displayedColumns;" [class.row-deleted]="row.deleted"></tr>

  <tr class="mat-row" *matNoDataRow>
    <td class="mat-cell" [attr.colspan]="displayedColumns.length">Nessun aggregato utenza trovato.</td>
  </tr>
</table>

<mat-paginator #paginator [pageSizeOptions]="rowsPerPageOptions" [pageSize]="10"></mat-paginator>
```

- [ ] **Step 6: Riscrivere `search-utility-aggregator.component.ts`**

```typescript
import {Component, Type} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {AbstractSearchComponent} from '../../core/components/abstract-search.component';
import {UtilityAggregatorFilterDialogComponent} from './utility-aggregator-filter-dialog.component';

@Component({
  selector: 'app-search-utility-aggregators',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule],
  templateUrl: './search-utility-aggregator.component.html',
})
export class SearchUtilityAggregators extends AbstractSearchComponent {

  constructor(private fb: FormBuilder) {
    super();
    this.qSearch = this.fb.group({
      qsearch: [''],
      code: [''],
      description: [''],
    });
  }

  override filterDialogComponent(): Type<unknown> {
    return UtilityAggregatorFilterDialogComponent;
  }
}
```

(rimosso il controllo `deleted: [null]` mai renderizzato)

- [ ] **Step 7: Riscrivere `search-utility-aggregator.component.html`**

```html
<div [formGroup]="qSearch" style="display: flex; align-items: center; gap: 0.5rem;">
  <mat-form-field style="flex: 1;" subscriptSizing="dynamic">
    <input matInput placeholder="Cerca per codice o descrizione..." formControlName="qsearch" (keyup.enter)="onQuickSearch()">
  </mat-form-field>

  <button mat-stroked-button (click)="openFilterDialog()" style="height: 3.5rem;">
    <mat-icon>filter_list</mat-icon>
    Filtri
  </button>
</div>
```

- [ ] **Step 8: Riscrivere `utility-aggregator.component.ts`**

```typescript
import {Component} from '@angular/core';
import {CommonModule} from '@angular/common';
import {UtilityAggregatorsService} from './utility-aggregator.service';
import {DataTableUtilityAggregatorsComponent} from './data-table-utility-aggregator.component';
import {SearchUtilityAggregators} from './search-utility-aggregator.component';
import {UtilityAggregator} from './entity/utility-aggregator.entity';
import {AbstractComponent} from '../../core/components/abstract.component';

@Component({
  selector: 'app-utility-aggregators',
  standalone: true,
  imports: [
    CommonModule,
    DataTableUtilityAggregatorsComponent,
    SearchUtilityAggregators
  ],
  templateUrl: './utility-aggregator.component.html'
})
export class UtilityAggregatorsComponent extends AbstractComponent<UtilityAggregator> {

  constructor(protected override service: UtilityAggregatorsService) {
    super();
  }

  protected override getEntityIdentifier(entity: UtilityAggregator): string {
    return entity.code;
  }
}
```

(rimossi `creationResult` e l'override di `onCreate` — stesso motivo di Task 3
Step 8; `entityToPayload` non era overridden qui, resta il default ereditato)

- [ ] **Step 9: Riscrivere `utility-aggregator.component.html`**

```html
<div style="padding: 1rem;">
  <div>
    <h1>Aggregati utenze</h1>
    <p style="color: #6A7282;">Gestisci gli aggregati di utenza</p>
  </div>
  <div style="margin-top: 1rem;">
    <app-search-utility-aggregators (search)="onSearch($event)"></app-search-utility-aggregators>
  </div>
  <div style="margin-top: 1.5rem;">
    <app-data-table-utility-aggregators
      [data]="list"
      [loading]="loading"
      (onSave)="onSave($event)"
      (onDelete)="onDelete($event)"
      (onCreate)="onCreate($event)"
      (onRestore)="onRestore($event)"
      [resetPagingTrigger]="resetPagingCount"
    ></app-data-table-utility-aggregators>
  </div>
</div>
```

- [ ] **Step 10: Verificare compilazione mirata**

```bash
docker exec utenzepa-frontend-1 npx tsc --noEmit -p tsconfig.app.json
```

Zero errori attesi nei file sotto `pages/utility-aggregator/`.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/app/pages/utility-aggregator/
git commit -m "refactor(frontend): migra pagina utility-aggregator a Angular Material"
```

---

### Task 5: Migrare `utilizer` (+ pulizia dead code)

**Files:**
- Create: `frontend/src/app/pages/utilizer/utilizer-edit-dialog.component.ts` + `.html`
- Create: `frontend/src/app/pages/utilizer/utilizer-filter-dialog.component.ts`
- Modify: `frontend/src/app/pages/utilizer/data-table-utilizer.component.ts` + `.html`
- Modify: `frontend/src/app/pages/utilizer/search-utilizer.component.ts` + `.html`
- Modify: `frontend/src/app/pages/utilizer/utilizer.component.ts` + `.html`

**Interfaces:** stesse di Task 2/3/4.

Pulizia da fare in questo task (identificata dalla ricognizione, non correlata
a Material ma colta nel passaggio): import PrimeNG morti
(`InputNumberModule`, `CheckboxModule`, `DatePickerModule`, `RadioButtonModule`
in data-table e search), interfaccia `AssetOption` mai usata in
`data-table-utilizer.component.ts`, override `ngOnInit()` vuoto/ridondante (sia
in data-table sia in search) che chiama solo `super.ngOnInit()`, blocco
`entityToPayload` commentato in `utilizer.component.ts`, selettore
`app-utilizer-grant` (refuso copia-incolla, non corrisponde al componente) da
correggere in `app-utilizer`.

- [ ] **Step 1: Creare il dialog di edit/create**

`frontend/src/app/pages/utilizer/utilizer-edit-dialog.component.ts`:

```typescript
import {Component, inject} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {plainToInstance} from 'class-transformer';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {Utilizer} from './entity/utilizer.entity';

@Component({
  selector: 'app-utilizer-edit-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  templateUrl: './utilizer-edit-dialog.component.html'
})
export class UtilizerEditDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<UtilizerEditDialogComponent, Utilizer | undefined>);
  protected data = inject<EditDialogData<Utilizer>>(MAT_DIALOG_DATA);

  isNew = this.data.mode === 'create';

  form = this.fb.group({
    name: [this.data.item.name ?? '', Validators.required],
    description: [this.data.item.description ?? null],
  });

  save(): void {
    if (!this.form.valid) return;
    const result = plainToInstance(Utilizer, {
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

`frontend/src/app/pages/utilizer/utilizer-edit-dialog.component.html`:

```html
<h2 mat-dialog-title>
  {{ isNew ? 'Aggiungi Utilizzatore' : 'Modifica Utilizzatore: ' + data.item.name }}
</h2>

<mat-dialog-content>
  <form [formGroup]="form" style="display: flex; flex-direction: column; gap: 1rem;">
    <mat-form-field>
      <mat-label>Utilizzatore *</mat-label>
      <input matInput formControlName="name" placeholder="Nome dell'utilizzatore">
      @if (form.controls.name.invalid && form.controls.name.touched) {
        <mat-error>Obbligatorio</mat-error>
      }
    </mat-form-field>

    <mat-form-field>
      <mat-label>Descrizione</mat-label>
      <textarea matInput formControlName="description" rows="4" placeholder="Descrizione"></textarea>
    </mat-form-field>
  </form>
</mat-dialog-content>

<mat-dialog-actions align="end">
  <button mat-stroked-button (click)="cancel()">Annulla</button>
  <button mat-flat-button (click)="save()" [disabled]="!form.valid">Salva Utilizzatore</button>
</mat-dialog-actions>
```

- [ ] **Step 3: Creare il dialog filtri**

`frontend/src/app/pages/utilizer/utilizer-filter-dialog.component.ts`:

```typescript
import {Component, inject} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {FilterDialogData} from '../../core/components/abstract-search.component';

interface UtilizerFilterValues {
  name: string | null;
  description: string | null;
}

@Component({
  selector: 'app-utilizer-filter-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Filtri Avanzati Utilizzatore</h2>
    <mat-dialog-content>
      <form [formGroup]="form" id="filter-form" (ngSubmit)="apply()" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <mat-form-field>
          <mat-label>Nome</mat-label>
          <input matInput formControlName="name">
        </mat-form-field>
        <mat-form-field>
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
export class UtilizerFilterDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<UtilizerFilterDialogComponent, UtilizerFilterValues | 'clear'>);
  protected data = inject<FilterDialogData<UtilizerFilterValues>>(MAT_DIALOG_DATA);

  form = this.fb.group({
    name: [this.data.values.name ?? ''],
    description: [this.data.values.description ?? ''],
  });

  apply(): void {
    this.dialogRef.close(this.form.getRawValue());
  }

  clear(): void {
    this.dialogRef.close('clear');
  }
}
```

(campo `deleted` del `FormGroup` originale mai renderizzato, non riportato,
stesso trattamento di Task 4)

- [ ] **Step 4: Riscrivere `data-table-utilizer.component.ts`**

```typescript
import {Component, Type} from '@angular/core';
import {CommonModule} from '@angular/common';
import {MatTableModule} from '@angular/material/table';
import {MatSortModule} from '@angular/material/sort';
import {MatPaginatorModule} from '@angular/material/paginator';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';
import {Utilizer} from './entity/utilizer.entity';
import {ScreenSizeService} from '../../services/screen-size.service';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {UtilizerEditDialogComponent} from './utilizer-edit-dialog.component';

@Component({
  selector: 'app-data-table-utilizer',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressBarModule,
    HasRoleDirective,
    ReadOnlyDirective
  ],
  templateUrl: './data-table-utilizer.component.html',
})
export class DataTableUtilizerComponent extends AbstractDataTableComponent<Utilizer> {

  displayedColumns = ['actions', 'id', 'name', 'description'];

  constructor(screen: ScreenSizeService) {
    super(screen);
  }

  override itemInstance(): Utilizer {
    return Utilizer.create();
  }

  override editDialogComponent(): Type<unknown> {
    return UtilizerEditDialogComponent;
  }

  protected override entityLabel(): string {
    return 'utilizzatore';
  }
}
```

(rimossi: interfaccia `AssetOption` mai usata, override vuoto `ngOnInit()`
[l'implementazione ereditata da `AbstractDataTableComponent` basta, non c'è
nulla da aggiungere sopra `super.ngOnInit()`]; `Utilizer` ha `name`, quindi i
messaggi generici ereditati del `ConfirmDialogComponent` — `Elimina
utilizzatore <name>?`/`Ripristina utilizzatore <name>?` — sono già coerenti col
testo originale [`Sei sicuro di voler eliminare l'Utilizzatore <name>?`/
`Riattiva Utilizzatore <name>?`], non serve override dedicato qui a differenza
di Task 2/3/4)

- [ ] **Step 5: Riscrivere `data-table-utilizer.component.html`**

```html
<div style="display: flex; justify-content: space-between; align-items: center;">
  <h3>Elenco ({{ data.length }})</h3>
  <button mat-flat-button (click)="openCreateDialog()" [appHasRole]="['Admin', 'Operatore']">
    <mat-icon>add</mat-icon>
    Aggiungi Utilizzatore
  </button>
</div>

@if (loading) {
  <mat-progress-bar mode="indeterminate"></mat-progress-bar>
}

<table mat-table [dataSource]="dataSource" matSort #sort="matSort" class="mat-elevation-z1">

  <ng-container matColumnDef="actions">
    <th mat-header-cell *matHeaderCellDef>Azioni</th>
    <td mat-cell *matCellDef="let item">
      <button mat-icon-button (click)="openEditDialog(item)" matTooltip="Modifica" aria-label="Modifica"
              [appHasRole]="['Admin', 'Operatore', 'Lettore']">
        <mat-icon>edit</mat-icon>
      </button>
      <button mat-icon-button
              [class.mat-action-success]="item.deleted"
              [class.mat-action-danger]="!item.deleted"
              [matTooltip]="item.deleted ? 'Ripristina' : 'Elimina'"
              [attr.aria-label]="item.deleted ? 'Ripristina' : 'Elimina'"
              (click)="item.deleted ? restoreItem(item) : openDeleteDialog(item)"
              [appHasRole]="['Admin', 'Operatore']">
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

  <ng-container matColumnDef="description">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Descrizione</th>
    <td mat-cell *matCellDef="let item">{{ item.description }}</td>
  </ng-container>

  <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
  <tr mat-row *matRowDef="let row; columns: displayedColumns;" [class.row-deleted]="row.deleted"></tr>

  <tr class="mat-row" *matNoDataRow>
    <td class="mat-cell" [attr.colspan]="displayedColumns.length">Nessun utilizzatore trovato.</td>
  </tr>
</table>

<mat-paginator #paginator [pageSizeOptions]="rowsPerPageOptions" [pageSize]="10"></mat-paginator>
```

- [ ] **Step 6: Riscrivere `search-utilizer.component.ts`**

```typescript
import {Component, Type} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {AbstractSearchComponent} from '../../core/components/abstract-search.component';
import {UtilizerFilterDialogComponent} from './utilizer-filter-dialog.component';

@Component({
  selector: 'app-search-utilizer',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule],
  templateUrl: './search-utilizer.component.html',
})
export class SearchUtilizerComponent extends AbstractSearchComponent {

  constructor(private fb: FormBuilder) {
    super();
    this.qSearch = this.fb.group({
      qsearch: [''],
      name: [''],
      description: [''],
    });
  }

  override filterDialogComponent(): Type<unknown> {
    return UtilizerFilterDialogComponent;
  }
}
```

(rimossi: import PrimeNG morti `InputNumberModule`/`RadioButtonModule`/
`DatePickerModule` mai usati nell'HTML originale, override vuoto `ngOnInit()`,
campo `deleted: [null]` mai renderizzato)

- [ ] **Step 7: Riscrivere `search-utilizer.component.html`**

```html
<div [formGroup]="qSearch" style="display: flex; align-items: center; gap: 0.5rem;">
  <mat-form-field style="flex: 1;" subscriptSizing="dynamic">
    <input matInput placeholder="Cerca ..." formControlName="qsearch" (keyup.enter)="onQuickSearch()">
  </mat-form-field>

  <button mat-stroked-button (click)="openFilterDialog()" style="height: 3.5rem;">
    <mat-icon>filter_list</mat-icon>
    Filtri
  </button>
</div>
```

- [ ] **Step 8: Riscrivere `utilizer.component.ts`**

```typescript
import {Component} from '@angular/core';
import {CommonModule} from '@angular/common';
import {AbstractComponent} from '../../core/components/abstract.component';
import {Utilizer} from './entity/utilizer.entity';
import {UtilizerService} from './utilizer.service';
import {DataTableUtilizerComponent} from './data-table-utilizer.component';
import {SearchUtilizerComponent} from './search-utilizer.component';

@Component({
  selector: 'app-utilizer',
  standalone: true,
  imports: [
    CommonModule,
    DataTableUtilizerComponent,
    SearchUtilizerComponent,
  ],
  templateUrl: './utilizer.component.html',
})
export class UtilizerComponent extends AbstractComponent<Utilizer> {

  constructor(protected override service: UtilizerService) {
    super();
    this.qsearchFields = ['name', 'description'];
  }

  protected override getEntityIdentifier(entity: Utilizer): string {
    return entity.name ?? '';
  }
}
```

(corretto il selettore `app-utilizer-grant` → `app-utilizer`, refuso
copia-incolla non correlato a nessun'altra pagina — verificato che
`app-utilizer-grant` non sia referenziato da nessun template, la correzione è
sicura; rimosso il blocco `entityToPayload` commentato; rimossi `creationResult`
e l'override di `onCreate` che lo valorizzava, stesso motivo di Task 3/4 —
`AbstractComponent.entityToPayload` di default fa spread dell'intera entità più
`created_by_user_id`/`updated_by_user_id`, comportamento equivalente per
`Utilizer` che ha solo `name`/`description` oltre ai campi base)

- [ ] **Step 9: Riscrivere `utilizer.component.html`**

```html
<div style="padding: 1rem;">
  <div>
    <h1>Utilizzatori</h1>
    <p style="color: #6A7282;">Gestisci gli utilizzatori.</p>
  </div>
  <div style="margin-top: 1rem;">
    <app-search-utilizer (search)="onSearch($event)"></app-search-utilizer>
  </div>
  <div style="margin-top: 1.5rem;">
    <app-data-table-utilizer
      [data]="list"
      [loading]="loading"
      (onSave)="onSave($event)"
      (onDelete)="onDelete($event)"
      (onCreate)="onCreate($event)"
      (onRestore)="onRestore($event)"
      [resetPagingTrigger]="resetPagingCount"
    ></app-data-table-utilizer>
  </div>
</div>
```

- [ ] **Step 10: Verificare compilazione mirata**

```bash
docker exec utenzepa-frontend-1 npx tsc --noEmit -p tsconfig.app.json
```

Zero errori attesi nei file sotto `pages/utilizer/`.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/app/pages/utilizer/
git commit -m "refactor(frontend): migra pagina utilizer a Angular Material, pulisci dead code"
```

---

### Task 6: QA manuale delle 4 pagine del Gruppo A

**Files:** nessuno (verifica manuale)

- [ ] **Step 1: Stub temporaneo per rendere l'app compilabile in isolamento**

Stesso approccio usato in Fase 1 (Task 9 del piano `purpose`, non committato):
aggiungere temporaneamente a `tsconfig.app.json` → `exclude` le cartelle delle
9 pagine dei Gruppi B-E ancora non migrate (`budget-chapters`, `suppliers`,
`system-users`, `utility-types`, `consip-agreement`, `utilizer-grant`,
`assets`, `invoices`, `utilities`), e ridurre temporaneamente
`app.routes.ts` alle sole route `dashboard`, `login`, `setup` + le 4 pagine di
questo gruppo (`asset-aggregator` → path esistente nel router attuale, `building`
NON è `assets` quindi non tocca questo gruppo, `utilities` NON incluso,
`maintenance-managers`, `utility-aggregator` → verificare il path esatto nel
router — oggi `utility-aggregator`, `utilizer`). Ripristinare entrambi i file
(`git checkout --`) a fine QA, **non committare** questi file temporanei.

- [ ] **Step 2: Avviare il frontend e fare login**

```bash
docker compose up -d
```

Login con un utente esistente (Admin) sull'ambiente dev.

- [ ] **Step 3: Checklist per ciascuna delle 4 pagine** (`asset-aggregator`,
  `maintenance-managers`, `utility-aggregator`, `utilizer`)

- [ ] La lista carica ed elenca gli elementi esistenti
- [ ] Ricerca rapida (campo "Cerca...") filtra correttamente
- [ ] Dialog filtri si apre, applica filtro, "Pulisci Filtri" resetta E
      applica subito la ricerca vuota (verifica il fix del pattern
      `openFilterDialog`/Task 1 — chiudere il dialog con ESC dopo aver
      modificato un campo NON deve lasciare il filtro "fantasma" applicato al
      successivo giro, a differenza del comportamento pre-Task 1)
- [ ] "Aggiungi" apre il dialog di creazione, validazione required, salvataggio
      crea la riga e mostra lo snackbar di conferma
- [ ] Modifica riga esistente apre il dialog precompilato, salva aggiorna la riga
- [ ] Elimina riga apre `ConfirmDialogComponent` col messaggio corretto per
      quella pagina (verificare il testo esatto per `asset-aggregator`/
      `maintenance-managers`/`utility-aggregator`, che usano l'override
      dedicato del Task 2/3/4), conferma elimina
- [ ] Ripristina riga eliminata apre `ConfirmDialogComponent`, conferma ripristina
- [ ] Su `maintenance-managers`/`utility-aggregator`: verificare che il bottone
      "Modifica" sia **nascosto** sulle righe eliminate (comportamento
      preservato, diverso da `asset-aggregator`/`utilizer` dove resta visibile)
- [ ] Sort per colonna e paginazione funzionano
- [ ] Icone Material visibili correttamente (font già caricato da Fase 1),
      nessun residuo di stile PrimeNG

- [ ] **Step 4: Ripristinare `tsconfig.app.json`/`app.routes.ts`**

```bash
git checkout -- frontend/tsconfig.app.json frontend/src/app/app.routes.ts
```

Verificare `git status` pulito prima di procedere oltre.

- [ ] **Step 5: Annotare eventuali problemi trovati e correggerli prima di
  considerare il Gruppo A concluso**

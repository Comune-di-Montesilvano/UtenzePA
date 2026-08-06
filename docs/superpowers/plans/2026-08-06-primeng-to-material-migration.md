# Migrazione PrimeNG → Angular Material (Fase 1: infra + pagina pilota `purpose`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Installare Angular Material/CDK, rifattorizzare i due componenti astratti condivisi
(`AbstractComponent`, `AbstractDataTableComponent`) da PrimeNG a Material, e migrare
completamente la pagina pilota `purpose` come pattern di riferimento — senza toccare
Angular (resta 20.x) né rimuovere ancora `primeng` da `package.json` (le altre 15
pagine lo usano ancora).

**Architecture:** `MatSnackBar` dietro un `ToastService` con firma compatibile a
`MessageService.add()` di PrimeNG (zero modifiche nelle pagine non ancora migrate).
`MatTableDataSource` + `MatSort` + `MatPaginator` sostituiscono `p-table`
(paginazione/sort client-side, dati già tutti caricati come oggi). I tre dialog
per-entità (`p-dialog [(visible)]`) diventano: un `ConfirmDialogComponent`
generico e riusabile per delete/restore (stesso identico markup su tutte le 16
pagine, solo titolo/messaggio cambiano) aperto via `MatDialog`, e un dialog di
edit specifico per entità (form diverso per pagina) anch'esso aperto via
`MatDialog` invece di essere inline nel template della data-table.

**Tech Stack:** Angular 20.3 (invariato in questa fase), `@angular/material` +
`@angular/cdk` (stessa major, `^20.x`), RxJS 7.8, Karma/Jasmine per i test.

## Global Constraints

- Angular resta `^20.3.0` in questa fase — il bump a 22 è fuori scope (richiede
  PrimeNG rimosso da **tutte** le pagine, non solo `purpose`; vedi spec, sezione
  "Contesto e motivazione").
- `primeng`, `@primeuix/themes`, `primeicons` restano installati e funzionanti per
  le altre 15 pagine — non rimuovere da `package.json` in questa fase.
- Nessun cambio di comportamento visibile all'utente su `purpose` oltre al
  necessario per replicare l'aspetto con componenti Material (vedi spec, sezione
  "Theming": primary `#030213`, verde `#00C10D`/rosso `#E7000B` per azioni, font
  Inter).
- `AbstractComponent`/`AbstractDataTableComponent` sono estesi da tutte e 16 le
  pagine CRUD: ogni modifica alla loro superficie pubblica deve restare
  retrocompatibile con le 15 pagine non ancora migrate (che continuano a compilare
  contro l'interfaccia esistente finché non vengono migrate a loro volta in una
  fase successiva).
- Comandi `npm`/`ng` vanno eseguiti dentro il container Docker (Node ≥24 richiesto,
  host locale può divergere — vedi CLAUDE.md).
- `docker exec` sul container `api`/frontend per allineare le versioni di
  Node/npm a quelle richieste dal progetto.

---

## File Structure

**Nuovi file:**
- `frontend/src/app/core/services/toast.service.ts` — wrapper `MatSnackBar`
- `frontend/src/app/core/services/toast.service.spec.ts`
- `frontend/src/app/core/components/confirm-dialog.component.ts` — dialog conferma generico
- `frontend/src/app/core/components/confirm-dialog.component.spec.ts`
- `frontend/src/app/pages/purpose/purpose-edit-dialog.component.ts` — dialog edit/create `purpose`
- `frontend/src/app/pages/purpose/purpose-edit-dialog.component.html`
- `frontend/src/styles/material-theme.scss` — tema Material custom

**File modificati:**
- `frontend/src/app/app.config.ts` — aggiunta provider tema Material (PrimeNG resta)
- `frontend/src/styles.scss` — import tema Material
- `frontend/src/app/core/components/abstract.component.ts` — `MessageService` → `ToastService`
- `frontend/src/app/core/components/abstract-data-table.component.ts` — `Table`/form
  contract → `MatTableDataSource`/`MatDialog`
- `frontend/src/app/pages/purpose/purpose.component.ts` / `.html`
- `frontend/src/app/pages/purpose/search-purpose.component.ts` / `.html`
- `frontend/src/app/pages/purpose/data-table-purpose.component.ts` / `.html`

---

### Task 1: Installare Angular Material/CDK e tema custom

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/src/styles/material-theme.scss`
- Modify: `frontend/src/styles.scss`
- Modify: `frontend/src/app/app.config.ts`

**Interfaces:**
- Produces: variabili CSS del tema Material (`--mat-sys-primary` ecc. via
  `mat.theme()`) disponibili globalmente per tutti i componenti Material usati
  nei task successivi.

- [ ] **Step 1: Installare i pacchetti**

Dentro il container (Node ≥24, vedi CLAUDE.md):

```bash
docker exec utenzepa-frontend-1 npm install @angular/material@^20.3.0 @angular/cdk@^20.3.0
```

Se il container di sviluppo non ha quel nome, verificare con `docker compose ps`
e sostituire.

- [ ] **Step 2: Creare il tema custom**

`frontend/src/styles/material-theme.scss`:

```scss
@use '@angular/material' as mat;

html {
  color-scheme: light;

  @include mat.theme((
    color: (
      theme-type: light,
      primary: mat.$violet-palette,
      tertiary: mat.$blue-palette,
    ),
    typography: (
      brand-family: 'Inter, sans-serif',
      plain-family: 'Inter, sans-serif',
    ),
    density: 0,
  ));

  // Override puntuali per allinearsi alla palette esistente (vedi
  // docs/superpowers/specs/2026-08-06-primeng-to-material-migration-design.md,
  // sezione "Theming").
  --mat-sys-primary: #030213;
  --mat-sys-on-primary: #ffffff;
  --mat-sys-secondary: #ffffff;
  --mat-sys-on-secondary: #030213;
  --mat-sys-outline: #d4d4d4;
}

.mat-action-success {
  --mdc-icon-button-icon-color: #00c10d;
  color: #00c10d;
}

.mat-action-danger {
  --mdc-icon-button-icon-color: #e7000b;
  color: #e7000b;
}
```

- [ ] **Step 3: Importare il tema in `styles.scss`**

Aggiungere in cima a `frontend/src/styles.scss` (dopo l'import del font Inter
già presente):

```scss
@import './styles/material-theme.scss';
```

- [ ] **Step 4: Aggiungere `provideAnimationsAsync` (già presente) e nessun altro
  provider Material obbligatorio a livello globale**

`provideAnimationsAsync()` è già in `app.config.ts` (usato oggi per PrimeNG) — le
animazioni Material lo riusano, nessuna modifica necessaria a `app.config.ts` per
questo task. Non toccare `providePrimeNG(...)`: resta attivo per le pagine non
ancora migrate.

- [ ] **Step 5: Verificare che il build resti verde**

```bash
docker exec utenzepa-frontend-1 npm run build
```

Expected: build completa senza errori (nessun componente Material ancora usato,
ma il tema deve compilare).

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/styles.scss frontend/src/styles/material-theme.scss
git commit -m "feat(frontend): installa Angular Material/CDK e tema custom"
```

---

### Task 2: `ToastService` (wrapper `MatSnackBar`)

**Files:**
- Create: `frontend/src/app/core/services/toast.service.ts`
- Test: `frontend/src/app/core/services/toast.service.spec.ts`

**Interfaces:**
- Produces: `ToastService.add(message: ToastMessage): void` dove
  `ToastMessage = { severity: 'success' | 'error' | 'info' | 'warn'; summary: string; detail?: string; key?: string }`
  — stessa forma dell'oggetto passato oggi a `MessageService.add(...)` di
  PrimeNG (campo `key` accettato ma ignorato: nel codice attuale vale sempre
  `'global'`, un solo canale toast in tutta l'app).
- Consumes: `MatSnackBar` (`@angular/material/snack-bar`).

- [ ] **Step 1: Scrivere il test**

`frontend/src/app/core/services/toast.service.spec.ts`:

```typescript
import {TestBed} from '@angular/core/testing';
import {MatSnackBar} from '@angular/material/snack-bar';
import {ToastService} from './toast.service';

describe('ToastService', () => {
  let service: ToastService;
  let snackBarSpy: jasmine.SpyObj<MatSnackBar>;

  beforeEach(() => {
    snackBarSpy = jasmine.createSpyObj('MatSnackBar', ['open']);
    TestBed.configureTestingModule({
      providers: [
        ToastService,
        {provide: MatSnackBar, useValue: snackBarSpy}
      ]
    });
    service = TestBed.inject(ToastService);
  });

  it('shows summary and detail joined, with success panel class', () => {
    service.add({severity: 'success', summary: 'Elemento creato', detail: 'Prova'});

    expect(snackBarSpy.open).toHaveBeenCalledWith(
      'Elemento creato: Prova',
      'Chiudi',
      jasmine.objectContaining({panelClass: ['toast-success']})
    );
  });

  it('shows only summary when detail is missing', () => {
    service.add({severity: 'error', summary: 'Errore generico'});

    expect(snackBarSpy.open).toHaveBeenCalledWith(
      'Errore generico',
      'Chiudi',
      jasmine.objectContaining({panelClass: ['toast-error']})
    );
  });
});
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

```bash
docker exec utenzepa-frontend-1 npx ng test --watch=false --include='**/toast.service.spec.ts'
```

Expected: FAIL — `toast.service.ts` non esiste ancora.

- [ ] **Step 3: Implementare `ToastService`**

`frontend/src/app/core/services/toast.service.ts`:

```typescript
import {Injectable, inject} from '@angular/core';
import {MatSnackBar} from '@angular/material/snack-bar';

export interface ToastMessage {
  severity: 'success' | 'error' | 'info' | 'warn';
  summary: string;
  detail?: string;
  key?: string;
}

@Injectable({providedIn: 'root'})
export class ToastService {
  private snackBar = inject(MatSnackBar);

  add(message: ToastMessage): void {
    const text = message.detail ? `${message.summary}: ${message.detail}` : message.summary;
    this.snackBar.open(text, 'Chiudi', {
      duration: 5000,
      panelClass: [`toast-${message.severity}`],
      horizontalPosition: 'end',
      verticalPosition: 'top'
    });
  }
}
```

- [ ] **Step 4: Eseguire il test e verificare che passi**

```bash
docker exec utenzepa-frontend-1 npx ng test --watch=false --include='**/toast.service.spec.ts'
```

Expected: PASS (2/2).

- [ ] **Step 5: Aggiungere gli stili dei panel di severity**

In `frontend/src/styles/material-theme.scss`, in coda:

```scss
.toast-success {
  --mdc-snackbar-container-color: #00c10d;
  --mdc-snackbar-supporting-text-color: #ffffff;
}

.toast-error {
  --mdc-snackbar-container-color: #e7000b;
  --mdc-snackbar-supporting-text-color: #ffffff;
}

.toast-warn {
  --mdc-snackbar-container-color: #f59e0b;
  --mdc-snackbar-supporting-text-color: #030213;
}

.toast-info {
  --mdc-snackbar-container-color: #030213;
  --mdc-snackbar-supporting-text-color: #ffffff;
}
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/core/services/toast.service.ts frontend/src/app/core/services/toast.service.spec.ts frontend/src/styles/material-theme.scss
git commit -m "feat(frontend): aggiungi ToastService come wrapper MatSnackBar"
```

---

### Task 3: `ConfirmDialogComponent` generico (delete/restore)

**Files:**
- Create: `frontend/src/app/core/components/confirm-dialog.component.ts`
- Test: `frontend/src/app/core/components/confirm-dialog.component.spec.ts`

**Interfaces:**
- Produces: `ConfirmDialogComponent`, apribile con
  `MatDialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {data, width: '350px'})`
  dove `ConfirmDialogData = { title: string; message: string; confirmLabel: string; danger?: boolean }`.
  `afterClosed()` emette `true` se confermato, `undefined`/`false` altrimenti.
- Consumes: `MAT_DIALOG_DATA`, `MatDialogRef` (`@angular/material/dialog`).

- [ ] **Step 1: Scrivere il test**

`frontend/src/app/core/components/confirm-dialog.component.spec.ts`:

```typescript
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {MAT_DIALOG_DATA, MatDialogRef} from '@angular/material/dialog';
import {ConfirmDialogComponent, ConfirmDialogData} from './confirm-dialog.component';

describe('ConfirmDialogComponent', () => {
  let fixture: ComponentFixture<ConfirmDialogComponent>;
  let dialogRefSpy: jasmine.SpyObj<MatDialogRef<ConfirmDialogComponent>>;
  const data: ConfirmDialogData = {
    title: 'Elimina finalità d\'uso',
    message: 'Elimina finalità d\'uso Test?',
    confirmLabel: 'Elimina',
    danger: true
  };

  beforeEach(async () => {
    dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['close']);
    await TestBed.configureTestingModule({
      imports: [ConfirmDialogComponent],
      providers: [
        {provide: MAT_DIALOG_DATA, useValue: data},
        {provide: MatDialogRef, useValue: dialogRefSpy}
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(ConfirmDialogComponent);
    fixture.detectChanges();
  });

  it('renders title, message and confirm label from injected data', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Elimina finalità d\'uso');
    expect(text).toContain('Elimina finalità d\'uso Test?');
    expect(text).toContain('Elimina');
  });

  it('closes with true on confirm', () => {
    fixture.componentInstance.confirm();
    expect(dialogRefSpy.close).toHaveBeenCalledWith(true);
  });

  it('closes with false on cancel', () => {
    fixture.componentInstance.cancel();
    expect(dialogRefSpy.close).toHaveBeenCalledWith(false);
  });
});
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

```bash
docker exec utenzepa-frontend-1 npx ng test --watch=false --include='**/confirm-dialog.component.spec.ts'
```

Expected: FAIL — `confirm-dialog.component.ts` non esiste.

- [ ] **Step 3: Implementare `ConfirmDialogComponent`**

`frontend/src/app/core/components/confirm-dialog.component.ts`:

```typescript
import {Component, inject} from '@angular/core';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p>{{ data.message }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button (click)="cancel()">Annulla</button>
      <button mat-flat-button [class.mat-action-danger]="data.danger" (click)="confirm()">
        {{ data.confirmLabel }}
      </button>
    </mat-dialog-actions>
  `
})
export class ConfirmDialogComponent {
  protected data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
  private dialogRef = inject(MatDialogRef<ConfirmDialogComponent>);

  confirm(): void {
    this.dialogRef.close(true);
  }

  cancel(): void {
    this.dialogRef.close(false);
  }
}
```

- [ ] **Step 4: Eseguire il test e verificare che passi**

```bash
docker exec utenzepa-frontend-1 npx ng test --watch=false --include='**/confirm-dialog.component.spec.ts'
```

Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/core/components/confirm-dialog.component.ts frontend/src/app/core/components/confirm-dialog.component.spec.ts
git commit -m "feat(frontend): aggiungi ConfirmDialogComponent generico Material"
```

---

### Task 4: Rifattorizzare `AbstractComponent` (`MessageService` → `ToastService`)

**Files:**
- Modify: `frontend/src/app/core/components/abstract.component.ts`

**Interfaces:**
- Consumes: `ToastService` (Task 2), stessa interfaccia `.add({severity, summary, detail, key})`.
- Produces: nessuna modifica alla superficie pubblica di `AbstractComponent`
  (`protected messageService` resta il nome della proprietà, cambia solo il tipo
  — le 16 pagine che chiamano `this.messageService.add(...)` nei propri override
  continuano a compilare senza modifiche).

- [ ] **Step 1: Sostituire l'import e l'iniezione**

In `frontend/src/app/core/components/abstract.component.ts`, sostituire:

```typescript
import {MessageService} from 'primeng/api';
```

con:

```typescript
import {ToastService} from '../services/toast.service';
```

e sostituire:

```typescript
protected messageService = inject(MessageService);
```

con:

```typescript
protected messageService = inject(ToastService);
```

- [ ] **Step 2: Rimuovere l'import di `Table` da `primeng/table` e il campo `table`**

Righe 4 e 19 del file attuale (`import {Table} from 'primeng/table';` e
`@ViewChild('dt') table?: Table;`) non sono referenziati altrove nel file
(verificato — `table` non è usato in nessun metodo di `AbstractComponent`):
rimuoverli entrambi. Rimuovere anche l'import ora inutilizzato di `ViewChild`
se non serve più altrove nel file (verificare con una ricerca nel file dopo la
rimozione).

- [ ] **Step 3: Verificare che il file compili**

```bash
docker exec utenzepa-frontend-1 npx tsc --noEmit -p tsconfig.app.json
```

Expected: nessun nuovo errore introdotto in `abstract.component.ts`. Le pagine
non ancora migrate (es. `assets.component.ts`) continuano a fornire
`providers: [MessageService]` di PrimeNG — questo provider diventa inutilizzato
ma non causa errori di compilazione (resta risolvibile, `primeng` è ancora
installato).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/core/components/abstract.component.ts
git commit -m "refactor(frontend): AbstractComponent usa ToastService al posto di MessageService PrimeNG"
```

---

### Task 5: Rifattorizzare `AbstractDataTableComponent` (`MatTableDataSource` + `MatDialog`)

**Files:**
- Modify: `frontend/src/app/core/components/abstract-data-table.component.ts`

**Interfaces:**
- Consumes: `ConfirmDialogComponent` (Task 3), `MatDialog`/`MatTableDataSource`/
  `MatSort`/`MatPaginator` (`@angular/material/*`, `@angular/cdk/*`).
- Produces (contratto verso le sottoclassi, sostituisce quello attuale):
  - `dataSource: MatTableDataSource<T>` (nuovo, sostituisce l'accesso diretto a `data`
    nel template — `data` resta come `@Input` invariato, popola `dataSource` via `ngOnChanges`)
  - `sort: MatSort` / `paginator: MatPaginator` — `@ViewChild`, da assegnare nel
    template della sottoclasse con `#sort="matSort"` / `#paginator`
  - `abstract editDialogComponent(): Type<any>` (nuovo, sostituisce `buildForm`/
    `isFormValid`/`form` — ogni sottoclasse ritorna la classe del proprio dialog
    di edit, che riceve `{mode: 'create' | 'edit', item: T}` via `MAT_DIALOG_DATA`
    e chiude con `dialogRef.close(item: T | undefined)`)
  - `openCreateDialog()`, `openEditDialog(item: T)` — invariati nel nome, ora aprono
    `editDialogComponent()` via `MatDialog` invece di settare `editDialogVisible`
  - `openDeleteDialog(item: T)`, `restoreItem(item: T)` — invariati nel nome, ora
    aprono `ConfirmDialogComponent` via `MatDialog` invece di settare
    `deleteDialogVisible`/`restoreDialogVisible`
  - **Rimossi**: `form`, `buildForm()`, `isFormValid()`, `saveItem()`,
    `editDialogVisible`, `deleteDialogVisible`, `restoreDialogVisible`,
    `confirmDelete()`, `confirmRestore()`, `pTable`, `resetPagingTrigger` ora
    chiama `paginator?.firstPage()` invece di `pTable.reset()`
  - `itemInstance(): T` resta astratto, invariato (serve per `openCreateDialog`)

- [ ] **Step 1: Riscrivere il file**

`frontend/src/app/core/components/abstract-data-table.component.ts`:

```typescript
import {AfterViewInit, Component, EventEmitter, inject, Input, OnChanges, OnInit, Output, Type, ViewChild} from '@angular/core';
import {MatTableDataSource} from '@angular/material/table';
import {MatSort} from '@angular/material/sort';
import {MatPaginator} from '@angular/material/paginator';
import {MatDialog} from '@angular/material/dialog';
import {ConfirmDialogComponent, ConfirmDialogData} from './confirm-dialog.component';
import {ScreenSizeService} from '../../services/screen-size.service';

export interface EditDialogData<T> {
  mode: 'create' | 'edit';
  item: T;
}

@Component({
  template: ''
})
export abstract class AbstractDataTableComponent<T extends { id: any; name?: string }> implements OnInit, OnChanges, AfterViewInit {

  @Input() data: T[] = [];
  @Input() loading: boolean = false;
  @Input() creationResult?: { success: boolean, message?: string };

  @Output() onSave = new EventEmitter<T>();
  @Output() onDelete = new EventEmitter<T>();
  @Output() onCreate = new EventEmitter<T>();
  @Output() onRestore = new EventEmitter<T>();

  @ViewChild(MatSort) sort?: MatSort;
  @ViewChild(MatPaginator) paginator?: MatPaginator;

  protected dialog = inject(MatDialog);
  dataSource = new MatTableDataSource<T>([]);

  height: number = 0;
  rowHeight: number = 0;

  private _resetPagingTrigger: number = 0;

  rowsPerPageOptions: number[] = [10, 20, 50];

  @Input()
  set resetPagingTrigger(value: number) {
    this._resetPagingTrigger = value;
    if (this.paginator && this._resetPagingTrigger > 0) {
      this.paginator.firstPage();
    }
  }

  protected constructor(protected screen: ScreenSizeService) {
  }

  ngOnInit() {
    this.screen.screenHeight$.subscribe(h => {
      this.height = h;
      this.rowHeight = this.height / 10;
    });
  }

  ngOnChanges() {
    this.dataSource.data = this.data;
  }

  ngAfterViewInit() {
    if (this.sort) this.dataSource.sort = this.sort;
    if (this.paginator) this.dataSource.paginator = this.paginator;
  }

  restoreItem(entity: T): void {
    this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: `Ripristina ${this.entityLabel()}`,
        message: `Riattiva ${this.entityLabel()} ${entity.name ?? ''}?`,
        confirmLabel: 'Riattiva'
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onRestore.emit(entity);
    });
  }

  openDeleteDialog(entity: T): void {
    this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: `Elimina ${this.entityLabel()}`,
        message: `Elimina ${this.entityLabel()} ${entity.name ?? ''}?`,
        confirmLabel: 'Elimina',
        danger: true
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onDelete.emit(entity);
    });
  }

  openCreateDialog(): void {
    this.dialog.open<unknown, EditDialogData<T>, T | undefined>(this.editDialogComponent(), {
      width: '600px',
      data: {mode: 'create', item: this.itemInstance()}
    }).afterClosed().subscribe(result => {
      if (result) this.onCreate.emit(result);
    });
  }

  openEditDialog(item: T): void {
    this.dialog.open<unknown, EditDialogData<T>, T | undefined>(this.editDialogComponent(), {
      width: '600px',
      data: {mode: 'edit', item: {...item}}
    }).afterClosed().subscribe(result => {
      if (result) this.onSave.emit(result);
    });
  }

  abstract itemInstance(): T;

  abstract editDialogComponent(): Type<unknown>;

  /** Etichetta minuscola dell'entità usata nei messaggi dei dialog generici (es. "finalità d'uso"). */
  protected abstract entityLabel(): string;

  // Override in subclass to provide cell values for CSV export.
  protected exportCellValue(_item: T, _field: string): string {
    return '';
  }

  getNestedValue(obj: unknown, path: string): unknown {
    return path.split('.').reduce((acc: unknown, key: string) =>
      acc != null ? (acc as Record<string, unknown>)[key] : null, obj);
  }

  exportToCSV(columns: IColumnDef[], filename: string): void {
    const BOM = '﻿';
    const sep = ';';
    const headers = columns.map(c => `"${c.header}"`).join(sep);
    const rows = this.data.map(item =>
      columns.map(c => `"${this.exportCellValue(item, c.field).replace(/"/g, '""')}"`).join(sep)
    );
    const csv = BOM + [headers, ...rows].join('\r\n');
    const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  protected loadColumnSelection(storageKey: string, allColumns: IColumnDef[], defaultFields: Set<string>): IColumnDef[] {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const fields: string[] = JSON.parse(raw);
        const selected = fields
          .map(f => allColumns.find(c => c.field === f))
          .filter((c): c is IColumnDef => c != null);
        if (selected.length > 0) return selected;
      }
    } catch {
      // corrupted storage — fall through to default
    }
    return allColumns.filter(c => defaultFields.has(c.field));
  }

  protected saveColumnSelection(storageKey: string, selectedColumns: IColumnDef[]): void {
    localStorage.setItem(storageKey, JSON.stringify(selectedColumns.map(c => c.field)));
  }

  protected resolveOnRelation<D extends object>(relation: keyof D, prop: keyof D, data?: D): any {
    return data?.[relation] != null ? (data[prop] ?? null) : null;
  }
}
```

Nota: `IColumnDef` è un'interfaccia globale ambient definita in
`frontend/src/app/core/interfaces/column-def.interface.ts` (nessun `export`,
nessun `import` necessario — file già incluso nella compilazione oggi, non
richiede modifiche).

**Attenzione — impatto sulle 15 pagine non ancora migrate:** questo task rompe la
build delle sottoclassi non ancora migrate (`assets`, `invoices`, ecc.), perché
rimuove `form`/`buildForm`/`isFormValid`/`saveItem`/`editDialogVisible`/
`deleteDialogVisible`/`restoreDialogVisible`/`confirmDelete`/`confirmRestore` che
quelle sottoclassi (e i loro template PrimeNG) ancora usano. Questo è **atteso e
accettato** in questa fase: la spec (vedi "Ordine di lavoro nella PR") prevede
esplicitamente `AbstractDataTableComponent` rifattorizzato una sola volta e tutte
le pagine migrate di conseguenza nella stessa PR, prima del merge. Fase 2
(pianificazione separata, vedi fondo documento) migrerà le 15 pagine restanti
usando esattamente questo nuovo contratto — fino a quel momento la build del
frontend resta rossa per quelle pagine, cosa accettabile perché questa PR non
viene mergiata a metà lavoro.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/core/components/abstract-data-table.component.ts
git commit -m "refactor(frontend): AbstractDataTableComponent usa MatTableDataSource/MatDialog al posto di p-table/p-dialog"
```

---

### Task 6: Migrare `purpose-edit-dialog` (nuovo componente)

**Files:**
- Create: `frontend/src/app/pages/purpose/purpose-edit-dialog.component.ts`
- Create: `frontend/src/app/pages/purpose/purpose-edit-dialog.component.html`

**Interfaces:**
- Consumes: `EditDialogData<Purpose>` (Task 5) via `MAT_DIALOG_DATA`; `MatDialogRef`.
- Produces: componente standalone registrabile in `DataTablePurposeComponent.editDialogComponent()`.

- [ ] **Step 1: Implementare il componente**

`frontend/src/app/pages/purpose/purpose-edit-dialog.component.ts`:

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
import {Purpose} from './entity/purpose.entity';
import {UseTypeOptions} from './enum/use-type.enum';

@Component({
  selector: 'app-purpose-edit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule
  ],
  templateUrl: './purpose-edit-dialog.component.html'
})
export class PurposeEditDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<PurposeEditDialogComponent, Purpose | undefined>);
  protected data = inject<EditDialogData<Purpose>>(MAT_DIALOG_DATA);

  useTypeOptions = UseTypeOptions;
  isNew = this.data.mode === 'create';

  form = this.fb.group({
    name: [this.data.item.name ?? '', Validators.required],
    use_type: [this.data.item.use_type ?? null, Validators.required],
  });

  save(): void {
    if (!this.form.valid) return;
    const result = plainToInstance(Purpose, {
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

- [ ] **Step 2: Implementare il template**

`frontend/src/app/pages/purpose/purpose-edit-dialog.component.html`:

```html
<h2 mat-dialog-title>
  {{ isNew ? 'Crea nuova finalità d\'uso' : 'Modifica finalità d\'uso: ' + data.item.name }}
</h2>

<mat-dialog-content>
  <form [formGroup]="form" style="display: flex; flex-wrap: wrap; gap: 1rem;">
    <mat-form-field style="flex: 1 1 45%;">
      <mat-label>Nome *</mat-label>
      <input matInput formControlName="name">
      @if (form.controls.name.invalid && form.controls.name.touched) {
        <mat-error>Obbligatorio</mat-error>
      }
    </mat-form-field>

    <mat-form-field style="flex: 1 1 50%;">
      <mat-label>Tipo uso *</mat-label>
      <mat-select formControlName="use_type">
        @for (opt of useTypeOptions; track opt.value) {
          <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
        }
      </mat-select>
      @if (form.controls.use_type.invalid && form.controls.use_type.touched) {
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

- [ ] **Step 3: Verificare che compili**

```bash
docker exec utenzepa-frontend-1 npx tsc --noEmit -p tsconfig.app.json
```

Expected: nessun errore in `purpose-edit-dialog.component.ts`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/pages/purpose/purpose-edit-dialog.component.ts frontend/src/app/pages/purpose/purpose-edit-dialog.component.html
git commit -m "feat(frontend): aggiungi PurposeEditDialogComponent (Material)"
```

---

### Task 7: Migrare `data-table-purpose` a `MatTable`

**Files:**
- Modify: `frontend/src/app/pages/purpose/data-table-purpose.component.ts`
- Modify: `frontend/src/app/pages/purpose/data-table-purpose.component.html`

**Interfaces:**
- Consumes: `AbstractDataTableComponent<Purpose>` (Task 5), `PurposeEditDialogComponent` (Task 6).
- Produces: nessuna modifica alla superficie pubblica verso `purpose.component.html`
  (stessi `@Input`/`@Output`: `data`, `loading`, `onSave`, `onDelete`, `onCreate`,
  `onRestore`, `creationResult`, `resetPagingTrigger`).

- [ ] **Step 1: Riscrivere `data-table-purpose.component.ts`**

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
import {Purpose} from './entity/purpose.entity';
import {UseType, UseTypeDescription} from './enum/use-type.enum';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {PurposeEditDialogComponent} from './purpose-edit-dialog.component';

@Component({
  selector: 'app-data-table-purpose',
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
  templateUrl: './data-table-purpose.component.html'
})
export class DataTablePurposeComponent extends AbstractDataTableComponent<Purpose> {

  displayedColumns = ['actions', 'id', 'name', 'use_type'];
  useTypeDescription = UseTypeDescription;

  constructor(screen: ScreenSizeService) {
    super(screen);
  }

  override itemInstance(): Purpose {
    return Purpose.create();
  }

  override editDialogComponent(): Type<unknown> {
    return PurposeEditDialogComponent;
  }

  protected override entityLabel(): string {
    return `finalità d'uso`;
  }

  getUseTypeDescription(value: any): string {
    return this.useTypeDescription[value as UseType] || value;
  }
}
```

- [ ] **Step 2: Riscrivere `data-table-purpose.component.html`**

```html
<div style="display: flex; justify-content: space-between; align-items: center;">
  <h3>Elenco ({{data.length}})</h3>
  <button mat-flat-button (click)="openCreateDialog()" [appHasRole]="['Admin', 'Operatore']">
    <mat-icon>add</mat-icon>
    Aggiungi finalità d'uso
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
        <button mat-icon-button (click)="openEditDialog(item)" [appHasRole]="['Admin', 'Operatore', 'Lettore']">
          <mat-icon>edit</mat-icon>
        </button>
      }
      <button mat-icon-button
              [class.mat-action-success]="item.deleted"
              [class.mat-action-danger]="!item.deleted"
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

  <ng-container matColumnDef="use_type">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Tipo uso</th>
    <td mat-cell *matCellDef="let item">{{ getUseTypeDescription(item.use_type) }}</td>
  </ng-container>

  <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
  <tr mat-row *matRowDef="let row; columns: displayedColumns;" [class.row-deleted]="row.deleted"></tr>

  <tr class="mat-row" *matNoDataRow>
    <td class="mat-cell" [attr.colspan]="displayedColumns.length">Nessun elemento disponibile.</td>
  </tr>
</table>

<mat-paginator #paginator [pageSizeOptions]="rowsPerPageOptions" [pageSize]="10"></mat-paginator>
```

Nota: `#sort="matSort"` e `#paginator` sono referenziati dai `@ViewChild(MatSort)`/
`@ViewChild(MatPaginator)` di `AbstractDataTableComponent` (Task 5) per tipo, non
per nome di template-ref — Angular li risolve automaticamente cercando l'istanza
della direttiva/componente nel template del componente ospite, i nomi `#sort`/
`#paginator` servono solo per leggibilità del markup e non vanno referenziati
altrove.

- [ ] **Step 3: Verificare il build**

```bash
docker exec utenzepa-frontend-1 npm run build
```

Expected: `purpose` compila; le altre 15 pagine falliscono (atteso, vedi nota
Task 5) — il build completo tornerà verde solo a Fase 2 conclusa. Per verificare
solo `purpose` in isolamento in questa fase, usare `tsc --noEmit` mirato o una
review manuale del diff, non il build completo del progetto.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/pages/purpose/data-table-purpose.component.ts frontend/src/app/pages/purpose/data-table-purpose.component.html
git commit -m "refactor(frontend): migra DataTablePurposeComponent a Angular Material"
```

---

### Task 8: Migrare `search-purpose` e `purpose` (pagina contenitore)

**Files:**
- Modify: `frontend/src/app/pages/purpose/search-purpose.component.ts`
- Modify: `frontend/src/app/pages/purpose/search-purpose.component.html`
- Modify: `frontend/src/app/pages/purpose/purpose.component.ts`
- Modify: `frontend/src/app/pages/purpose/purpose.component.html`

**Interfaces:**
- Consumes: `AbstractSearchComponent` (invariato, nessuna dipendenza PrimeNG —
  vedi spec), `ToastService` (Task 2, già iniettato via `AbstractComponent`).

- [ ] **Step 1: Riscrivere `search-purpose.component.ts`**

```typescript
import {Component, OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatDialogModule} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {UseTypeOptions} from './enum/use-type.enum';
import {AbstractSearchComponent} from '../../core/components/abstract-search.component';

@Component({
  selector: 'app-search-purpose',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule
  ],
  templateUrl: './search-purpose.component.html',
})
export class SearchPurposeComponent extends AbstractSearchComponent implements OnInit {

  useTypeOptions = [
    {label: 'Tutti', value: null},
    ...UseTypeOptions
  ];

  constructor(private fb: FormBuilder) {
    super();
    this.qSearch = this.fb.group({
      qsearch: [''],
      name: [''],
      use_type: [null],
    });
  }
}
```

(rimosso `ISupplier`/`supplierOptions`, mai popolati né usati nel template
originale — dead code, non riportato)

- [ ] **Step 2: Riscrivere `search-purpose.component.html`**

```html
<div [formGroup]="qSearch" style="display: flex; align-items: center; gap: 0.5rem;">
  <mat-form-field style="flex: 1;" subscriptSizing="dynamic">
    <input matInput placeholder="Cerca..." formControlName="qsearch" (keyup.enter)="onQuickSearch()">
  </mat-form-field>

  <button mat-stroked-button (click)="filterDialogVisible = true" style="height: 3.5rem;">
    <mat-icon>filter_list</mat-icon>
    Filtri
  </button>
</div>

@if (filterDialogVisible) {
  <div class="cdk-overlay-fake-dialog">
    <!-- Sostituito da MatDialog nel prossimo step del task: qui resta solo
         come promemoria dello stato, il markup reale è nel dialog qui sotto. -->
  </div>
}
```

Nota: a differenza di `p-dialog [(visible)]`, `MatDialog` non ha una direttiva
"apri se true" dichiarativa nel template — l'apertura va triggerata
imperativamente. Sostituire l'intero blocco sopra con l'approccio corretto:

`search-purpose.component.ts` — aggiungere l'apertura via `MatDialog` invece del
solo flag booleano ereditato da `AbstractSearchComponent` (che resta com'è, non
lo si tocca essendo condiviso — vedi spec). Aggiungere in coda alla classe:

```typescript
  private dialog = inject(MatDialog);

  openFilterDialog(): void {
    const ref = this.dialog.open(PurposeFilterDialogComponent, {
      width: '31vw',
      data: {form: this.qSearch, useTypeOptions: this.useTypeOptions}
    });
    ref.afterClosed().subscribe(applied => {
      if (applied) this.onSearch();
    });
  }
```

e aggiungere `import {inject} from '@angular/core';` e
`import {MatDialog} from '@angular/material/dialog';` in cima al file.

Creare `frontend/src/app/pages/purpose/purpose-filter-dialog.component.ts`:

```typescript
import {Component, inject} from '@angular/core';
import {ReactiveFormsModule, FormGroup} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';

export interface PurposeFilterDialogData {
  form: FormGroup;
  useTypeOptions: {label: string; value: unknown}[];
}

@Component({
  selector: 'app-purpose-filter-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Filtri di ricerca</h2>
    <mat-dialog-content>
      <form [formGroup]="data.form" id="filter-form" (ngSubmit)="apply()" style="display: flex; gap: 1rem;">
        <mat-form-field style="flex: 1 1 50%;">
          <mat-label>Nome</mat-label>
          <input matInput formControlName="name">
        </mat-form-field>
        <mat-form-field style="flex: 1 1 50%;">
          <mat-label>Tipo uso</mat-label>
          <mat-select formControlName="use_type">
            @for (opt of data.useTypeOptions; track opt.value) {
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
export class PurposeFilterDialogComponent {
  protected data = inject<PurposeFilterDialogData>(MAT_DIALOG_DATA);
  private dialogRef = inject(MatDialogRef<PurposeFilterDialogComponent, boolean>);

  apply(): void {
    this.dialogRef.close(true);
  }

  clear(): void {
    this.data.form.reset();
    this.dialogRef.close(true);
  }
}
```

Sostituire il markup provvisorio di `search-purpose.component.html` (lo step
sopra) con la versione finale, senza il blocco `@if` provvisorio:

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

- [ ] **Step 3: Riscrivere `purpose.component.ts`**

```typescript
import {Component} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {DataTablePurposeComponent} from './data-table-purpose.component';
import {SearchPurposeComponent} from './search-purpose.component';
import {PurposeService} from './purpose.service';
import {AbstractComponent} from '../../core/components/abstract.component';
import {Purpose} from './entity/purpose.entity';
import {UseTypeDescription} from './enum/use-type.enum';

@Component({
  selector: 'app-purpose',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    DataTablePurposeComponent,
    SearchPurposeComponent
  ],
  templateUrl: './purpose.component.html'
})
export class PurposeComponent extends AbstractComponent<Purpose> {
  creationResult?: { success: boolean, message?: string };

  constructor(protected override service: PurposeService) {
    super();
    this.qsearchFields = ['name', 'use_type'];
  }

  override onSearch(filters: any) {
    if (Object.keys(filters).length === 1 && filters.hasOwnProperty('qsearch') && filters.qsearch !== '') {
      const term = (filters.qsearch as string).toLowerCase();
      this.list = [...this.allItems].filter(item => {
        const nameMatch = item.name?.toLowerCase().includes(term);
        const useTypeRawMatch = item.use_type?.toLowerCase().includes(term);
        const useTypeDescMatch = UseTypeDescription[item.use_type]?.toLowerCase().includes(term);
        return nameMatch || useTypeRawMatch || useTypeDescMatch;
      });
      this.resetPagingCount++;
    } else {
      super.onSearch(filters);
    }
  }

  protected override getEntityIdentifier(entity: Purpose): string {
    return `${entity.name}`;
  }

  protected override entityToPayload(entity: Purpose): Partial<Purpose> {
    return {
      name: entity.name,
      use_type: entity.use_type,
      created_by_user_id: this.userId,
      updated_by_user_id: this.userId
    };
  }

  override onCreate(entity: Purpose) {
    this.service.create(entity).subscribe(
      {
        next: (item: Purpose) => {
          this.list.push(item);
          this.messageService.add(
            {
              severity: 'success',
              summary: 'Elemento creato',
              detail: this.getEntityIdentifier(item)
            });
          this.creationResult = {
            success: true,
            message: 'Elemento creato con successo'
          };
          this.loadAll();
        },
        error: (err: any) => {
          this.handleError(err, 'Errore generico nella creazione');
        }
      });
  }
}
```

(rimossi `MessageService`/`ToastModule`/`InputTextModule`/`ButtonModule`/
`TableModule` di PrimeNG e `providers: [MessageService]` — `ToastService` è
`providedIn: 'root'`, Task 2, non serve provider per-componente; rimosso `key: 'global'`
dall'`add(...)`, non più necessario con `ToastService`, Task 2 lo ignora comunque
se presente ma è più pulito ometterlo)

- [ ] **Step 4: Riscrivere `purpose.component.html`**

```html
<div style="padding: 1rem;">
  <div>
    <h1>Finalità d'uso</h1>
    <p style="color: #6A7282;">Gestisci le anagrafiche delle finalità d'uso</p>
  </div>
  <div style="margin-top: 1rem;">
    <app-search-purpose (search)="onSearch($event)"></app-search-purpose>
  </div>
  <div style="margin-top: 1.5rem;">
    <app-data-table-purpose [data]="list"
      [loading]="loading"
      (onSave)="onSave($event)"
      (onDelete)="onDelete($event)"
      (onCreate)="onCreate($event)"
      (onRestore)="onRestore($event)"
      [creationResult]="creationResult"
      [resetPagingTrigger]="resetPagingCount"
    ></app-data-table-purpose>
  </div>
</div>
```

(rimosso `<p-toast>`: `MatSnackBar` è overlay-based, non richiede un placeholder
nel template; rimosse le classi `p-grid`/`p-col-12` di PrimeNG, sostituite da
margini inline già presenti)

- [ ] **Step 5: Verificare `tsc --noEmit` mirato sui file di `purpose`**

```bash
docker exec utenzepa-frontend-1 npx tsc --noEmit -p tsconfig.app.json
```

Expected: nessun errore nei file sotto `src/app/pages/purpose/`. Errori nelle
altre 15 pagine sono attesi in questa fase (vedi nota Task 5).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/pages/purpose/
git commit -m "refactor(frontend): migra pagina purpose (search + container) a Angular Material"
```

---

### Task 9: QA manuale pagina `purpose`

**Files:** nessuno (verifica manuale)

- [ ] **Step 1: Avviare l'app in dev**

```bash
docker compose up -d
```

Frontend su http://localhost:4300 (porta effettiva da verificare in `.env` — vedi
CLAUDE.md, può essere overrideata).

- [ ] **Step 2: Eseguire la checklist sulla pagina `purpose`**

- [ ] La lista carica ed elenca le finalità d'uso esistenti
- [ ] Ricerca rapida (campo "Cerca...") filtra per nome/tipo uso
- [ ] Dialog filtri si apre, applica filtro per nome e per tipo uso, "Pulisci Filtri" resetta
- [ ] "Aggiungi finalità d'uso" apre il dialog di creazione, validazione required su nome/tipo uso, salvataggio crea la riga e mostra lo snackbar di conferma
- [ ] Modifica riga esistente apre il dialog precompilato, salva aggiorna la riga
- [ ] Elimina riga apre `ConfirmDialogComponent`, conferma elimina (riga marcata come `row-deleted`)
- [ ] Ripristina riga eliminata apre `ConfirmDialogComponent`, conferma ripristina
- [ ] Sort per colonna (ID, Nome, Tipo uso) funziona cliccando l'header
- [ ] Paginazione (10/20/50 per pagina) funziona, cambio filtro resetta alla prima pagina
- [ ] Nessun elemento residuo di stile PrimeNG visibile (bottoni, dialog, select coerenti con la palette `#030213`/bianco/verde/rosso)

- [ ] **Step 3: Annotare eventuali problemi trovati e correggerli prima di procedere**

Non proseguire alla Fase 2 (pianificazione separata) finché la checklist sopra
non è interamente verde.

---

## Note di chiusura — Fase 2 (fuori da questo piano)

Questo piano copre solo l'infrastruttura condivisa e la pagina pilota `purpose`.
Le altre 15 pagine CRUD (assets, invoices, suppliers, budget-chapters,
consip-agreement, costs-borne-by, maintenance-managers, suppliers, system-users,
utilities, utility-aggregator, utility-types, utilizer, utilizer-grant,
asset-aggregator) e la pagina `backup-import` (tabs/drawer, pattern diverso, non
CRUD standard) vanno pianificate con un **piano separato**, scritto dopo aver
letto per intero ciascuna pagina reale (campi, colonne, form) — non è corretto
scrivere qui codice "a scatola chiusa" per pagine non ancora esaminate. Il pattern
da riapplicare è esattamente quello di questo piano (Task 6-8), entità per
entità. Solo a tutte le pagine migrate si esegue il bump `@angular/*` a `^22.x`
(con `@angular/animations` esplicita) e la rimozione di `primeng`/
`@primeuix/themes`/`primeicons` da `package.json` (vedi spec, punti 5-6
dell'"Ordine di lavoro nella PR").

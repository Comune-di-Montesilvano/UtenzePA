# Migrazione PrimeNG → Angular Material (Fase 2, Gruppo E: `utilities`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrare l'ultima pagina rimasta in PrimeNG (`utilities` — Gestione Utenze) ad Angular
Material, riusando esattamente il pattern a 4 file stabilito in Fase 1/Gruppo A (`purpose` come
stampo) e il pattern di colonne dinamiche + custom sort + export CSV consolidato nel Gruppo D
(`assets`/`invoices`). Questo è il gruppo più grande e rischioso della Fase 2 (41 colonne
configurabili, 37 controlli nel form di modifica, 39 campi di ricerca su 7 sezioni) ma tocca
UNA sola pagina. È anche l'ultimo gruppo prima del bump ad Angular 22 e della rimozione finale
di PrimeNG dal progetto (non in scope di questo piano).

**Architecture:** Pagina a 4 componenti: `UtilitiesComponent` (contenitore, con logica di
deep-link/query-param preesistente da preservare), `DataTableUtilitiesComponent` (tabella con 41
colonne configurabili, un `<ng-container matColumnDef="...">` per campo — obbligatorio in
Angular Material, le colonne esistono sempre nel template anche se non visualizzate),
`SearchUtilitiesComponent` (barra ricerca rapida + apertura dialog filtri) e due dialog `MatDialog`
dedicati: `UtilityEditDialogComponent` (create/edit, campi condizionali su `HardType` del tipo
utenza selezionato) e `UtilityFilterDialogComponent` (filtri avanzati, 7 sezioni riprodotte con
`mat-expansion-panel`, l'ultima collassata di default). Il custom sort riusa il pattern
`dataSource.sortData` di `DataTableInvoicesComponent` (Gruppo D): path annidati +
`localeCompare('it')` + fallback numerico, con un caso speciale per la colonna virtuale
`asset.utilizer`. I 5 `p-select [filter]="true"` del dialog filtri (`asset_id_fk`,
`aggregator_id_fk`, `supplier_id_fk`, `budget_chapter_code_fk`, `user_id_fk`) diventano
`MatAutocomplete` con `FormControl` di visualizzazione separato (pattern Gruppo D). I campi
`_range` (5, tutti date-range) restano array `[from, to]` come nell'originale (richiesto da
`AbstractSearchComponent.parseSearchForm()`, non modificabile) ma pilotati da due
`<input [matDatepicker]>` singoli con `[(ngModel)]` locale, assemblati in un array solo
all'apertura di "Applica Filtri" — Angular Material non ha un equivalente diretto di
`p-datePicker[selectionMode="range"]` legato a un unico `FormControl` array-valued.

**Tech Stack:** Angular 20.3 (invariato, nessun bump a 22 in questo piano), `@angular/material`/
`@angular/cdk` `^20.x` (già installati), RxJS 7.8, `class-transformer`.

## Global Constraints

- Angular resta `^20.3.0` — nessun bump a 22 in questo piano (richiede tutte le pagine migrate,
  vedi piano Fase 1 "Note di chiusura"; `utilities` è l'ultima, quindi il bump può partire subito
  dopo la chiusura di questo piano, ma è un piano a parte).
- `primeng`/`@primeuix/themes`/`primeicons` restano installati in `package.json` — non toccare
  (nessun'altra pagina da migrare dopo questa, ma la rimozione del pacchetto è un piano dedicato
  successivo, fuori scope qui).
- Nessuna modifica alle classi base condivise: `AbstractDataTableComponent`
  (`frontend/src/app/core/components/abstract-data-table.component.ts`),
  `AbstractSearchComponent` (`frontend/src/app/core/components/abstract-search.component.ts`),
  `AbstractComponent` (`frontend/src/app/core/components/abstract.component.ts`),
  `ConfirmDialogComponent`, `ToastService`, `IColumnDef`
  (`frontend/src/app/core/interfaces/column-def.interface.ts`, ambient globale, nessun import
  necessario) restano esattamente come sono oggi.
- **`ConfirmDialogComponent` renderizza `data.message` come testo semplice (interpolazione, non
  `innerHTML`)**: niente **grassetto** markdown nei messaggi di conferma. I messaggi richiesti
  ("Sei sicuro di voler eliminare l'Utenza **{{utility_id}}**?") vanno scritti SENZA `**` nel
  codice reale (stesso vincolo già accettato per `utilizer`/`assets`/`invoices`).
- Gate ruolo Lettore obbligatorio sul dialog di modifica: `[readOnly]="['Lettore']"` sul `<form>`
  + `[appHasRole]="['Admin','Operatore']"` sul bottone Salva + `form.disable()` nel constructor
  se ruolo mancante o `'Lettore'` (pattern C1, identico a `PurposeEditDialogComponent`/
  `AssetEditDialogComponent`).
- **Bottone "Modifica" SEMPRE VISIBILE, anche su riga eliminata**: nessun `@if (!item.deleted)`
  attorno al bottone, solo il gate di ruolo `[appHasRole]="['Admin','Operatore','Lettore']"`.
  Questo è diverso da `purpose`/`assets`/`invoices` (che nascondono Modifica su riga eliminata)
  ma identico al comportamento del vecchio `data-table-utilities.component.html` originale (riga
  79, nessun `@if` attorno al bottone matita) e a `utilizer-grant`/`utility-types` già migrati a
  Material con lo stesso pattern — NON è una svista da correggere, va riprodotto tale e quale.
- `restoreItem()`/`openDeleteDialog()` vanno overridati in `DataTableUtilitiesComponent` per
  usare `entity.utility_id` (non `entity.name`, che `Utility` non ha) — pattern identico a
  `DataTableUtilizerComponent`/`DataTableAssetsComponent`.
- Colonne dinamiche: `mat-select multiple` per la selezione, `loadColumnSelection()`/
  `saveColumnSelection()` della base class restano invariati — solo `storageKey` (`columns:utilities`,
  IDENTICO alla chiave già usata dal codice PrimeNG attuale, per non invalidare le preferenze
  utente già salvate in localStorage), `allColumns` (41 colonne) e `defaultFields` (9 colonne)
  cambiano.
- Niente skeleton PrimeNG: `<mat-progress-bar mode="indeterminate">` quando `loading` (il vecchio
  `skeletonRows`/`skeletonCols`/`SkeletonModule` va rimosso, non riprodotto — la tabella vuota si
  gestisce con `*matNoDataRow`).
- Comandi `npm`/`ng`/`tsc` sempre dentro il container Docker (Node ≥24 richiesto — vedi
  CLAUDE.md). Nome container assunto `utenzepa-frontend-1`; verificare con `docker compose ps`
  se diverso.
- Route effettiva (da `frontend/src/app/app.routes.ts` riga 40): `utilities` è servita sul path
  `utilities` da `UtilitiesComponent` (non un alias diverso, a differenza di `assets`→`building`).
- **Punto critico verificato sul codice reale di `AbstractDataTableComponent.ngAfterViewInit()`
  (righe 62-65)**:
  ```typescript
  ngAfterViewInit() {
    if (this.sort) this.dataSource.sort = this.sort;
    if (this.paginator) this.dataSource.paginator = this.paginator;
  }
  ```
  Il collegamento `MatSort`/`MatPaginator` a `MatTableDataSource` avviene SOLO in questo hook.
  Il vecchio `DataTableUtilitiesComponent.ngAfterViewInit()` (PrimeNG, riga 79-81) fa SOLO
  `this.screen.updateMinHeight()`, senza `override` e senza chiamare `super.ngAfterViewInit()`.
  Se questo venisse riprodotto tale e quale nel componente Material, la tabella compilerebbe ma
  sort e paginazione risulterebbero scollegati (click su header non ordina, cambio pagina non
  funziona) — bug silenzioso, nessun errore a compile-time né a runtime finché non si prova a
  cliccare un header o a cambiare pagina. Il nuovo componente DEVE scrivere:
  ```typescript
  override ngAfterViewInit(): void {
    super.ngAfterViewInit();
    this.screen.updateMinHeight();
  }
  ```
  Vedi Task 1, Step 3 per il codice completo con commento esplicativo in-line. Il task di QA
  (Task 5) verifica esplicitamente sort e paginazione a schermo, non si dà per scontato che
  funzioni solo perché compila.
- Decisioni esplicite di correzione/adattamento rispetto al codice PrimeNG originale (motivate
  nei task):
  1. **Colonna "Stato" (`expiryStatus`)**: il vecchio `getLabel()` mappava solo 3 chiavi
     (`ACTIVE`/`EXPIRING`/`EXPIRED`) mentre l'enum `ExpireState` ha 5 valori
     (`ACTIVE`/`EXPIRING30`/`EXPIRING60`/`EXPIRING90`/`EXPIRED`) — le 3 varianti intermedie di
     scadenza risultavano senza etichetta (stringa vuota in tabella e in export). Corretto con
     tutte e 5 le label.
  2. **Campo `reported_consumption_year`**: `Validators.required` nel form ma il relativo
     `<p-inputNumber>` era commentato nel template originale (mai renderizzato, riga 528-534 del
     vecchio `data-table-utilities.component.html`) — un utente non poteva mai vederlo né
     valorizzarlo, restando sempre al default `0`. Nel nuovo dialog Material il campo viene
     renderizzato come input numerico visibile con label "Consumo annuo comunicato Consip"
     (scelta più sicura: il controllo esiste già nel FormGroup con validator required e default
     `0`, non aggiungerlo alla UI significherebbe lasciare un campo obbligatorio invisibile).
  3. **Campi di ricerca dead**: il form `qSearch` originale (`search-utilities.component.ts`) ha
     46 `FormControl`, di cui 6 mai renderizzati nel template (`supply_expiry_date`, `deleted`,
     `water_concession`, `supply_start_date`, `management_expiry_date`,
     `takeover_termination_date` — sostituiti dalle rispettive varianti `_range`, che SONO
     renderizzate). Il nuovo `qSearch` riproduce solo i campi effettivamente usati: 39 campi +
     `qsearch` = 40 controlli totali (non 46, e non i "41 campi di ricerca"/"41 colonne" citati
     come stima approssimativa nella ricognizione preliminare — il conteggio esatto verificato
     sul codice sorgente reale è 41 colonne tabella + 39 campi filtro + `qsearch`).
  4. **Form di modifica**: il conteggio reale dei controlli in `buildForm()` (vecchio
     `data-table-utilities.component.ts`, righe 448-487) è **37**, non 33 come stimato nella
     ricognizione preliminare — verificato contando i field del `FormGroup` sorgente uno per uno
     (elenco completo in Task 2). I 9 campi `Validators.required` restano quelli indicati:
     `asset_id_fk`, `budget_chapter_code_fk`, `costs_borne_by_id_fk`,
     `estimated_annual_consumption`, `reported_consumption_year`, `actual_consumption`,
     `security_deposit`, `utility_id`, `utility_type_id_fk`.
  5. **`resolveOnRelation()`**: è un metodo `protected` di `AbstractDataTableComponent`, non
     accessibile da un `MatDialog` standalone (`UtilityEditDialogComponent` non estende quella
     classe). Stessa situazione già affrontata per `AssetEditDialogComponent` (Gruppo D): si
     replica la stessa identica logica con un metodo privato locale nel dialog (Task 2, Step 1).
  6. **Dead code rimosso, non riprodotto**: import `CheckboxModule`/`ProgressSpinnerModule`/
     `SkeletonModule` mai usati per il loro scopo effettivo, `skeletonRows`/`skeletonCols`,
     colspan hardcoded a `11` nel vecchio `emptymessage` (numero magico scollegato dal numero
     reale di colonne — nel nuovo Material si usa `[attr.colspan]="displayedColumns.length"`),
     typo `loadDependecies` → rinominato `loadDependencies`, override locale di `getNestedValue`
     nel vecchio componente (duplicava esattamente l'implementazione ereditata da
     `AbstractDataTableComponent` — nel nuovo componente si usa solo quella ereditata, nessun
     override), `search-utilities.component.css` (classi `.field-group` mai referenziate nel
     template, che usa `.grid-item`/`.grid-container` inline — stesso destino di
     `search-invoices.component.css` nel Gruppo D).
  7. **`UtilitiesComponent` (contenitore)**: rimossi `creationResult` (mai consumato dal
     contratto Material di `AbstractDataTableComponent`, stesso motivo già documentato nel
     Gruppo D per `assets`/`invoices`), `<p-toast>`/`ToastModule`/`MessageService` nei
     `providers` (il toast passa da `ToastService` via `AbstractComponent`, niente markup
     dedicato nel template), e il duplicato `utilityAggregatorMap`/`loadDependecies()` a livello
     di contenitore — mai consumato dal template del contenitore stesso (`utilities.component.html`
     originale non lo referenzia), dead code duplicato rispetto alla mappa già caricata e usata
     da `DataTableUtilitiesComponent` per il rendering della colonna "ID Aggregato". La logica di
     deep-link via query param (`selectedId`, `safeguard`, `supply_expiry_date_range`) va invece
     PRESERVATA integralmente: non è dead code, gestisce link esterni verso `/utilities` con
     filtro precompilato (es. dalla dashboard).

---

## File Structure

**Nuovi file:**
- `frontend/src/app/pages/utilities/utility-edit-dialog.component.ts`
- `frontend/src/app/pages/utilities/utility-edit-dialog.component.html`
- `frontend/src/app/pages/utilities/utility-filter-dialog.component.ts`
- `frontend/src/app/pages/utilities/utility-filter-dialog.component.html`

**File modificati:**
- `frontend/src/app/pages/utilities/data-table-utilities.component.ts` / `.html`
- `frontend/src/app/pages/utilities/search-utilities.component.ts` / `.html`
- `frontend/src/app/pages/utilities/utilities.component.ts` / `.html`

**File rimossi:**
- `frontend/src/app/pages/utilities/search-utilities.component.css` (dead: classi mai
  referenziate nel template, vedi Global Constraints punto 6).

**File temporaneamente modificati e ripristinati (solo Task 5, QA):**
- `frontend/src/app/app.routes.ts`

---

### Task 1: `DataTableUtilitiesComponent` — tabella con 41 colonne, azioni, export, sort, fix `ngAfterViewInit`

**Files:**
- Create (stub, sostituito per intero nel Task 2): `frontend/src/app/pages/utilities/utility-edit-dialog.component.ts`
- Modify: `frontend/src/app/pages/utilities/data-table-utilities.component.ts`
- Modify: `frontend/src/app/pages/utilities/data-table-utilities.component.html`

**Interfaces:**
- Consumes: `AbstractDataTableComponent<Utility>` (`editDialogComponent()`, `entityLabel()`,
  `openDeleteDialog()`, `restoreItem()`, `itemInstance()`, `exportToCSV(columns, filename)`,
  `exportCellValue()`, `getNestedValue()`, `loadColumnSelection()`/`saveColumnSelection()`,
  `ngAfterViewInit()`), `EditDialogData<Utility>`, `Utility.create()`, `ExpireState`,
  `ExportHelper.boolData()`/`ExportHelper.formatDate()`, `UtilityAggregatorsService.search()`.
- Produces: `UtilityEditDialogComponent` (stub in questo task, implementazione completa nel
  Task 2 — la superficie pubblica consumata da `editDialogComponent()` è solo il `Type<unknown>`,
  non cambia tra i due task). Nessuna modifica alla superficie pubblica verso
  `utilities.component.html` (`data`, `loading`, `onSave`, `onDelete`, `onCreate`, `onRestore`,
  `resetPagingTrigger`).

- [ ] **Step 1: Creare lo stub temporaneo di `UtilityEditDialogComponent`**

Necessario solo per permettere la compilazione di `DataTableUtilitiesComponent` in questo task
(che referenzia `UtilityEditDialogComponent` in `editDialogComponent()`). Il Task 2 lo sostituisce
per intero con l'implementazione completa — non è un file da mantenere, è un placeholder di
compilazione.

`frontend/src/app/pages/utilities/utility-edit-dialog.component.ts`:

```typescript
import {Component, inject} from '@angular/core';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {Utility} from './entity/utility.entity';

// STUB TEMPORANEO — sostituito per intero nel Task 2 di questo piano. Esiste solo per permettere
// la compilazione di DataTableUtilitiesComponent (Task 1), che referenzia questo componente in
// editDialogComponent().
@Component({
  selector: 'app-utility-edit-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data.mode === 'create' ? 'Aggiungi Utenza' : 'Modifica Utenza: ' + data.item.utility_id }}</h2>
    <mat-dialog-content>
      <p>Stub temporaneo — sostituito nel Task 2.</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button (click)="dialogRef.close(undefined)">Chiudi</button>
    </mat-dialog-actions>
  `
})
export class UtilityEditDialogComponent {
  protected data = inject<EditDialogData<Utility>>(MAT_DIALOG_DATA);
  protected dialogRef = inject(MatDialogRef<UtilityEditDialogComponent, Utility | undefined>);
}
```

- [ ] **Step 2: Verificare che lo stub compili da solo**

```bash
docker exec utenzepa-frontend-1 npx tsc --noEmit -p tsconfig.app.json
```

Expected: nessun nuovo errore introdotto da `utility-edit-dialog.component.ts` (gli errori
preesistenti sulle altre pagine non ancora toccate in questo task sono attesi e non vanno
considerati un blocco).

- [ ] **Step 3: Riscrivere `data-table-utilities.component.ts`**

`frontend/src/app/pages/utilities/data-table-utilities.component.ts`:

```typescript
import {Component, Type} from '@angular/core';
import {Router} from '@angular/router';
import {DatePipe} from '@angular/common';
import {MatTableModule} from '@angular/material/table';
import {MatSort, MatSortModule} from '@angular/material/sort';
import {MatPaginatorModule} from '@angular/material/paginator';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {MatSelectModule} from '@angular/material/select';
import {MatFormFieldModule} from '@angular/material/form-field';
import {FormsModule} from '@angular/forms';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ScreenSizeService} from '../../services/screen-size.service';
import {Utility} from './entity/utility.entity';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {UtilityEditDialogComponent} from './utility-edit-dialog.component';
import {ConfirmDialogComponent} from '../../core/components/confirm-dialog.component';
import {UtilityAggregatorsService} from '../utility-aggregator/utility-aggregator.service';
import {UtilityAggregator} from '../utility-aggregator/entity/utility-aggregator.entity';
import {ExpireState} from './enum/expire-state.enum';
import {ExportHelper} from '../../core/helpers/export.helper';
import {TruncatePipe} from '../../core/pipes/truncate.pipe';
import {FormatAmountPipe} from '../../core/pipes/format-amount.pipe';

@Component({
  selector: 'app-data-table-utilities',
  standalone: true,
  imports: [
    MatTableModule, MatSortModule, MatPaginatorModule, MatButtonModule, MatIconModule,
    MatTooltipModule, MatProgressBarModule, MatSelectModule, MatFormFieldModule, FormsModule,
    HasRoleDirective, TruncatePipe, FormatAmountPipe, DatePipe
  ],
  templateUrl: './data-table-utilities.component.html'
})
export class DataTableUtilitiesComponent extends AbstractDataTableComponent<Utility> {

  maxDescLength = 50;

  readonly allColumns: IColumnDef[] = [
    {field: 'id', header: 'ID', minWidth: '50px'},
    {field: 'utility_id', header: 'Codice (POD/PDR/Matricola)', minWidth: '180px'},
    {field: 'utilityType.name', header: 'Tipo Utenza', minWidth: '150px'},
    {field: 'supplier.company_name', header: 'Fornitore', minWidth: '150px'},
    {field: 'asset.asset_name', header: 'Fabbricato Associato', minWidth: '150px'},
    {field: 'costsBorneBy.name', header: 'Costi a Carico di', minWidth: '150px'},
    {field: 'aggregator.description', header: 'ID Aggregato', minWidth: '200px'},
    {field: 'meter_number', header: 'Numero Contatore', minWidth: '120px'},
    {field: 'utility_code', header: 'Codice Utenza o Cliente', minWidth: '150px'},
    {field: 'supplier_address', header: 'Indirizzo Fornitura', minWidth: '150px'},
    {field: 'utilityType.description', header: 'Tipo Uso Contatore', minWidth: '120px'},
    {field: 'consipAgreement.name', header: 'Convenzione CONSIP', minWidth: '120px'},
    {field: 'consip_order', header: 'Ordine CONSIP', minWidth: '120px'},
    {field: 'cig_contract', header: 'CIG Contratto', minWidth: '150px'},
    {field: 'order_number', header: 'Numero ordine', minWidth: '150px'},
    {field: 'wbs_gas_element', header: 'Elemento WBS Gas', minWidth: '120px'},
    {field: 'power_kw_electric', header: 'Potenza (kW)', minWidth: '100px'},
    {field: 'voltage_kw_electric', header: 'Tensione (V / kV)', minWidth: '100px'},
    {field: 'phase_type_electric', header: 'Tipo Fase', minWidth: '100px'},
    {field: 'estimated_annual_consumption', header: 'Consumo annuo presunto', minWidth: '150px'},
    {field: 'reported_consumption_year', header: 'Consumo annuo comunicato', minWidth: '150px'},
    {field: 'actual_consumption', header: 'Consumo effettivo', minWidth: '150px'},
    {field: 'security_deposit', header: 'Deposito Cauzionale', minWidth: '120px'},
    {field: 'supply_active', header: 'Fornitura Attiva', minWidth: '120px'},
    {field: 'meter_removed', header: 'Contatore Rimosso', minWidth: '120px'},
    {field: 'meter_verified', header: 'Contatore Verificato', minWidth: '120px'},
    {field: 'water_concession', header: 'Concessione acqua', minWidth: '120px'},
    {field: 'supply_start_date', header: 'Decorrenza fornitura', minWidth: '120px'},
    {field: 'supply_expiry_date', header: 'Scadenza affidamento', minWidth: '120px'},
    {field: 'management_expiry_date', header: 'Scadenza Gestione', minWidth: '120px'},
    {field: 'takeover_termination_date', header: 'Data voltura/cessazione', minWidth: '120px'},
    {field: 'disconnection_ability', header: 'Disalimentabilità', minWidth: '120px'},
    {field: 'maintenanceManager.code', header: 'Gestione Manutenzione', minWidth: '120px'},
    {field: 'budgetChapter.description', header: 'Capitolo di Spesa', minWidth: '200px'},
    {field: 'latitude', header: 'Latitudine', minWidth: '100px'},
    {field: 'longitude', header: 'Longitudine', minWidth: '100px'},
    {field: 'asset.utilizer', header: 'Utilizzatori', minWidth: '180px'},
    {field: 'specifications', header: 'Specifiche', minWidth: '200px'},
    {field: 'notes', header: 'Note', minWidth: '200px'},
    {field: 'additional_notes', header: 'Note Aggiuntive', minWidth: '200px'},
    {field: 'expiryStatus', header: 'Stato', minWidth: '120px'},
  ];

  private readonly defaultVisibleFields = new Set([
    'id', 'utility_id', 'utilityType.name', 'supplier.company_name',
    'asset.asset_name', 'costsBorneBy.name', 'supply_active', 'supply_expiry_date', 'expiryStatus',
  ]);

  private static readonly STORAGE_KEY = 'columns:utilities';

  selectedColumns: IColumnDef[] = this.loadColumnSelection(
    DataTableUtilitiesComponent.STORAGE_KEY, this.allColumns, this.defaultVisibleFields
  );

  get displayedColumns(): string[] {
    return ['actions', 'statusBadge', ...this.selectedColumns.map(c => c.field)];
  }

  compareColumns = (a: IColumnDef, b: IColumnDef): boolean => a?.field === b?.field;

  onColumnsChange(): void {
    this.saveColumnSelection(DataTableUtilitiesComponent.STORAGE_KEY, this.selectedColumns);
  }

  utilityAggregatorMap: { [key: number]: UtilityAggregator } = {};

  constructor(
    screen: ScreenSizeService,
    private readonly router: Router,
    private readonly utilityAggregatorService: UtilityAggregatorsService
  ) {
    super(screen);
    // Custom sort fedele all'originale PrimeNG customSort(event): path annidati (es.
    // "utilityType.name") + confronto stringhe con localeCompare('it') + fallback numerico, con
    // caso speciale per la colonna virtuale "asset.utilizer" (ordina sulla stringa concatenata
    // dei nomi utilizzatori, non su un campo diretto dell'entity — la stessa logica usata da
    // exportCellValue/getUtilizersNames più sotto). MatTableDataSource.sortingDataAccessor
    // restituisce un solo valore per colonna e non può applicare un comparator locale-aware a due
    // argomenti: si sovrascrive sortData, l'unico hook che riceve l'intero array e un comparator
    // a due argomenti (stesso pattern di DataTableInvoicesComponent, Gruppo D).
    this.dataSource.sortData = (data: Utility[], sort: MatSort): Utility[] => {
      const active = sort.active;
      const direction = sort.direction;
      if (!active || direction === '') return data;
      const order = direction === 'asc' ? 1 : -1;

      if (active === 'asset.utilizer') {
        return [...data].sort((a, b) =>
          order * this.getUtilizersNames(a).toLowerCase().localeCompare(this.getUtilizersNames(b).toLowerCase(), 'it')
        );
      }

      const getVal = (obj: any, path: string): any =>
        path.split('.').reduce((acc: any, key: string) => acc?.[key], obj);
      return [...data].sort((a, b) => {
        const v1 = getVal(a, active);
        const v2 = getVal(b, active);
        if (v1 == null && v2 == null) return 0;
        if (v1 == null) return order;
        if (v2 == null) return -order;
        if (typeof v1 === 'string' && typeof v2 === 'string') {
          return order * v1.localeCompare(v2, 'it');
        }
        const n1 = Number(v1), n2 = Number(v2);
        if (!isNaN(n1) && !isNaN(n2)) return order * (n1 - n2);
        return order * String(v1).localeCompare(String(v2), 'it');
      });
    };
  }

  override ngOnInit(): void {
    super.ngOnInit();
    this.utilityAggregatorService.search({deleted: false}).subscribe({
      next: (data: UtilityAggregator[]) => {
        this.utilityAggregatorMap = data.reduce((map, item) => {
          map[item.id] = item;
          return map;
        }, {} as { [key: number]: UtilityAggregator });
      },
      error: err => console.error('Errore nel caricamento degli Aggregati Utenza:', err)
    });
  }

  // CRITICO: AbstractDataTableComponent.ngAfterViewInit() (frontend/src/app/core/components/
  // abstract-data-table.component.ts, righe 62-65) collega sort e paginator al dataSource:
  //   ngAfterViewInit() {
  //     if (this.sort) this.dataSource.sort = this.sort;
  //     if (this.paginator) this.dataSource.paginator = this.paginator;
  //   }
  // Il vecchio componente PrimeNG sovrascriveva ngAfterViewInit() SENZA "override" e SENZA
  // chiamare super.ngAfterViewInit() (faceva solo this.screen.updateMinHeight()). Se questo
  // pattern venisse riprodotto tale e quale qui, il codice compilerebbe ma sort/paginator
  // resterebbero scollegati dal dataSource: click su un header colonna non ordinerebbe nulla,
  // il paginatore non cambierebbe pagina — nessun errore visibile, solo funzionalità silenziosamente
  // rotta. super.ngAfterViewInit() va chiamato per PRIMO.
  override ngAfterViewInit(): void {
    super.ngAfterViewInit();
    this.screen.updateMinHeight();
  }

  getUtilizersNames(utility: Utility): string {
    return utility.asset?.utilizerGrants?.map(u => u.utilizer?.name).join(', ') ?? '';
  }

  private readonly expireStateLabels: Record<ExpireState, string> = {
    [ExpireState.ACTIVE]: 'Attiva',
    [ExpireState.EXPIRING30]: 'In scadenza (30gg)',
    [ExpireState.EXPIRING60]: 'In scadenza (60gg)',
    [ExpireState.EXPIRING90]: 'In scadenza (90gg)',
    [ExpireState.EXPIRED]: 'Scaduta',
  };

  // CORRETTO rispetto all'originale: il vecchio getLabel() mappava solo 3 chiavi
  // (ACTIVE/EXPIRING/EXPIRED), lasciando EXPIRING30/EXPIRING60/EXPIRING90 (3 dei 5 valori reali
  // dell'enum ExpireState) senza etichetta — stringa vuota in tabella e in export CSV. Ora tutti
  // e 5 i valori hanno una label.
  getLabel(status: ExpireState | null | undefined): string {
    if (!status) return '';
    return this.expireStateLabels[status] ?? '';
  }

  navigateToAsset(assetId: number | null | undefined): void {
    if (!assetId) return;
    const url = this.router.serializeUrl(
      this.router.createUrlTree(['/building'], {queryParams: {selectedId: assetId}})
    );
    window.open(url, '_blank');
  }

  protected override exportCellValue(utility: Utility, field: string): string {
    switch (field) {
      case 'supply_active':
        return ExportHelper.boolData(utility.supply_active);
      case 'meter_removed':
        return ExportHelper.boolData(utility.meter_removed);
      case 'meter_verified':
        return ExportHelper.boolData(utility.meter_verified);
      case 'water_concession':
        return ExportHelper.formatDate(utility.water_concession);
      case 'supply_start_date':
        return ExportHelper.formatDate(utility.supply_start_date);
      case 'supply_expiry_date':
        return ExportHelper.formatDate(utility.supply_expiry_date);
      case 'management_expiry_date':
        return ExportHelper.formatDate(utility.management_expiry_date);
      case 'takeover_termination_date':
        return ExportHelper.formatDate(utility.takeover_termination_date);
      case 'security_deposit':
        return utility.security_deposit != null
          ? utility.security_deposit.toLocaleString('it-IT', {minimumFractionDigits: 2, maximumFractionDigits: 2})
          : '';
      case 'aggregator.description':
        return utility.aggregator_id_fk != null
          ? (this.utilityAggregatorMap[utility.aggregator_id_fk]?.description ?? '')
          : '';
      case 'budgetChapter.description':
        return utility.budgetChapter?.label ?? '';
      case 'asset.utilizer':
        return this.getUtilizersNames(utility);
      case 'expiryStatus':
        return this.getLabel(utility.expiryStatus ?? null);
      default:
        return String(this.getNestedValue(utility, field) ?? '');
    }
  }

  override exportToCSV(): void {
    super.exportToCSV(this.allColumns, 'utenze');
  }

  override itemInstance(): Utility {
    return Utility.create();
  }

  override editDialogComponent(): Type<unknown> {
    return UtilityEditDialogComponent;
  }

  protected override entityLabel(): string {
    return 'Utenza';
  }

  override openDeleteDialog(entity: Utility): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Elimina Utenza',
        message: `Sei sicuro di voler eliminare l'Utenza ${entity.utility_id}?`,
        confirmLabel: 'Elimina',
        danger: true
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onDelete.emit(entity);
    });
  }

  override restoreItem(entity: Utility): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Ripristina Utenza',
        message: `Riattiva Utenza ${entity.utility_id}?`,
        confirmLabel: 'Ripristina'
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onRestore.emit(entity);
    });
  }
}
```

Nota sui messaggi di conferma: il testo richiesto nella ricognizione include `**{{utility_id}}**`
(markdown grassetto) — rimosso perché `ConfirmDialogComponent` interpola `data.message` come
testo semplice (vedi Global Constraints), non renderizza markdown.

- [ ] **Step 4: Riscrivere `data-table-utilities.component.html`**

`frontend/src/app/pages/utilities/data-table-utilities.component.html`:

```html
<div style="display: flex; justify-content: space-between; align-items: center;">
  <h3>Elenco ({{ data.length }})</h3>
  <button mat-flat-button (click)="openCreateDialog()" [appHasRole]="['Admin', 'Operatore']">
    <mat-icon>add</mat-icon>
    Aggiungi Utenza
  </button>
</div>

@if (loading) {
  <mat-progress-bar mode="indeterminate"></mat-progress-bar>
}

<div style="display: flex; justify-content: space-between; margin: 0.75rem 0;">
  <mat-form-field subscriptSizing="dynamic" style="min-width: 220px;">
    <mat-label>Colonne visibili</mat-label>
    <mat-select multiple [(ngModel)]="selectedColumns" [compareWith]="compareColumns" (selectionChange)="onColumnsChange()">
      @for (col of allColumns; track col.field) {
        <mat-option [value]="col">{{ col.header }}</mat-option>
      }
    </mat-select>
  </mat-form-field>
  <button mat-stroked-button (click)="exportToCSV()">
    <mat-icon>ios_share</mat-icon>
    Esporta CSV
  </button>
</div>

<div style="overflow-x: auto;">
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

  <ng-container matColumnDef="statusBadge">
    <th mat-header-cell *matHeaderCellDef></th>
    <td mat-cell *matCellDef="let item">
      @if (item.supply_active) {
        <span class="status-badge status-badge-success">attiva</span>
      } @else {
        <span class="status-badge status-badge-secondary">non attiva</span>
      }
    </td>
  </ng-container>

  <ng-container matColumnDef="id">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>ID</th>
    <td mat-cell *matCellDef="let item">{{ item.id }}</td>
  </ng-container>

  <ng-container matColumnDef="utility_id">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Codice (POD/PDR/Matricola)</th>
    <td mat-cell *matCellDef="let item">{{ item.utility_id }}</td>
  </ng-container>

  <ng-container matColumnDef="utilityType.name">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Tipo Utenza</th>
    <td mat-cell *matCellDef="let item">{{ item.utilityType?.name }}</td>
  </ng-container>

  <ng-container matColumnDef="supplier.company_name">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Fornitore</th>
    <td mat-cell *matCellDef="let item">{{ item.supplier?.company_name }}</td>
  </ng-container>

  <ng-container matColumnDef="asset.asset_name">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Fabbricato Associato</th>
    <td mat-cell *matCellDef="let item">{{ item.asset?.asset_name }}</td>
  </ng-container>

  <ng-container matColumnDef="costsBorneBy.name">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Costi a Carico di</th>
    <td mat-cell *matCellDef="let item">
      @if (item.isHighlighted) {
        <span class="status-badge status-badge-warn">{{ item.costsBorneBy?.name || 'N/D' }}</span>
      } @else {
        {{ item.costsBorneBy?.name || 'N/D' }}
      }
    </td>
  </ng-container>

  <ng-container matColumnDef="aggregator.description">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>ID Aggregato</th>
    <td mat-cell *matCellDef="let item">
      {{ (item.aggregator_id_fk != null && utilityAggregatorMap[item.aggregator_id_fk]) ? (utilityAggregatorMap[item.aggregator_id_fk].description | truncate: maxDescLength) : 'N/D' }}
    </td>
  </ng-container>

  <ng-container matColumnDef="meter_number">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Numero Contatore</th>
    <td mat-cell *matCellDef="let item">{{ item.meter_number }}</td>
  </ng-container>

  <ng-container matColumnDef="utility_code">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Codice Utenza o Cliente</th>
    <td mat-cell *matCellDef="let item">{{ item.utility_code }}</td>
  </ng-container>

  <ng-container matColumnDef="supplier_address">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Indirizzo Fornitura</th>
    <td mat-cell *matCellDef="let item">{{ item.supplier_address }}</td>
  </ng-container>

  <ng-container matColumnDef="utilityType.description">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Tipo Uso Contatore</th>
    <td mat-cell *matCellDef="let item">{{ item.utilityType?.description }}</td>
  </ng-container>

  <ng-container matColumnDef="consipAgreement.name">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Convenzione CONSIP</th>
    <td mat-cell *matCellDef="let item">{{ item.consipAgreement?.name }}</td>
  </ng-container>

  <ng-container matColumnDef="consip_order">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Ordine CONSIP</th>
    <td mat-cell *matCellDef="let item">{{ item.consip_order }}</td>
  </ng-container>

  <ng-container matColumnDef="cig_contract">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>CIG Contratto</th>
    <td mat-cell *matCellDef="let item">{{ item.cig_contract }}</td>
  </ng-container>

  <ng-container matColumnDef="order_number">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Numero ordine</th>
    <td mat-cell *matCellDef="let item">{{ item.order_number }}</td>
  </ng-container>

  <ng-container matColumnDef="wbs_gas_element">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Elemento WBS Gas</th>
    <td mat-cell *matCellDef="let item">{{ item.wbs_gas_element }}</td>
  </ng-container>

  <ng-container matColumnDef="power_kw_electric">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Potenza (kW)</th>
    <td mat-cell *matCellDef="let item">{{ item.power_kw_electric }}</td>
  </ng-container>

  <ng-container matColumnDef="voltage_kw_electric">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Tensione (V / kV)</th>
    <td mat-cell *matCellDef="let item">{{ item.voltage_kw_electric }}</td>
  </ng-container>

  <ng-container matColumnDef="phase_type_electric">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Tipo Fase</th>
    <td mat-cell *matCellDef="let item">{{ item.phase_type_electric }}</td>
  </ng-container>

  <ng-container matColumnDef="estimated_annual_consumption">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Consumo annuo presunto</th>
    <td mat-cell *matCellDef="let item">{{ item.estimated_annual_consumption }}</td>
  </ng-container>

  <ng-container matColumnDef="reported_consumption_year">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Consumo annuo comunicato</th>
    <td mat-cell *matCellDef="let item">{{ item.reported_consumption_year }}</td>
  </ng-container>

  <ng-container matColumnDef="actual_consumption">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Consumo effettivo</th>
    <td mat-cell *matCellDef="let item">{{ item.actual_consumption }}</td>
  </ng-container>

  <ng-container matColumnDef="security_deposit">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Deposito Cauzionale</th>
    <td mat-cell *matCellDef="let item">{{ item.security_deposit | formatAmount }}</td>
  </ng-container>

  <ng-container matColumnDef="supply_active">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Fornitura Attiva</th>
    <td mat-cell *matCellDef="let item">
      <mat-icon [style.color]="item.supply_active ? '#22c55e' : '#ef4444'">
        {{ item.supply_active ? 'check_circle' : 'cancel' }}
      </mat-icon>
    </td>
  </ng-container>

  <ng-container matColumnDef="meter_removed">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Contatore Rimosso</th>
    <td mat-cell *matCellDef="let item">
      <mat-icon [style.color]="item.meter_removed ? '#22c55e' : '#ef4444'">
        {{ item.meter_removed ? 'check_circle' : 'cancel' }}
      </mat-icon>
    </td>
  </ng-container>

  <ng-container matColumnDef="meter_verified">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Contatore Verificato</th>
    <td mat-cell *matCellDef="let item">
      <mat-icon [style.color]="item.meter_verified ? '#22c55e' : '#ef4444'">
        {{ item.meter_verified ? 'check_circle' : 'cancel' }}
      </mat-icon>
    </td>
  </ng-container>

  <ng-container matColumnDef="water_concession">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Concessione acqua</th>
    <td mat-cell *matCellDef="let item">{{ item.water_concession | date: 'dd/MM/yyyy' }}</td>
  </ng-container>

  <ng-container matColumnDef="supply_start_date">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Decorrenza fornitura</th>
    <td mat-cell *matCellDef="let item">{{ item.supply_start_date | date: 'dd/MM/yyyy' }}</td>
  </ng-container>

  <ng-container matColumnDef="supply_expiry_date">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Scadenza affidamento</th>
    <td mat-cell *matCellDef="let item">{{ item.supply_expiry_date | date: 'dd/MM/yyyy' }}</td>
  </ng-container>

  <ng-container matColumnDef="management_expiry_date">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Scadenza Gestione</th>
    <td mat-cell *matCellDef="let item">{{ item.management_expiry_date | date: 'dd/MM/yyyy' }}</td>
  </ng-container>

  <ng-container matColumnDef="takeover_termination_date">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Data voltura/cessazione</th>
    <td mat-cell *matCellDef="let item">{{ item.takeover_termination_date | date: 'dd/MM/yyyy' }}</td>
  </ng-container>

  <ng-container matColumnDef="disconnection_ability">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Disalimentabilità</th>
    <td mat-cell *matCellDef="let item">{{ item.disconnection_ability }}</td>
  </ng-container>

  <ng-container matColumnDef="maintenanceManager.code">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Gestione Manutenzione</th>
    <td mat-cell *matCellDef="let item">{{ item.maintenanceManager?.code }}</td>
  </ng-container>

  <ng-container matColumnDef="budgetChapter.description">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Capitolo di Spesa</th>
    <td mat-cell *matCellDef="let item">
      @if (item.budgetChapter?.label) {
        <span [matTooltip]="item.budgetChapter!.label">{{ item.budgetChapter?.label | truncate: maxDescLength }}</span>
      }
    </td>
  </ng-container>

  <ng-container matColumnDef="latitude">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Latitudine</th>
    <td mat-cell *matCellDef="let item">{{ item.latitude }}</td>
  </ng-container>

  <ng-container matColumnDef="longitude">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Longitudine</th>
    <td mat-cell *matCellDef="let item">{{ item.longitude }}</td>
  </ng-container>

  <ng-container matColumnDef="asset.utilizer">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Utilizzatori</th>
    <td mat-cell *matCellDef="let item">
      @if (item.asset?.utilizerGrants?.length) {
        <span [matTooltip]="getUtilizersNames(item)">{{ getUtilizersNames(item) | truncate: maxDescLength }}</span>
      }
    </td>
  </ng-container>

  <ng-container matColumnDef="specifications">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Specifiche</th>
    <td mat-cell *matCellDef="let item">
      @if (item.specifications) {
        <span [matTooltip]="item.specifications">{{ item.specifications | truncate: maxDescLength }}</span>
      }
    </td>
  </ng-container>

  <ng-container matColumnDef="notes">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Note</th>
    <td mat-cell *matCellDef="let item">
      @if (item.notes) {
        <span [matTooltip]="item.notes">{{ item.notes | truncate: maxDescLength }}</span>
      }
    </td>
  </ng-container>

  <ng-container matColumnDef="additional_notes">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Note Aggiuntive</th>
    <td mat-cell *matCellDef="let item">
      @if (item.additional_notes) {
        <span [matTooltip]="item.additional_notes">{{ item.additional_notes | truncate: maxDescLength }}</span>
      }
    </td>
  </ng-container>

  <ng-container matColumnDef="expiryStatus">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Stato</th>
    <td mat-cell *matCellDef="let item">{{ getLabel(item.expiryStatus) }}</td>
  </ng-container>

  <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
  <tr mat-row *matRowDef="let row; columns: displayedColumns;" [class.row-deleted]="row.deleted"></tr>

  <tr class="mat-row" *matNoDataRow>
    <td class="mat-cell" [attr.colspan]="displayedColumns.length">Nessuna utenza trovata.</td>
  </tr>
</table>
</div>

<mat-paginator #paginator [pageSizeOptions]="rowsPerPageOptions" [pageSize]="10"></mat-paginator>

<style>
  .row-deleted {
    background-color: #fcebeb;
    opacity: 0.7;
    text-decoration: line-through;
  }

  .status-badge {
    display: inline-block;
    padding: 0.15rem 0.6rem;
    border-radius: 1rem;
    font-size: 0.75rem;
    font-weight: 600;
    white-space: nowrap;
  }

  .status-badge-success {
    background-color: #dcfce7;
    color: #166534;
  }

  .status-badge-secondary {
    background-color: #e5e7eb;
    color: #374151;
  }

  .status-badge-warn {
    background-color: #fef3c7;
    color: #92400e;
  }
</style>
```

- [ ] **Step 5: Verificare la compilazione**

```bash
docker exec utenzepa-frontend-1 npx tsc --noEmit -p tsconfig.app.json
```

Expected: nessun nuovo errore sotto `src/app/pages/utilities/data-table-utilities.component.ts`
o `.html`. Verificare in particolare che tutte le 41 chiavi di `allColumns` abbiano un
`<ng-container matColumnDef="...">` corrispondente nel template (un `matColumnDef` mancante per
una colonna selezionabile da `allColumns` genera un errore runtime "Could not find column" solo
quando quella colonna viene selezionata, non a compile-time — verificare manualmente l'elenco,
non fidarsi solo di `tsc`).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/pages/utilities/data-table-utilities.component.ts frontend/src/app/pages/utilities/data-table-utilities.component.html frontend/src/app/pages/utilities/utility-edit-dialog.component.ts
git commit -m "refactor(frontend): migra data-table utilities a Angular Material (Gruppo E, Task 1)"
```

---

### Task 2: `UtilityEditDialogComponent` — dialog di modifica/creazione con campi condizionali

**Files:**
- Modify (sostituzione completa dello stub del Task 1): `frontend/src/app/pages/utilities/utility-edit-dialog.component.ts`
- Create: `frontend/src/app/pages/utilities/utility-edit-dialog.component.html`

**Interfaces:**
- Consumes: `EditDialogData<Utility>` (`mode`, `item`), `Utility`, `UtilityType`, `HardType`,
  `Phase`, `Asset`, `Supplier`, `ConsipAgreement`, `UtilityAggregator`, `MaintenanceManager`,
  `CostsBorneBy`, `BudgetChapter`, `UseTypeDescription`, `TOption`, servizi
  `AssetService`/`SuppliersService`/`UtilityAggregatorsService`/`BudgetChaptersService`/
  `CostsBorneByService`/`MaintenanceManagersService`/`ConsipAgreementService`/
  `UtilityTypesService` (tutti con `.search(filters?)`), `AuthService.getCurrentUser()`.
- Produces: `UtilityEditDialogComponent` (sostituisce lo stub del Task 1 — stessa superficie
  pubblica verso `DataTableUtilitiesComponent.editDialogComponent()`, nessuna modifica richiesta
  a quel file in questo task).

- [ ] **Step 1: Riscrivere `utility-edit-dialog.component.ts` (sostituisce interamente lo stub del Task 1)**

`frontend/src/app/pages/utilities/utility-edit-dialog.component.ts`:

```typescript
import {Component, inject, OnInit} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {Router} from '@angular/router';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule, MatSelectChange} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatNativeDateModule} from '@angular/material/core';
import {plainToInstance} from 'class-transformer';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {AuthService} from '../../services/auth.service';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';
import {Utility} from './entity/utility.entity';
import {UtilityType} from '../utility-types/entity/utility-type.entity';
import {HardType} from '../utility-types/enum/hard-type.enum';
import {Phase} from './enum/phase.enum';
import {Asset} from '../assets/entity/asset.entity';
import {Supplier} from '../suppliers/entity/supplier.entity';
import {ConsipAgreement} from '../consip-agreement/entity/consip-agreement.entity';
import {UseTypeDescription} from '../purpose/enum/use-type.enum';
import {TOption} from '../../core/types/option.interface';
import {AssetService} from '../assets/asset.service';
import {SuppliersService} from '../suppliers/suppliers.service';
import {UtilityAggregatorsService} from '../utility-aggregator/utility-aggregator.service';
import {BudgetChaptersService} from '../budget-chapters/budget-chapters.service';
import {CostsBorneByService} from '../costs-borne-by/costs-borne-by.service';
import {MaintenanceManagersService} from '../maintenance-managers/maintenance-managers.service';
import {ConsipAgreementService} from '../consip-agreement/consip-agreement.service';
import {UtilityTypesService} from '../utility-types/utility-types.service';

@Component({
  selector: 'app-utility-edit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatTooltipModule, MatDatepickerModule, MatNativeDateModule,
    HasRoleDirective, ReadOnlyDirective
  ],
  templateUrl: './utility-edit-dialog.component.html'
})
export class UtilityEditDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<UtilityEditDialogComponent, Utility | undefined>);
  private authService = inject(AuthService);
  private router = inject(Router);
  private assetsService = inject(AssetService);
  private suppliersService = inject(SuppliersService);
  private utilityAggregatorService = inject(UtilityAggregatorsService);
  private budgetChapterService = inject(BudgetChaptersService);
  private costsBorneByService = inject(CostsBorneByService);
  private maintenanceManagerService = inject(MaintenanceManagersService);
  private consipService = inject(ConsipAgreementService);
  private utilityTypeService = inject(UtilityTypesService);
  protected data = inject<EditDialogData<Utility>>(MAT_DIALOG_DATA);

  isNew = this.data.mode === 'create';
  maxDescLength = 50;
  readonly useTypeDescription = UseTypeDescription;

  utilityTypeOptions: UtilityType[] = [];
  assetOptions: Asset[] = [];
  supplierOptions: Supplier[] = [];
  consipAgreementOptions: ConsipAgreement[] = [];
  budgetChapterOptions: TOption[] = [];
  aggregatorOptions: TOption[] = [];
  costsBorneByOptions: TOption[] = [];
  maintenanceOptions: TOption[] = [];

  booleanOptions: TOption[] = [
    {label: 'Sì', value: true},
    {label: 'No', value: false}
  ];

  phaseTypeOptions: TOption[] = [
    {label: 'Monofase', value: Phase.SINGLE_PHASE},
    {label: 'Trifase', value: Phase.THREE_PHASE},
    {label: 'N/A', value: Phase.NOT_APPLICABLE}
  ];

  // Inizializzato dall'utilityType già presente sull'item (edit) o null (create — Utility.create()
  // non popola mai utilityType, quindi qui parte sempre null in creazione: nessun reset esplicito
  // aggiuntivo necessario, il valore iniziale corretto discende direttamente dai dati in ingresso).
  selectedHardType: HardType | null = this.data.item.utilityType?.hard_type ?? null;

  get showLightFields(): boolean { return this.selectedHardType === HardType.LIGHT; }
  get showGasFields(): boolean { return this.selectedHardType === HardType.GAS; }

  // Replica locale di AbstractDataTableComponent.resolveOnRelation(), non accessibile da un
  // MatDialog standalone (non estende quella classe base) — stessa soluzione già adottata per
  // AssetEditDialogComponent nel Gruppo D. Se la relazione (es. "asset") non è popolata (FK
  // orfana o non caricata dal backend), il campo FK collegato parte null invece di mostrare un
  // id non risolvibile nella select.
  private resolveOnRelation<K extends keyof Utility>(relation: keyof Utility, prop: K, data?: Partial<Utility>): Utility[K] | null {
    return (data as any)?.[relation] != null ? ((data as any)?.[prop] ?? null) : null;
  }

  private toDate(v: unknown): Date | null {
    return v ? new Date(v as string) : null;
  }

  form = this.fb.group({
    additional_notes: [this.data.item.additional_notes ?? ''],
    aggregator_id_fk: [this.resolveOnRelation('aggregator', 'aggregator_id_fk', this.data.item) ?? null],
    asset_id_fk: [this.resolveOnRelation('asset', 'asset_id_fk', this.data.item) ?? null, Validators.required],
    budget_chapter_code_fk: [this.resolveOnRelation('budgetChapter', 'budget_chapter_code_fk', this.data.item) ?? null, Validators.required],
    cig_contract: [this.data.item.cig_contract ?? ''],
    consip_agreement_id: [this.resolveOnRelation('consipAgreement', 'consip_agreement_id', this.data.item) ?? null],
    consip_order: [this.data.item.consip_order ?? ''],
    order_number: [this.data.item.order_number ?? ''],
    costs_borne_by_id_fk: [this.resolveOnRelation('costsBorneBy', 'costs_borne_by_id_fk', this.data.item) ?? null, Validators.required],
    disconnection_ability: [this.data.item.disconnection_ability ?? ''],
    estimated_annual_consumption: [this.data.item.estimated_annual_consumption ?? 0, Validators.required],
    latitude: [this.data.item.latitude ?? ''],
    longitude: [this.data.item.longitude ?? ''],
    maintenance_management_id_fk: [this.resolveOnRelation('maintenanceManager', 'maintenance_management_id_fk', this.data.item) ?? null],
    management_expiry_date: [this.toDate(this.data.item.management_expiry_date)],
    meter_number: [this.data.item.meter_number ?? ''],
    meter_removed: [this.data.item.meter_removed ?? null],
    meter_verified: [this.data.item.meter_verified ?? null],
    notes: [this.data.item.notes ?? ''],
    phase_type_electric: [this.data.item.phase_type_electric ?? null],
    power_kw_electric: [this.data.item.power_kw_electric ?? null],
    reported_consumption_year: [this.data.item.reported_consumption_year ?? 0, Validators.required],
    actual_consumption: [this.data.item.actual_consumption ?? 0, Validators.required],
    security_deposit: [this.data.item.security_deposit ?? 0, Validators.required],
    specifications: [this.data.item.specifications ?? ''],
    supplier_address: [this.data.item.supplier_address ?? ''],
    supplier_id_fk: [this.resolveOnRelation('supplier', 'supplier_id_fk', this.data.item) ?? null],
    supply_active: [this.data.item.supply_active ?? null],
    supply_expiry_date: [this.toDate(this.data.item.supply_expiry_date)],
    supply_start_date: [this.toDate(this.data.item.supply_start_date)],
    takeover_termination_date: [this.toDate(this.data.item.takeover_termination_date)],
    utility_code: [this.data.item.utility_code ?? ''],
    utility_id: [{value: this.data.item.utility_id ?? '', disabled: !this.isNew}, Validators.required],
    utility_type_id_fk: [this.data.item.utility_type_id_fk ?? null, Validators.required],
    voltage_kw_electric: [this.data.item.voltage_kw_electric ?? ''],
    water_concession: [this.toDate(this.data.item.water_concession)],
    wbs_gas_element: [this.data.item.wbs_gas_element ?? ''],
  });

  constructor() {
    const role = this.authService.getCurrentUser()?.role;
    if (!role || role === 'Lettore') {
      this.form.disable();
    }
  }

  ngOnInit(): void {
    this.assetsService.search({deleted: false}).subscribe({
      next: data => this.assetOptions = data.sort((a, b) => (a.asset_name ?? '').localeCompare(b.asset_name ?? '')),
      error: err => console.error('Errore nel caricamento dei Fabbricati:', err)
    });
    this.suppliersService.search({deleted: false}).subscribe({
      next: data => this.supplierOptions = data.sort((a, b) => (a.supplier_id ?? '').localeCompare(b.supplier_id ?? '')),
      error: err => console.error('Errore nel caricamento dei fornitori:', err)
    });
    this.consipService.search({deleted: false}).subscribe({
      next: data => this.consipAgreementOptions = data.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')),
      error: err => console.error('Errore nel caricamento delle convenzioni CONSIP:', err)
    });
    this.utilityAggregatorService.search({deleted: false}).subscribe({
      next: data => this.aggregatorOptions = data
        .map(a => ({label: a.description ?? '', value: a.id}))
        .sort((a, b) => a.label.localeCompare(b.label)),
      error: err => console.error('Errore nel caricamento degli Aggregati Utenza:', err)
    });
    this.budgetChapterService.search({deleted: false}).subscribe({
      next: data => this.budgetChapterOptions = data
        .map(b => ({label: b.description ?? '', value: b.id}))
        .sort((a, b) => a.label.localeCompare(b.label)),
      error: err => console.error('Errore nel caricamento dei Capitoli di Spesa:', err)
    });
    this.costsBorneByService.search().subscribe({
      next: data => this.costsBorneByOptions = data
        .map(c => ({label: c.name ?? '', value: c.id}))
        .sort((a, b) => a.label.localeCompare(b.label)),
      error: err => console.error('Errore nel caricamento Costi a Carico di:', err)
    });
    this.maintenanceManagerService.search().subscribe({
      next: data => this.maintenanceOptions = data
        .map(m => ({label: m.code ?? '', value: m.id}))
        .sort((a, b) => a.label.localeCompare(b.label)),
      error: err => console.error('Errore nel caricamento Gestori Manutenzione:', err)
    });
    this.utilityTypeService.search().subscribe({
      next: data => this.utilityTypeOptions = data,
      error: err => console.error('Errore nel caricamento dei Tipi Utenza:', err)
    });
  }

  onUtilityTypeChange(event: MatSelectChange): void {
    const selected = this.utilityTypeOptions.find(t => t.id === event.value) ?? null;
    this.selectedHardType = selected?.hard_type ?? null;
  }

  onConsipAgreementChange(event: MatSelectChange): void {
    const selectedAgreementId: number | null = event.value;
    if (selectedAgreementId) {
      const agreement = this.consipAgreementOptions.find(a => a.id === selectedAgreementId);
      if (agreement?.supplier_id) {
        this.form.patchValue({supplier_id_fk: agreement.supplier_id});
      }
    } else {
      this.form.patchValue({supplier_id_fk: null});
    }
  }

  navigateToAsset(assetId: number | null | undefined): void {
    if (!assetId) return;
    const url = this.router.serializeUrl(
      this.router.createUrlTree(['/building'], {queryParams: {selectedId: assetId}})
    );
    window.open(url, '_blank');
  }

  navigateToMaps(lat: string | null | undefined, lon: string | null | undefined): void {
    if (lat == null || lon == null) return;
    window.open(`https://www.google.com/maps/@${lat},${lon},15z?q=${lat},${lon}`, '_blank');
  }

  resolveMapCoordsFromForm(): { lat: string; lon: string } | null {
    const isValid = (v: string | null | undefined): v is string => v != null && v.trim() !== '';
    const lat = this.form.controls.latitude.value;
    const lon = this.form.controls.longitude.value;
    if (isValid(lat) && isValid(lon)) return {lat, lon};
    const assetLat = this.data.item.asset?.latitude;
    const assetLon = this.data.item.asset?.longitude;
    if (isValid(assetLat) && isValid(assetLon)) return {lat: assetLat, lon: assetLon};
    return null;
  }

  isMapCoordsFromAsset(): boolean {
    const isValid = (v: string | null | undefined): v is string => v != null && v.trim() !== '';
    const lat = this.form.controls.latitude.value;
    const lon = this.form.controls.longitude.value;
    if (isValid(lat) && isValid(lon)) return false;
    return isValid(this.data.item.asset?.latitude) && isValid(this.data.item.asset?.longitude);
  }

  save(): void {
    if (!this.form.valid) return;
    const result = plainToInstance(Utility, {
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

Nota sul conteggio dei campi: 37 controlli reali nel `FormGroup` (verificato uno per uno sul
sorgente `buildForm()`, non i 33 stimati nella ricognizione preliminare — vedi Global Constraints
punto 4). I 9 required restano quelli attesi.

- [ ] **Step 2: Creare `utility-edit-dialog.component.html`**

`frontend/src/app/pages/utilities/utility-edit-dialog.component.html`:

```html
<h2 mat-dialog-title>
  {{ isNew ? 'Aggiungi Utenza' : 'Modifica Utenza: ' + data.item.utility_id }}
</h2>

<mat-dialog-content>
  <form [formGroup]="form" [readOnly]="['Lettore']" style="display: flex; flex-direction: column; gap: 1.5rem;">

    <fieldset style="border: 1px solid #e5e7eb; border-radius: 6px; padding: 1rem;">
      <legend style="padding: 0 0.5rem; font-weight: 600;">Identificazione</legend>
      <div style="display: flex; flex-wrap: wrap; gap: 1rem;">
        <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
          <mat-label>Codice Utenza (POD/PDR) *</mat-label>
          <input matInput formControlName="utility_id">
          @if (form.controls.utility_id.invalid && form.controls.utility_id.touched) {
            <mat-error>Obbligatorio</mat-error>
          }
        </mat-form-field>

        <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
          <mat-label>Numero Contatore</mat-label>
          <input matInput formControlName="meter_number">
        </mat-form-field>

        <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
          <mat-label>Tipo Uso Contatore *</mat-label>
          <mat-select formControlName="utility_type_id_fk" (selectionChange)="onUtilityTypeChange($event)">
            @for (opt of utilityTypeOptions; track opt.id) {
              <mat-option [value]="opt.id">{{ opt.name }}</mat-option>
            }
          </mat-select>
          @if (form.controls.utility_type_id_fk.invalid && form.controls.utility_type_id_fk.touched) {
            <mat-error>Obbligatorio</mat-error>
          }
        </mat-form-field>

        <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
          <mat-label>Codice Utenza o Cliente</mat-label>
          <input matInput formControlName="utility_code">
        </mat-form-field>

        <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
          <mat-label>Immobile Associato *</mat-label>
          <mat-select formControlName="asset_id_fk">
            @for (opt of assetOptions; track opt.id) {
              <mat-option [value]="opt.id">{{ opt.asset_name }}</mat-option>
            }
          </mat-select>
          @if (form.controls.asset_id_fk.invalid && form.controls.asset_id_fk.touched) {
            <mat-error>Obbligatorio</mat-error>
          }
        </mat-form-field>

        <button mat-icon-button type="button" [disabled]="!form.controls.asset_id_fk.value"
                (click)="navigateToAsset(form.controls.asset_id_fk.value)"
                matTooltip="Vai al dettaglio immobile">
          <mat-icon>apartment</mat-icon>
        </button>
        <button mat-icon-button type="button" [disabled]="!resolveMapCoordsFromForm()"
                [style.color]="isMapCoordsFromAsset() ? '#3b82f6' : null"
                (click)="navigateToMaps(resolveMapCoordsFromForm()?.lat, resolveMapCoordsFromForm()?.lon)"
                [matTooltip]="resolveMapCoordsFromForm() ? 'Mostra su mappa' : 'Funzionalità non disponibile: mancano le coordinate.'">
          <mat-icon>location_on</mat-icon>
        </button>

        <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
          <mat-label>ID Aggregato</mat-label>
          <mat-select formControlName="aggregator_id_fk">
            <mat-option [value]="null">Nessuno</mat-option>
            @for (opt of aggregatorOptions; track opt.value) {
              <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field style="flex: 2 1 calc(50% - 0.75rem);">
          <mat-label>Indirizzo Fornitura</mat-label>
          <input matInput formControlName="supplier_address">
        </mat-form-field>

        <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
          <mat-label>Latitudine</mat-label>
          <input matInput formControlName="latitude">
        </mat-form-field>

        <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
          <mat-label>Longitudine</mat-label>
          <input matInput formControlName="longitude">
        </mat-form-field>
      </div>
    </fieldset>

    <fieldset style="border: 1px solid #e5e7eb; border-radius: 6px; padding: 1rem;">
      <legend style="padding: 0 0.5rem; font-weight: 600;">Caratteristiche tecniche</legend>
      <div style="display: flex; flex-wrap: wrap; gap: 1rem;">
        @if (showLightFields) {
          <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
            <mat-label>Potenza (kW)</mat-label>
            <input matInput type="number" step="0.01" formControlName="power_kw_electric">
          </mat-form-field>
          <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
            <mat-label>Tensione (V / kV)</mat-label>
            <input matInput formControlName="voltage_kw_electric">
          </mat-form-field>
          <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
            <mat-label>Tipo Fase</mat-label>
            <mat-select formControlName="phase_type_electric">
              @for (opt of phaseTypeOptions; track opt.value) {
                <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }

        <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
          <mat-label>Disalimentabilità utenza</mat-label>
          <input matInput formControlName="disconnection_ability">
        </mat-form-field>

        @if (showGasFields) {
          <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
            <mat-label>Elemento WBS Gas</mat-label>
            <input matInput formControlName="wbs_gas_element">
          </mat-form-field>
        }
      </div>
    </fieldset>

    <fieldset style="border: 1px solid #e5e7eb; border-radius: 6px; padding: 1rem;">
      <legend style="padding: 0 0.5rem; font-weight: 600;">Stato utenza</legend>
      <div style="display: flex; flex-wrap: wrap; gap: 1rem;">
        <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
          <mat-label>Fornitura Attiva</mat-label>
          <mat-select formControlName="supply_active">
            @for (opt of booleanOptions; track opt.value) {
              <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
          <mat-label>Contatore Rimosso</mat-label>
          <mat-select formControlName="meter_removed">
            @for (opt of booleanOptions; track opt.value) {
              <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
          <mat-label>Contatore Verificato</mat-label>
          <mat-select formControlName="meter_verified">
            @for (opt of booleanOptions; track opt.value) {
              <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
          <mat-label>Data Voltura o Cessazione Contatore</mat-label>
          <input matInput [matDatepicker]="takeoverPicker" formControlName="takeover_termination_date">
          <mat-datepicker-toggle matSuffix [for]="takeoverPicker"></mat-datepicker-toggle>
          <mat-datepicker #takeoverPicker></mat-datepicker>
        </mat-form-field>
      </div>
    </fieldset>

    <fieldset style="border: 1px solid #e5e7eb; border-radius: 6px; padding: 1rem;">
      <legend style="padding: 0 0.5rem; font-weight: 600;">Dati contrattuali</legend>
      <div style="display: flex; flex-wrap: wrap; gap: 1rem;">
        <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
          <mat-label>Convenzione CONSIP</mat-label>
          <mat-select formControlName="consip_agreement_id" (selectionChange)="onConsipAgreementChange($event)">
            <mat-option [value]="null">Nessuna</mat-option>
            @for (opt of consipAgreementOptions; track opt.id) {
              <mat-option [value]="opt.id">{{ opt.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
          <mat-label>Ordine CONSIP</mat-label>
          <input matInput formControlName="consip_order">
        </mat-form-field>

        <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
          <mat-label>Fornitore</mat-label>
          <mat-select formControlName="supplier_id_fk">
            <mat-option [value]="null">Nessuno</mat-option>
            @for (opt of supplierOptions; track opt.id) {
              <mat-option [value]="opt.id">{{ opt.company_name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
          <mat-label>Data Inizio Fornitura</mat-label>
          <input matInput [matDatepicker]="supplyStartPicker" formControlName="supply_start_date">
          <mat-datepicker-toggle matSuffix [for]="supplyStartPicker"></mat-datepicker-toggle>
          <mat-datepicker #supplyStartPicker></mat-datepicker>
        </mat-form-field>

        <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
          <mat-label>Scadenza Affidamento Fornitura</mat-label>
          <input matInput [matDatepicker]="supplyExpiryPicker" formControlName="supply_expiry_date">
          <mat-datepicker-toggle matSuffix [for]="supplyExpiryPicker"></mat-datepicker-toggle>
          <mat-datepicker #supplyExpiryPicker></mat-datepicker>
        </mat-form-field>

        <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
          <mat-label>Fornitore Manutenzione</mat-label>
          <mat-select formControlName="maintenance_management_id_fk">
            <mat-option [value]="null">Nessuno</mat-option>
            @for (opt of maintenanceOptions; track opt.value) {
              <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
          <mat-label>Scadenza Affidamento Manutenzione</mat-label>
          <input matInput [matDatepicker]="managementExpiryPicker" formControlName="management_expiry_date">
          <mat-datepicker-toggle matSuffix [for]="managementExpiryPicker"></mat-datepicker-toggle>
          <mat-datepicker #managementExpiryPicker></mat-datepicker>
        </mat-form-field>

        <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
          <mat-label>Concessione acqua</mat-label>
          <input matInput [matDatepicker]="waterConcessionPicker" formControlName="water_concession">
          <mat-datepicker-toggle matSuffix [for]="waterConcessionPicker"></mat-datepicker-toggle>
          <mat-datepicker #waterConcessionPicker></mat-datepicker>
        </mat-form-field>

        <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
          <mat-label>Costi a Carico di *</mat-label>
          <mat-select formControlName="costs_borne_by_id_fk">
            @for (opt of costsBorneByOptions; track opt.value) {
              <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
            }
          </mat-select>
          @if (form.controls.costs_borne_by_id_fk.invalid && form.controls.costs_borne_by_id_fk.touched) {
            <mat-error>Obbligatorio</mat-error>
          }
        </mat-form-field>

        <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
          <mat-label>CIG Contratto</mat-label>
          <input matInput formControlName="cig_contract">
        </mat-form-field>

        <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
          <mat-label>Numero ordine</mat-label>
          <input matInput formControlName="order_number">
        </mat-form-field>
      </div>
    </fieldset>

    <fieldset style="border: 1px solid #e5e7eb; border-radius: 6px; padding: 1rem;">
      <legend style="padding: 0 0.5rem; font-weight: 600;">Consumi</legend>
      <div style="display: flex; flex-wrap: wrap; gap: 1rem;">
        <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
          <mat-label>Capitolo di Spesa *</mat-label>
          <mat-select formControlName="budget_chapter_code_fk">
            @for (opt of budgetChapterOptions; track opt.value) {
              <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
            }
          </mat-select>
          @if (form.controls.budget_chapter_code_fk.invalid && form.controls.budget_chapter_code_fk.touched) {
            <mat-error>Obbligatorio</mat-error>
          }
        </mat-form-field>

        <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
          <mat-label>Consumo annuo presunto</mat-label>
          <input matInput type="number" formControlName="estimated_annual_consumption">
          @if (form.controls.estimated_annual_consumption.invalid && form.controls.estimated_annual_consumption.touched) {
            <mat-error>Obbligatorio</mat-error>
          }
        </mat-form-field>

        <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
          <mat-label>Consumo annuo comunicato Consip</mat-label>
          <input matInput type="number" formControlName="reported_consumption_year">
          @if (form.controls.reported_consumption_year.invalid && form.controls.reported_consumption_year.touched) {
            <mat-error>Obbligatorio</mat-error>
          }
        </mat-form-field>

        <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
          <mat-label>Consumo Annuo da Fatturazione</mat-label>
          <input matInput type="number" formControlName="actual_consumption">
          @if (form.controls.actual_consumption.invalid && form.controls.actual_consumption.touched) {
            <mat-error>Obbligatorio</mat-error>
          }
        </mat-form-field>

        <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
          <mat-label>Deposito Cauzionale (€)</mat-label>
          <input matInput type="number" step="0.01" formControlName="security_deposit">
          @if (form.controls.security_deposit.invalid && form.controls.security_deposit.touched) {
            <mat-error>Obbligatorio</mat-error>
          }
        </mat-form-field>
      </div>
    </fieldset>

    @if (!isNew) {
      <fieldset style="border: 1px solid #e5e7eb; border-radius: 6px; padding: 1rem;">
        <legend style="padding: 0 0.5rem; font-weight: 600;">Finalità d'uso</legend>
        @if (data.item.utilityType?.purposes?.length) {
          <ul style="margin: 0; padding-left: 1.5rem; list-style-type: disc;">
            @for (purpose of data.item.utilityType!.purposes; track purpose.id) {
              <li>{{ purpose.name }} ({{ useTypeDescription[purpose.use_type] }})</li>
            }
          </ul>
        } @else {
          <span style="color: #666; font-style: italic;">Nessuna Finalità d'uso associata.</span>
        }
      </fieldset>

      <fieldset style="border: 1px solid #e5e7eb; border-radius: 6px; padding: 1rem;">
        <legend style="padding: 0 0.5rem; font-weight: 600;">Utilizzatori</legend>
        @if (data.item.asset?.utilizerGrants?.length) {
          <ul style="margin: 0; padding-left: 1.5rem; list-style-type: disc;">
            @for (item of data.item.asset!.utilizerGrants!; track item.id) {
              <li>{{ item.utilizer!.name }}</li>
            }
          </ul>
        } @else {
          <span style="color: #666; font-style: italic;">Nessuna concessione trovata.</span>
        }
      </fieldset>
    }

    <mat-form-field>
      <mat-label>Specifiche</mat-label>
      <textarea matInput formControlName="specifications" rows="3"></textarea>
    </mat-form-field>

    <mat-form-field>
      <mat-label>Note</mat-label>
      <textarea matInput formControlName="notes" rows="3"></textarea>
    </mat-form-field>

    <mat-form-field>
      <mat-label>Note Aggiuntive</mat-label>
      <textarea matInput formControlName="additional_notes" rows="3"></textarea>
    </mat-form-field>

  </form>
</mat-dialog-content>

<mat-dialog-actions align="end">
  <button mat-stroked-button (click)="cancel()">Annulla</button>
  <button mat-flat-button (click)="save()" [disabled]="!form.valid" [appHasRole]="['Admin','Operatore']">
    {{ isNew ? 'Crea Utenza' : 'Salva Utenza' }}
  </button>
</mat-dialog-actions>
```

- [ ] **Step 3: Verificare la compilazione**

```bash
docker exec utenzepa-frontend-1 npx tsc --noEmit -p tsconfig.app.json
```

Expected: nessun nuovo errore sotto `src/app/pages/utilities/utility-edit-dialog.component.ts`
o `.html`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/pages/utilities/utility-edit-dialog.component.ts frontend/src/app/pages/utilities/utility-edit-dialog.component.html
git commit -m "refactor(frontend): implementa dialog di modifica utilities con campi condizionali (Gruppo E, Task 2)"
```

---

### Task 3: `UtilityFilterDialogComponent` — dialog filtri con 7 sezioni

**Files:**
- Create: `frontend/src/app/pages/utilities/utility-filter-dialog.component.ts`
- Create: `frontend/src/app/pages/utilities/utility-filter-dialog.component.html`

**Interfaces:**
- Consumes: `FilterDialogData<UtilityFilterValues>`, `ExpireState.options()`, `Phase.options()`,
  `TOption`, servizi `AssetService`/`UtilityAggregatorsService`/`SuppliersService`/
  `BudgetChaptersService`/`CostsBorneByService`/`MaintenanceManagersService`/`UtilizerService`/
  `UtilityTypesService`.
- Produces: `UtilityFilterDialogComponent`, `UtilityFilterValues` (interfaccia consumata da
  `SearchUtilitiesComponent.filterDialogComponent()` nel Task 4).

- [ ] **Step 1: Creare `utility-filter-dialog.component.ts`**

`frontend/src/app/pages/utilities/utility-filter-dialog.component.ts`:

```typescript
import {Component, inject, OnInit} from '@angular/core';
import {FormBuilder, FormControl, ReactiveFormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatAutocompleteModule} from '@angular/material/autocomplete';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatNativeDateModule} from '@angular/material/core';
import {MatExpansionModule} from '@angular/material/expansion';
import {MatButtonModule} from '@angular/material/button';
import {FilterDialogData} from '../../core/components/abstract-search.component';
import {Phase} from './enum/phase.enum';
import {ExpireState} from './enum/expire-state.enum';
import {TOption} from '../../core/types/option.interface';
import {AssetService} from '../assets/asset.service';
import {UtilityAggregatorsService} from '../utility-aggregator/utility-aggregator.service';
import {SuppliersService} from '../suppliers/suppliers.service';
import {BudgetChaptersService} from '../budget-chapters/budget-chapters.service';
import {CostsBorneByService} from '../costs-borne-by/costs-borne-by.service';
import {MaintenanceManagersService} from '../maintenance-managers/maintenance-managers.service';
import {UtilizerService} from '../utilizer/utilizer.service';
import {UtilityTypesService} from '../utility-types/utility-types.service';

export interface UtilityFilterValues {
  utility_id: string | null;
  meter_number: string | null;
  supply_active: boolean | null;
  utility_type_id_fk: number | null;
  asset_id_fk: number | null;
  supplier_id_fk: number | null;
  meter_removed: boolean | null;
  utilityState: ExpireState | null;
  costs_borne_by_id_fk: number | null;
  utility_code: string | null;
  aggregator_id_fk: number | null;
  supplier_address: string | null;
  meter_usage_type: string | null;
  consip_order: string | null;
  safeguard: boolean | null;
  wbs_gas_element: string | null;
  disconnection_ability: string | null;
  maintenance_management_id_fk: number | null;
  budget_chapter_code_fk: number | null;
  power_kw_electric: string | null;
  voltage_kw_electric: string | null;
  estimated_annual_consumption: string | null;
  reported_consumption_year: string | null;
  security_deposit: number | null;
  phase_type_electric: Phase | null;
  meter_verified: boolean | null;
  specifications: string | null;
  notes: string | null;
  additional_notes: string | null;
  latitude: string | null;
  longitude: string | null;
  user_id_fk: number | null;
  cig_contract: string | null;
  order_number: string | null;
  supply_start_date_range: (string | null)[] | null;
  supply_expiry_date_range: (string | null)[] | null;
  management_expiry_date_range: (string | null)[] | null;
  takeover_termination_date_range: (string | null)[] | null;
  water_concession_range: (string | null)[] | null;
}

@Component({
  selector: 'app-utility-filter-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatAutocompleteModule, MatDatepickerModule, MatNativeDateModule, MatExpansionModule,
    MatButtonModule
  ],
  templateUrl: './utility-filter-dialog.component.html'
})
export class UtilityFilterDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<UtilityFilterDialogComponent, UtilityFilterValues | 'clear'>);
  private assetsService = inject(AssetService);
  private utilityAggregatorService = inject(UtilityAggregatorsService);
  private suppliersService = inject(SuppliersService);
  private budgetChapterService = inject(BudgetChaptersService);
  private costsBorneByService = inject(CostsBorneByService);
  private maintenanceManagerService = inject(MaintenanceManagersService);
  private utilizerService = inject(UtilizerService);
  private utilityTypeService = inject(UtilityTypesService);
  protected data = inject<FilterDialogData<UtilityFilterValues>>(MAT_DIALOG_DATA);

  statusOptions: TOption[] = ExpireState.options();
  phaseTypeOptions: TOption[] = Phase.options();
  booleanOptions: TOption[] = [{label: 'Sì', value: true}, {label: 'No', value: false}];
  safeguardOptions: TOption[] = [{label: 'Sì', value: true}, {label: 'No', value: false}];

  utilityTypeOptions: TOption[] = [];
  costsBorneByOptions: TOption[] = [];
  managementOptions: TOption[] = [];

  assetOptions: TOption[] = [];
  filteredAssetOptions: TOption[] = [];
  assetFilterCtrl = new FormControl<string>('');

  aggregatorOptions: TOption[] = [];
  filteredAggregatorOptions: TOption[] = [];
  aggregatorFilterCtrl = new FormControl<string>('');

  supplierOptions: TOption[] = [];
  filteredSupplierOptions: TOption[] = [];
  supplierFilterCtrl = new FormControl<string>('');

  budgetChapterOptions: TOption[] = [];
  filteredBudgetChapterOptions: TOption[] = [];
  budgetChapterFilterCtrl = new FormControl<string>('');

  utilizerOptions: TOption[] = [];
  filteredUtilizerOptions: TOption[] = [];
  utilizerFilterCtrl = new FormControl<string>('');

  form = this.fb.group({
    utility_id: [this.data.values.utility_id ?? ''],
    meter_number: [this.data.values.meter_number ?? ''],
    utility_code: [this.data.values.utility_code ?? ''],
    utility_type_id_fk: [this.data.values.utility_type_id_fk ?? null],
    asset_id_fk: [this.data.values.asset_id_fk ?? null],
    aggregator_id_fk: [this.data.values.aggregator_id_fk ?? null],
    supplier_address: [this.data.values.supplier_address ?? ''],
    latitude: [this.data.values.latitude ?? ''],
    longitude: [this.data.values.longitude ?? ''],
    power_kw_electric: [this.data.values.power_kw_electric ?? ''],
    voltage_kw_electric: [this.data.values.voltage_kw_electric ?? ''],
    phase_type_electric: [this.data.values.phase_type_electric ?? null],
    disconnection_ability: [this.data.values.disconnection_ability ?? ''],
    wbs_gas_element: [this.data.values.wbs_gas_element ?? ''],
    meter_usage_type: [this.data.values.meter_usage_type ?? ''],
    supply_active: [this.data.values.supply_active ?? null],
    meter_removed: [this.data.values.meter_removed ?? null],
    meter_verified: [this.data.values.meter_verified ?? null],
    utilityState: [this.data.values.utilityState ?? null],
    safeguard: [this.data.values.safeguard ?? null],
    consip_order: [this.data.values.consip_order ?? ''],
    supplier_id_fk: [this.data.values.supplier_id_fk ?? null],
    maintenance_management_id_fk: [this.data.values.maintenance_management_id_fk ?? null],
    costs_borne_by_id_fk: [this.data.values.costs_borne_by_id_fk ?? null],
    cig_contract: [this.data.values.cig_contract ?? ''],
    order_number: [this.data.values.order_number ?? ''],
    budget_chapter_code_fk: [this.data.values.budget_chapter_code_fk ?? null],
    estimated_annual_consumption: [this.data.values.estimated_annual_consumption ?? ''],
    reported_consumption_year: [this.data.values.reported_consumption_year ?? ''],
    security_deposit: [this.data.values.security_deposit ?? null],
    user_id_fk: [this.data.values.user_id_fk ?? null],
    specifications: [this.data.values.specifications ?? ''],
    notes: [this.data.values.notes ?? ''],
    additional_notes: [this.data.values.additional_notes ?? ''],
  });

  // I 5 campi "_range" NON sono FormControl del form sopra: nell'originale PrimeNG erano array
  // [from, to] pilotati da un unico p-datePicker[selectionMode="range"]. Angular Material non ha
  // un equivalente diretto legato a un FormControl array-valued: si usano due
  // <input [matDatepicker]> singoli per campo, con modello locale qui sotto, assemblati in un
  // array solo in apply() — la chiave nell'oggetto restituito ("supply_start_date_range" ecc.)
  // deve comunque combaciare con quella già usata da AbstractSearchComponent.parseSearchForm()
  // e dal FormGroup di SearchUtilitiesComponent.qSearch (Task 4), non modificabile.
  supplyStartFrom: Date | null = this.toDate(this.data.values.supply_start_date_range?.[0]);
  supplyStartTo: Date | null = this.toDate(this.data.values.supply_start_date_range?.[1]);
  supplyExpiryFrom: Date | null = this.toDate(this.data.values.supply_expiry_date_range?.[0]);
  supplyExpiryTo: Date | null = this.toDate(this.data.values.supply_expiry_date_range?.[1]);
  managementExpiryFrom: Date | null = this.toDate(this.data.values.management_expiry_date_range?.[0]);
  managementExpiryTo: Date | null = this.toDate(this.data.values.management_expiry_date_range?.[1]);
  takeoverFrom: Date | null = this.toDate(this.data.values.takeover_termination_date_range?.[0]);
  takeoverTo: Date | null = this.toDate(this.data.values.takeover_termination_date_range?.[1]);
  waterConcessionFrom: Date | null = this.toDate(this.data.values.water_concession_range?.[0]);
  waterConcessionTo: Date | null = this.toDate(this.data.values.water_concession_range?.[1]);

  private toDate(v: unknown): Date | null {
    return v ? new Date(v as string) : null;
  }

  private buildRange(from: Date | null, to: Date | null): (Date | null)[] | null {
    return (from || to) ? [from, to] : null;
  }

  ngOnInit(): void {
    this.utilityTypeService.search({deleted: false}).subscribe({
      next: data => this.utilityTypeOptions = data
        .map((t: any) => ({label: t.name, value: t.id}))
        .sort((a: TOption, b: TOption) => a.label.localeCompare(b.label))
    });

    this.costsBorneByService.search().subscribe({
      next: data => this.costsBorneByOptions = data
        .map((c: any) => ({label: c.name, value: c.id}))
        .sort((a: TOption, b: TOption) => a.label.localeCompare(b.label))
    });

    this.maintenanceManagerService.search().subscribe({
      next: data => this.managementOptions = data
        .map((m: any) => ({label: m.code, value: m.id}))
        .sort((a: TOption, b: TOption) => a.label.localeCompare(b.label))
    });

    this.assetsService.search({deleted: false}).subscribe({
      next: data => {
        this.assetOptions = data
          .map((a: any) => ({label: a.asset_name, value: a.id}))
          .sort((a: TOption, b: TOption) => a.label.localeCompare(b.label));
        this.filteredAssetOptions = this.assetOptions;
        this.assetFilterCtrl.setValue(this.displayOption(this.assetOptions, this.form.value.asset_id_fk ?? null), {emitEvent: false});
      }
    });
    this.assetFilterCtrl.valueChanges.subscribe(term => {
      this.filteredAssetOptions = this.filterOptions(this.assetOptions, term);
    });

    this.utilityAggregatorService.search({deleted: false}).subscribe({
      next: data => {
        this.aggregatorOptions = data
          .map((a: any) => ({label: a.description ?? '', value: a.id}))
          .sort((a: TOption, b: TOption) => a.label.localeCompare(b.label));
        this.filteredAggregatorOptions = this.aggregatorOptions;
        this.aggregatorFilterCtrl.setValue(this.displayOption(this.aggregatorOptions, this.form.value.aggregator_id_fk ?? null), {emitEvent: false});
      }
    });
    this.aggregatorFilterCtrl.valueChanges.subscribe(term => {
      this.filteredAggregatorOptions = this.filterOptions(this.aggregatorOptions, term);
    });

    this.suppliersService.search({deleted: false}).subscribe({
      next: data => {
        this.supplierOptions = data
          .map((s: any) => ({label: s.company_name, value: s.id}))
          .sort((a: TOption, b: TOption) => a.label.localeCompare(b.label));
        this.filteredSupplierOptions = this.supplierOptions;
        this.supplierFilterCtrl.setValue(this.displayOption(this.supplierOptions, this.form.value.supplier_id_fk ?? null), {emitEvent: false});
      }
    });
    this.supplierFilterCtrl.valueChanges.subscribe(term => {
      this.filteredSupplierOptions = this.filterOptions(this.supplierOptions, term);
    });

    this.budgetChapterService.search({deleted: false}).subscribe({
      next: data => {
        this.budgetChapterOptions = data
          .map((b: any) => ({label: `${b.chapter_code} - ${b.description}`, value: b.id}))
          .sort((a: TOption, b: TOption) => a.label.localeCompare(b.label));
        this.filteredBudgetChapterOptions = this.budgetChapterOptions;
        this.budgetChapterFilterCtrl.setValue(this.displayOption(this.budgetChapterOptions, this.form.value.budget_chapter_code_fk ?? null), {emitEvent: false});
      }
    });
    this.budgetChapterFilterCtrl.valueChanges.subscribe(term => {
      this.filteredBudgetChapterOptions = this.filterOptions(this.budgetChapterOptions, term);
    });

    this.utilizerService.search({deleted: false}).subscribe({
      next: data => {
        this.utilizerOptions = data
          .map((u: any) => ({label: u.name, value: u.id}))
          .sort((a: TOption, b: TOption) => a.label.localeCompare(b.label));
        this.filteredUtilizerOptions = this.utilizerOptions;
        this.utilizerFilterCtrl.setValue(this.displayOption(this.utilizerOptions, this.form.value.user_id_fk ?? null), {emitEvent: false});
      }
    });
    this.utilizerFilterCtrl.valueChanges.subscribe(term => {
      this.filteredUtilizerOptions = this.filterOptions(this.utilizerOptions, term);
    });
  }

  private filterOptions(options: TOption[], term: string | null): TOption[] {
    const t = (typeof term === 'string' ? term : '').toLowerCase();
    return options.filter(o => o.label.toLowerCase().includes(t));
  }

  private displayOption = (options: TOption[], value: unknown): string =>
    options.find(o => o.value === value)?.label ?? '';

  displayAsset = (value: number | null): string => this.displayOption(this.assetOptions, value);
  onAssetSelected(value: number): void { this.form.patchValue({asset_id_fk: value}); }

  displayAggregator = (value: number | null): string => this.displayOption(this.aggregatorOptions, value);
  onAggregatorSelected(value: number): void { this.form.patchValue({aggregator_id_fk: value}); }

  displaySupplier = (value: number | null): string => this.displayOption(this.supplierOptions, value);
  onSupplierSelected(value: number): void { this.form.patchValue({supplier_id_fk: value}); }

  displayBudgetChapter = (value: number | null): string => this.displayOption(this.budgetChapterOptions, value);
  onBudgetChapterSelected(value: number): void { this.form.patchValue({budget_chapter_code_fk: value}); }

  displayUtilizer = (value: number | null): string => this.displayOption(this.utilizerOptions, value);
  onUtilizerSelected(value: number): void { this.form.patchValue({user_id_fk: value}); }

  apply(): void {
    const raw = this.form.getRawValue();
    this.dialogRef.close({
      ...raw,
      supply_start_date_range: this.buildRange(this.supplyStartFrom, this.supplyStartTo),
      supply_expiry_date_range: this.buildRange(this.supplyExpiryFrom, this.supplyExpiryTo),
      management_expiry_date_range: this.buildRange(this.managementExpiryFrom, this.managementExpiryTo),
      takeover_termination_date_range: this.buildRange(this.takeoverFrom, this.takeoverTo),
      water_concession_range: this.buildRange(this.waterConcessionFrom, this.waterConcessionTo),
    } as unknown as UtilityFilterValues);
  }

  clear(): void {
    this.dialogRef.close('clear');
  }
}
```

- [ ] **Step 2: Creare `utility-filter-dialog.component.html` con le 7 sezioni (`mat-expansion-panel`, ultima collassata)**

`frontend/src/app/pages/utilities/utility-filter-dialog.component.html`:

```html
<h2 mat-dialog-title>Filtri di ricerca Utenze</h2>

<mat-dialog-content>
  <form id="filter-form" [formGroup]="form" (ngSubmit)="apply()" style="display: flex; flex-direction: column; gap: 0.5rem;">

    <mat-accordion multi>

      <mat-expansion-panel [expanded]="true">
        <mat-expansion-panel-header><mat-panel-title>Identificazione</mat-panel-title></mat-expansion-panel-header>
        <div style="display: flex; flex-wrap: wrap; gap: 1rem;">
          <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
            <mat-label>Codice (POD/PDR/Matricola)</mat-label>
            <input matInput formControlName="utility_id" placeholder="Es. IT001P...">
          </mat-form-field>
          <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
            <mat-label>Numero Contatore</mat-label>
            <input matInput formControlName="meter_number">
          </mat-form-field>
          <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
            <mat-label>Codice Utenza/Cliente</mat-label>
            <input matInput formControlName="utility_code">
          </mat-form-field>
          <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
            <mat-label>Tipo Utenza</mat-label>
            <mat-select formControlName="utility_type_id_fk">
              <mat-option [value]="null">Tutti</mat-option>
              @for (opt of utilityTypeOptions; track opt.value) {
                <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
            <mat-label>Fabbricato Associato</mat-label>
            <input matInput [formControl]="assetFilterCtrl" [matAutocomplete]="autoAsset" placeholder="Cerca...">
            <mat-autocomplete #autoAsset="matAutocomplete" [displayWith]="displayAsset">
              @for (opt of filteredAssetOptions; track opt.value) {
                <mat-option [value]="opt.value" (onSelectionChange)="onAssetSelected(opt.value)">{{ opt.label }}</mat-option>
              }
            </mat-autocomplete>
          </mat-form-field>
          <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
            <mat-label>Aggregato</mat-label>
            <input matInput [formControl]="aggregatorFilterCtrl" [matAutocomplete]="autoAggregator" placeholder="Cerca...">
            <mat-autocomplete #autoAggregator="matAutocomplete" [displayWith]="displayAggregator">
              @for (opt of filteredAggregatorOptions; track opt.value) {
                <mat-option [value]="opt.value" (onSelectionChange)="onAggregatorSelected(opt.value)">{{ opt.label }}</mat-option>
              }
            </mat-autocomplete>
          </mat-form-field>
          <mat-form-field style="flex: 2 1 calc(50% - 0.75rem);">
            <mat-label>Indirizzo Fornitura</mat-label>
            <input matInput formControlName="supplier_address">
          </mat-form-field>
          <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
            <mat-label>Latitudine</mat-label>
            <input matInput formControlName="latitude" placeholder="Es. 45.123">
          </mat-form-field>
          <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
            <mat-label>Longitudine</mat-label>
            <input matInput formControlName="longitude" placeholder="Es. 9.123">
          </mat-form-field>
        </div>
      </mat-expansion-panel>

      <mat-expansion-panel [expanded]="true">
        <mat-expansion-panel-header><mat-panel-title>Caratteristiche Tecniche</mat-panel-title></mat-expansion-panel-header>
        <div style="display: flex; flex-wrap: wrap; gap: 1rem;">
          <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
            <mat-label>Potenza (kW)</mat-label>
            <input matInput formControlName="power_kw_electric">
          </mat-form-field>
          <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
            <mat-label>Tensione (V / kV)</mat-label>
            <input matInput formControlName="voltage_kw_electric">
          </mat-form-field>
          <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
            <mat-label>Tipo Fase</mat-label>
            <mat-select formControlName="phase_type_electric">
              <mat-option [value]="null">Tutti</mat-option>
              @for (opt of phaseTypeOptions; track opt.value) {
                <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
            <mat-label>Disalimentabilità</mat-label>
            <input matInput formControlName="disconnection_ability">
          </mat-form-field>
          <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
            <mat-label>WBS Gas</mat-label>
            <input matInput formControlName="wbs_gas_element">
          </mat-form-field>
          <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
            <mat-label>Tipo uso contatore</mat-label>
            <input matInput formControlName="meter_usage_type">
          </mat-form-field>
        </div>
      </mat-expansion-panel>

      <mat-expansion-panel [expanded]="true">
        <mat-expansion-panel-header><mat-panel-title>Stato Utenza</mat-panel-title></mat-expansion-panel-header>
        <div style="display: flex; flex-wrap: wrap; gap: 1rem;">
          <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
            <mat-label>Fornitura Attiva</mat-label>
            <mat-select formControlName="supply_active">
              <mat-option [value]="null">Tutti</mat-option>
              @for (opt of booleanOptions; track opt.value) {
                <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
            <mat-label>Contatore Rimosso</mat-label>
            <mat-select formControlName="meter_removed">
              <mat-option [value]="null">Tutti</mat-option>
              @for (opt of booleanOptions; track opt.value) {
                <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
            <mat-label>Contatore Verificato</mat-label>
            <mat-select formControlName="meter_verified">
              <mat-option [value]="null">Tutti</mat-option>
              @for (opt of booleanOptions; track opt.value) {
                <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
            <mat-label>Stato Utenza</mat-label>
            <mat-select formControlName="utilityState">
              <mat-option [value]="null">Tutti</mat-option>
              @for (opt of statusOptions; track opt.value) {
                <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <div style="display: flex; flex: 1 1 calc(50% - 0.75rem); gap: 0.5rem;">
            <mat-form-field style="flex: 1;">
              <mat-label>Voltura/Cessazione da</mat-label>
              <input matInput [matDatepicker]="takeoverFromPicker" [(ngModel)]="takeoverFrom" [ngModelOptions]="{standalone: true}">
              <mat-datepicker-toggle matSuffix [for]="takeoverFromPicker"></mat-datepicker-toggle>
              <mat-datepicker #takeoverFromPicker></mat-datepicker>
            </mat-form-field>
            <mat-form-field style="flex: 1;">
              <mat-label>a</mat-label>
              <input matInput [matDatepicker]="takeoverToPicker" [(ngModel)]="takeoverTo" [ngModelOptions]="{standalone: true}">
              <mat-datepicker-toggle matSuffix [for]="takeoverToPicker"></mat-datepicker-toggle>
              <mat-datepicker #takeoverToPicker></mat-datepicker>
            </mat-form-field>
          </div>
        </div>
      </mat-expansion-panel>

      <mat-expansion-panel [expanded]="true">
        <mat-expansion-panel-header><mat-panel-title>Dati Contrattuali</mat-panel-title></mat-expansion-panel-header>
        <div style="display: flex; flex-wrap: wrap; gap: 1rem;">
          <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
            <mat-label>Convenzione CONSIP - Salvaguardia</mat-label>
            <mat-select formControlName="safeguard">
              <mat-option [value]="null">Tutti</mat-option>
              @for (opt of safeguardOptions; track opt.value) {
                <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
            <mat-label>Ordine CONSIP</mat-label>
            <input matInput formControlName="consip_order">
          </mat-form-field>
          <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
            <mat-label>Fornitore</mat-label>
            <input matInput [formControl]="supplierFilterCtrl" [matAutocomplete]="autoSupplier" placeholder="Cerca...">
            <mat-autocomplete #autoSupplier="matAutocomplete" [displayWith]="displaySupplier">
              @for (opt of filteredSupplierOptions; track opt.value) {
                <mat-option [value]="opt.value" (onSelectionChange)="onSupplierSelected(opt.value)">{{ opt.label }}</mat-option>
              }
            </mat-autocomplete>
          </mat-form-field>
          <div style="display: flex; flex: 1 1 calc(50% - 0.75rem); gap: 0.5rem;">
            <mat-form-field style="flex: 1;">
              <mat-label>Decorrenza da</mat-label>
              <input matInput [matDatepicker]="supplyStartFromPicker" [(ngModel)]="supplyStartFrom" [ngModelOptions]="{standalone: true}">
              <mat-datepicker-toggle matSuffix [for]="supplyStartFromPicker"></mat-datepicker-toggle>
              <mat-datepicker #supplyStartFromPicker></mat-datepicker>
            </mat-form-field>
            <mat-form-field style="flex: 1;">
              <mat-label>a</mat-label>
              <input matInput [matDatepicker]="supplyStartToPicker" [(ngModel)]="supplyStartTo" [ngModelOptions]="{standalone: true}">
              <mat-datepicker-toggle matSuffix [for]="supplyStartToPicker"></mat-datepicker-toggle>
              <mat-datepicker #supplyStartToPicker></mat-datepicker>
            </mat-form-field>
          </div>
          <div style="display: flex; flex: 1 1 calc(50% - 0.75rem); gap: 0.5rem;">
            <mat-form-field style="flex: 1;">
              <mat-label>Scadenza Affid. da</mat-label>
              <input matInput [matDatepicker]="supplyExpiryFromPicker" [(ngModel)]="supplyExpiryFrom" [ngModelOptions]="{standalone: true}">
              <mat-datepicker-toggle matSuffix [for]="supplyExpiryFromPicker"></mat-datepicker-toggle>
              <mat-datepicker #supplyExpiryFromPicker></mat-datepicker>
            </mat-form-field>
            <mat-form-field style="flex: 1;">
              <mat-label>a</mat-label>
              <input matInput [matDatepicker]="supplyExpiryToPicker" [(ngModel)]="supplyExpiryTo" [ngModelOptions]="{standalone: true}">
              <mat-datepicker-toggle matSuffix [for]="supplyExpiryToPicker"></mat-datepicker-toggle>
              <mat-datepicker #supplyExpiryToPicker></mat-datepicker>
            </mat-form-field>
          </div>
          <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
            <mat-label>Gestione Manutenzione</mat-label>
            <mat-select formControlName="maintenance_management_id_fk">
              <mat-option [value]="null">Tutti</mat-option>
              @for (opt of managementOptions; track opt.value) {
                <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <div style="display: flex; flex: 1 1 calc(50% - 0.75rem); gap: 0.5rem;">
            <mat-form-field style="flex: 1;">
              <mat-label>Scadenza Gest. da</mat-label>
              <input matInput [matDatepicker]="managementExpiryFromPicker" [(ngModel)]="managementExpiryFrom" [ngModelOptions]="{standalone: true}">
              <mat-datepicker-toggle matSuffix [for]="managementExpiryFromPicker"></mat-datepicker-toggle>
              <mat-datepicker #managementExpiryFromPicker></mat-datepicker>
            </mat-form-field>
            <mat-form-field style="flex: 1;">
              <mat-label>a</mat-label>
              <input matInput [matDatepicker]="managementExpiryToPicker" [(ngModel)]="managementExpiryTo" [ngModelOptions]="{standalone: true}">
              <mat-datepicker-toggle matSuffix [for]="managementExpiryToPicker"></mat-datepicker-toggle>
              <mat-datepicker #managementExpiryToPicker></mat-datepicker>
            </mat-form-field>
          </div>
          <div style="display: flex; flex: 1 1 calc(50% - 0.75rem); gap: 0.5rem;">
            <mat-form-field style="flex: 1;">
              <mat-label>Concessione Acqua da</mat-label>
              <input matInput [matDatepicker]="waterConcessionFromPicker" [(ngModel)]="waterConcessionFrom" [ngModelOptions]="{standalone: true}">
              <mat-datepicker-toggle matSuffix [for]="waterConcessionFromPicker"></mat-datepicker-toggle>
              <mat-datepicker #waterConcessionFromPicker></mat-datepicker>
            </mat-form-field>
            <mat-form-field style="flex: 1;">
              <mat-label>a</mat-label>
              <input matInput [matDatepicker]="waterConcessionToPicker" [(ngModel)]="waterConcessionTo" [ngModelOptions]="{standalone: true}">
              <mat-datepicker-toggle matSuffix [for]="waterConcessionToPicker"></mat-datepicker-toggle>
              <mat-datepicker #waterConcessionToPicker></mat-datepicker>
            </mat-form-field>
          </div>
          <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
            <mat-label>Costi a Carico di</mat-label>
            <mat-select formControlName="costs_borne_by_id_fk">
              <mat-option [value]="null">Tutti</mat-option>
              @for (opt of costsBorneByOptions; track opt.value) {
                <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
            <mat-label>CIG Contratto</mat-label>
            <input matInput formControlName="cig_contract">
          </mat-form-field>
          <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
            <mat-label>Numero Ordine</mat-label>
            <input matInput formControlName="order_number">
          </mat-form-field>
        </div>
      </mat-expansion-panel>

      <mat-expansion-panel [expanded]="true">
        <mat-expansion-panel-header><mat-panel-title>Consumi</mat-panel-title></mat-expansion-panel-header>
        <div style="display: flex; flex-wrap: wrap; gap: 1rem;">
          <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
            <mat-label>Capitolo di Spesa</mat-label>
            <input matInput [formControl]="budgetChapterFilterCtrl" [matAutocomplete]="autoBudgetChapter" placeholder="Cerca...">
            <mat-autocomplete #autoBudgetChapter="matAutocomplete" [displayWith]="displayBudgetChapter">
              @for (opt of filteredBudgetChapterOptions; track opt.value) {
                <mat-option [value]="opt.value" (onSelectionChange)="onBudgetChapterSelected(opt.value)">{{ opt.label }}</mat-option>
              }
            </mat-autocomplete>
          </mat-form-field>
          <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
            <mat-label>Consumo Annuo Presunto</mat-label>
            <input matInput formControlName="estimated_annual_consumption">
          </mat-form-field>
          <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
            <mat-label>Consumo Annuo Comunicato Consip</mat-label>
            <input matInput formControlName="reported_consumption_year">
          </mat-form-field>
          <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
            <mat-label>Deposito Cauzionale</mat-label>
            <input matInput type="number" step="0.01" formControlName="security_deposit">
          </mat-form-field>
        </div>
      </mat-expansion-panel>

      <mat-expansion-panel [expanded]="true">
        <mat-expansion-panel-header><mat-panel-title>Utilizzatori</mat-panel-title></mat-expansion-panel-header>
        <div style="display: flex; flex-wrap: wrap; gap: 1rem;">
          <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
            <mat-label>Utilizzatore</mat-label>
            <input matInput [formControl]="utilizerFilterCtrl" [matAutocomplete]="autoUtilizer" placeholder="Cerca...">
            <mat-autocomplete #autoUtilizer="matAutocomplete" [displayWith]="displayUtilizer">
              @for (opt of filteredUtilizerOptions; track opt.value) {
                <mat-option [value]="opt.value" (onSelectionChange)="onUtilizerSelected(opt.value)">{{ opt.label }}</mat-option>
              }
            </mat-autocomplete>
          </mat-form-field>
        </div>
      </mat-expansion-panel>

      <mat-expansion-panel [expanded]="false">
        <mat-expansion-panel-header><mat-panel-title>Ricerca Testuale Avanzata</mat-panel-title></mat-expansion-panel-header>
        <div style="display: flex; flex-wrap: wrap; gap: 1rem;">
          <mat-form-field style="flex: 1 1 calc(33% - 0.75rem);">
            <mat-label>Specifiche</mat-label>
            <input matInput formControlName="specifications">
          </mat-form-field>
          <mat-form-field style="flex: 1 1 calc(33% - 0.75rem);">
            <mat-label>Note</mat-label>
            <input matInput formControlName="notes">
          </mat-form-field>
          <mat-form-field style="flex: 1 1 calc(33% - 0.75rem);">
            <mat-label>Note Aggiuntive</mat-label>
            <input matInput formControlName="additional_notes">
          </mat-form-field>
        </div>
      </mat-expansion-panel>

    </mat-accordion>
  </form>
</mat-dialog-content>

<mat-dialog-actions align="end">
  <button mat-stroked-button (click)="clear()">Pulisci Filtri</button>
  <button mat-flat-button type="submit" form="filter-form">Applica Filtri</button>
</mat-dialog-actions>
```

Nota: le sezioni 1-6 sono `[expanded]="true"` di default (stesso comportamento del vecchio
`p-fieldset [toggleable]="true"` senza `[collapsed]="true"`, cioè apparivano già aperte), la
settima ("Ricerca Testuale Avanzata") è `[expanded]="false"` (equivalente a
`[collapsed]="true"` nell'originale, riga 271 del vecchio template) — comportamento riprodotto
esattamente.

- [ ] **Step 3: Verificare la compilazione**

```bash
docker exec utenzepa-frontend-1 npx tsc --noEmit -p tsconfig.app.json
```

Expected: nessun nuovo errore sotto `src/app/pages/utilities/utility-filter-dialog.component.ts`
o `.html`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/pages/utilities/utility-filter-dialog.component.ts frontend/src/app/pages/utilities/utility-filter-dialog.component.html
git commit -m "refactor(frontend): implementa dialog filtri utilities con 7 sezioni (Gruppo E, Task 3)"
```

---

### Task 4: `SearchUtilitiesComponent` + `UtilitiesComponent` — wiring finale della pagina

**Files:**
- Modify: `frontend/src/app/pages/utilities/search-utilities.component.ts`
- Modify: `frontend/src/app/pages/utilities/search-utilities.component.html`
- Delete: `frontend/src/app/pages/utilities/search-utilities.component.css`
- Modify: `frontend/src/app/pages/utilities/utilities.component.ts`
- Modify: `frontend/src/app/pages/utilities/utilities.component.html`

**Interfaces:**
- Consumes: `AbstractSearchComponent` (`qSearch`, `filterDialogComponent()`,
  `filterDialogWidth()`, `openFilterDialog()`, `onQuickSearch()`), `UtilityFilterDialogComponent`
  (Task 3), `AbstractComponent<Utility>` (`list`, `allItems`, `loading`, `resetPagingCount`,
  `onSearch()`, `onSave()`, `onDelete()`, `onCreate()`, `onRestore()`, `messageService`),
  `UtilityService.search()`.
- Produces: superficie pubblica finale della pagina `utilities` verso `app.routes.ts` (nessuna
  modifica al routing in questo task).

- [ ] **Step 1: Riscrivere `search-utilities.component.ts`**

`frontend/src/app/pages/utilities/search-utilities.component.ts`:

```typescript
import {Component, Type} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {AbstractSearchComponent} from '../../core/components/abstract-search.component';
import {UtilityFilterDialogComponent} from './utility-filter-dialog.component';

@Component({
  selector: 'app-search-utilities',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule],
  templateUrl: './search-utilities.component.html'
})
export class SearchUtilitiesComponent extends AbstractSearchComponent {

  constructor(private fb: FormBuilder) {
    super();
    // 39 campi filtro reali + qsearch = 40 controlli totali. Rimossi rispetto all'originale i 6
    // FormControl dead mai renderizzati nel template PrimeNG (supply_expiry_date, deleted,
    // water_concession, supply_start_date, management_expiry_date, takeover_termination_date) —
    // sostituiti dalle rispettive varianti "_range", le uniche effettivamente esposte nel dialog
    // filtri (vedi Global Constraints, punto 3).
    this.qSearch = this.fb.group({
      qsearch: [''],
      utility_id: [''],
      meter_number: [''],
      supply_active: [null],
      utility_type_id_fk: [null],
      asset_id_fk: [null],
      supplier_id_fk: [null],
      meter_removed: [null],
      utilityState: [null],
      costs_borne_by_id_fk: [null],
      utility_code: [''],
      aggregator_id_fk: [null],
      supplier_address: [''],
      meter_usage_type: [''],
      consip_order: [''],
      safeguard: [null],
      wbs_gas_element: [''],
      disconnection_ability: [''],
      maintenance_management_id_fk: [null],
      budget_chapter_code_fk: [null],
      power_kw_electric: [''],
      voltage_kw_electric: [''],
      estimated_annual_consumption: [''],
      reported_consumption_year: [''],
      security_deposit: [''],
      phase_type_electric: [null],
      meter_verified: [null],
      specifications: [''],
      notes: [''],
      additional_notes: [''],
      latitude: [''],
      longitude: [''],
      user_id_fk: [null],
      supply_start_date_range: [null],
      supply_expiry_date_range: [null],
      management_expiry_date_range: [null],
      takeover_termination_date_range: [null],
      water_concession_range: [null],
      cig_contract: [''],
      order_number: ['']
    });
  }

  override filterDialogComponent(): Type<unknown> {
    return UtilityFilterDialogComponent;
  }

  override filterDialogWidth(): string {
    return '1200px';
  }
}
```

- [ ] **Step 2: Riscrivere `search-utilities.component.html`**

`frontend/src/app/pages/utilities/search-utilities.component.html`:

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

- [ ] **Step 3: Eliminare `search-utilities.component.css`**

```bash
git rm frontend/src/app/pages/utilities/search-utilities.component.css
```

- [ ] **Step 4: Riscrivere `utilities.component.ts`**

`frontend/src/app/pages/utilities/utilities.component.ts`:

```typescript
import {Component, ViewChild} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {plainToInstance} from 'class-transformer';
import {UtilityService} from './utility.service';
import {DataTableUtilitiesComponent} from './data-table-utilities.component';
import {SearchUtilitiesComponent} from './search-utilities.component';
import {AbstractComponent} from '../../core/components/abstract.component';
import {Utility} from './entity/utility.entity';

@Component({
  selector: 'app-utilities',
  standalone: true,
  imports: [DataTableUtilitiesComponent, SearchUtilitiesComponent],
  templateUrl: './utilities.component.html'
})
export class UtilitiesComponent extends AbstractComponent<Utility> {

  @ViewChild('dataTable') dataTable!: DataTableUtilitiesComponent;

  private selectedId?: number | null;

  constructor(
    protected override service: UtilityService,
    private route: ActivatedRoute
  ) {
    super();
  }

  protected override getEntityIdentifier(entity: Utility): string {
    return `${entity.utility_id}`;
  }

  protected override entityLabel(): string {
    return 'Utenza';
  }

  private formatDateIt(date: Date | string): string {
    return new Date(date).toLocaleDateString('it-IT', {day: '2-digit', month: '2-digit', year: 'numeric'});
  }

  // Logica di deep-link preservata dall'originale: /utilities?selectedId=<id> apre il dialog di
  // modifica di quell'utenza al caricamento; /utilities?safeguard=true e
  // /utilities?supply_expiry_date_range=<from>&<to> precaricano la lista già filtrata (usati da
  // link esterni, es. dalla dashboard) — NON è dead code, va mantenuta integralmente.
  override ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      this.selectedId = params['selectedId'] ? Number(params['selectedId']) : null;

      if (this.selectedId) {
        this.loadAllUtilities();
      } else if (params['safeguard']) {
        this.loading = true;
        this.service.search({safeguard: true}).subscribe(result => {
          this.list = plainToInstance(Utility, result);
          this.allItems = [...result];
          this.loading = false;
          this.messageService.add({
            severity: 'info',
            summary: 'Filtro applicato',
            detail: 'Utenze filtrate per salvaguardia.'
          });
        });
      } else if (params['supply_expiry_date_range']) {
        const raw: string[] = params['supply_expiry_date_range'];
        const from = raw[0];
        const to = raw[1];
        this.loading = true;
        this.service.search({supply_expiry_date_range: [from, to]}).subscribe(result => {
          this.list = plainToInstance(Utility, result);
          this.allItems = [...result];
          this.loading = false;
          this.messageService.add({
            severity: 'info',
            summary: 'Filtro applicato',
            detail: `Utenze filtrate per scadenza tra ${this.formatDateIt(from)} e ${this.formatDateIt(to)}.`
          });
        });
      } else {
        this.loadAllUtilities();
      }
    });
  }

  private loadAllUtilities(): void {
    this.loading = true;
    this.service.search({}).subscribe(result => {
      this.list = plainToInstance(Utility, result);
      this.allItems = [...result];
      this.loading = false;

      if (this.selectedId) {
        const utility = result.find(u => u.id === this.selectedId);
        if (utility) setTimeout(() => this.dataTable?.openEditDialog(utility));
      }
    });
  }
}
```

- [ ] **Step 5: Riscrivere `utilities.component.html`**

`frontend/src/app/pages/utilities/utilities.component.html`:

```html
<div style="padding: 1rem;">
  <div>
    <h1>Gestione Utenze</h1>
    <p style="color: #6A7282;">Gestisci le anagrafiche delle utenze</p>
  </div>

  <div style="margin-top: 1rem;">
    <app-search-utilities (search)="onSearch($event)"></app-search-utilities>
  </div>

  <div style="margin-top: 1.5rem;">
    <app-data-table-utilities
      #dataTable
      [data]="list"
      [loading]="loading"
      (onSave)="onSave($event)"
      (onDelete)="onDelete($event)"
      (onCreate)="onCreate($event)"
      (onRestore)="onRestore($event)"
      [resetPagingTrigger]="resetPagingCount"
    ></app-data-table-utilities>
  </div>
</div>
```

- [ ] **Step 6: Verificare la compilazione completa del progetto frontend**

```bash
docker exec utenzepa-frontend-1 npm run build
```

Expected: la pagina `utilities` non genera più errori. Con `utilities` migrata, questa era
l'ultima pagina rimasta in PrimeNG (vedi piano Fase 1, "Note di chiusura", e Gruppo D che elencava
`utilities` tra le pagine ancora rosse) — la build completa del frontend deve risultare pulita
(nessuna pagina rossa residua). Se compaiono errori su altre pagine, verificare che non siano
regressioni introdotte da questo piano (diff limitato a `frontend/src/app/pages/utilities/`).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/pages/utilities/search-utilities.component.ts frontend/src/app/pages/utilities/search-utilities.component.html frontend/src/app/pages/utilities/utilities.component.ts frontend/src/app/pages/utilities/utilities.component.html
git commit -m "refactor(frontend): completa migrazione pagina utilities a Angular Material (Gruppo E, Task 4)"
```

---

### Task 5: QA manuale approfondita

**Files:**
- Temporarily modify (poi ripristinare): `frontend/src/app/app.routes.ts` — non necessario in
  questo gruppo se `utilities` era l'ultima pagina non migrata (la build del Task 4, Step 6 deve
  già risultare pulita per l'intero progetto): eseguire comunque uno `git status`/`git diff
  frontend/src/app/app.routes.ts` prima e dopo per conferma, senza serve stub temporanei.

- [ ] **Step 1: Avviare l'app in dev**

```bash
docker compose up -d
```

Frontend su http://localhost:4300 (porta effettiva da verificare in `.env`, vedi CLAUDE.md —
`DOCKER_API_PORT`/porte locali possono differire dai default).

- [ ] **Step 2: Verificare lo stato di build dell'intero progetto**

```bash
docker exec utenzepa-frontend-1 npm run build
```

Expected: build pulita, **nessuna pagina rossa residua** in tutto il progetto (`utilities` era
l'ultima pagina PrimeNG). Se compaiono ancora errori su pagine diverse da `utilities`, NON
proseguire: indica una regressione introdotta da questo piano o un gap non coperto dai piani
precedenti — va investigato prima di considerare la Fase 2 completa.

- [ ] **Step 3: Checklist manuale pagina `utilities` (`/utilities`)**

- [ ] La lista carica ed elenca le utenze esistenti; il badge attivo/non attivo (colonna sempre
      visibile, indipendente dalla selezione colonne) mostra lo stato corretto per riga
- [ ] Selettore "Colonne visibili" mostra tutte le 41 colonne; selezionarne/deselezionarne
      aggiorna la tabella e persiste dopo un refresh (localStorage, chiave `columns:utilities` —
      verificare che le preferenze salvate dal vecchio codice PrimeNG restino valide, essendo la
      chiave identica)
- [ ] "Esporta CSV" scarica un file `utenze_<data>.csv` con tutte le 41 colonne indipendentemente
      dalla selezione visibile, con formattazione corretta su date (gg/mm/aaaa), booleani (Sì/No),
      importi (`security_deposit`), stato (`expiryStatus` con tutte e 5 le etichette, non solo 3),
      "ID Aggregato" e "Capitolo di Spesa" risolti correttamente
- [ ] **Sort per colonna**: cliccare l'header di almeno 3 colonne diverse (una testuale semplice
      es. "Codice", una annidata es. "Tipo Utenza", e la colonna virtuale "Utilizzatori") e
      verificare che la tabella si riordini correttamente in entrambe le direzioni asc/desc — QUESTO
      È IL PUNTO CRITICO DEL PIANO (fix `ngAfterViewInit`, vedi Global Constraints): non dare per
      scontato che funzioni solo perché la pagina compila e carica dati
- [ ] **Paginazione**: cambiare pagina dal paginatore Material in fondo alla tabella e verificare
      che la tabella mostri effettivamente la pagina successiva (stesso punto critico: se il
      paginatore fosse scollegato dal dataSource, cliccare "pagina successiva" non farebbe nulla)
- [ ] Ricerca rapida (barra in alto) filtra la lista lato client per testo libero
- [ ] Dialog filtri si apre con tutte e 7 le sezioni (Identificazione, Caratteristiche Tecniche,
      Stato Utenza, Dati Contrattuali, Consumi, Utilizzatori aperte di default; Ricerca Testuale
      Avanzata collassata di default); applicare un filtro su un campo con autocomplete (es.
      "Fabbricato Associato") e un filtro range (es. "Scadenza Affid. da/a") e verificare che la
      lista si filtri correttamente; "Pulisci Filtri" resetta tutto
- [ ] **Creazione**: "Aggiungi Utenza" apre il dialog vuoto; validazione required sui 9 campi
      attesi (Codice Utenza, Immobile, Costi a Carico di, Consumo annuo presunto, Consumo annuo
      comunicato Consip [ora visibile in UI], Consumo Annuo da Fatturazione, Deposito Cauzionale,
      Tipo Uso Contatore); i fieldset "Finalità d'uso"/"Utilizzatori" NON sono presenti in
      creazione; cambiare "Tipo Uso Contatore" a un tipo con `hard_type = LIGHT` mostra
      Potenza/Tensione/Tipo Fase, a `GAS` mostra Elemento WBS Gas, `disconnection_ability` è
      sempre visibile indipendentemente dal tipo; salvataggio crea la riga e mostra lo snackbar
      "Utenza creato"
- [ ] **Modifica**: aprire un'utenza esistente di tipo LIGHT — verificare che i campi
      elettrici siano precompilati e visibili; cambiare il "Tipo Uso Contatore" verso un tipo GAS
      e verificare che i campi elettrici scompaiano e appaia "Elemento WBS Gas" (e viceversa);
      per un'utenza con `utilityType.purposes` e `asset.utilizerGrants` popolati, verificare che i
      fieldset "Finalità d'uso"/"Utilizzatori" mostrino i dati corretti (altrimenti il messaggio
      vuoto); pulsanti "Vai al dettaglio immobile"/mostra su mappa funzionano quando disponibili
- [ ] Bottone "Modifica" **visibile anche su una riga eliminata** (nessun `@if` che lo nasconde —
      comportamento diverso da `assets`/`invoices`/`purpose`, verificato intenzionale)
- [ ] Elimina riga apre `ConfirmDialogComponent` con testo "Elimina Utenza" / "Sei sicuro di voler
      eliminare l'Utenza {{utility_id}}?" (testo semplice, senza markdown), conferma elimina (riga
      marcata `row-deleted`)
- [ ] Ripristina riga eliminata apre `ConfirmDialogComponent` con testo "Ripristina Utenza" /
      "Riattiva Utenza {{utility_id}}?", bottone "Ripristina"
- [ ] Deep-link `/utilities?selectedId=<id>` apre automaticamente il dialog di modifica di
      quell'utenza al caricamento pagina
- [ ] Deep-link `/utilities?safeguard=true` precarica la lista filtrata per salvaguardia con
      messaggio informativo (snackbar)
- [ ] Gate ruolo Lettore: con un utente `Lettore`, form del dialog di modifica disabilitato,
      bottone "Salva Utenza"/"Crea Utenza" nascosto

- [ ] **Step 4: Annotare eventuali problemi trovati e correggerli prima di procedere**

Non considerare il Gruppo E (e la Fase 2 nel suo complesso, essendo l'ultimo gruppo) concluso
finché la checklist dello Step 3 non è interamente verde, con particolare attenzione ai due punti
critici di sort e paginazione. Eventuali fix vanno committati come commit aggiuntivi sui file dei
Task 1-4 (non richiedono un nuovo task in questo piano).

- [ ] **Step 5: Verificare che nessun file fuori scope sia stato modificato in modo permanente**

```bash
git status
git diff frontend/src/app/app.routes.ts
```

Expected: nessuna modifica pendente su file diversi da quelli elencati in "File Structure"
all'inizio di questo piano (nessuno stub di `app.routes.ts` da questo gruppo, essendo `utilities`
già instradata sulla route definitiva).

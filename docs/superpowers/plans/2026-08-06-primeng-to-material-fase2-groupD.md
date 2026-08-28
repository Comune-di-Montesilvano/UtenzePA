# Migrazione PrimeNG → Angular Material (Fase 2, Gruppo D: `assets` + `invoices`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrare le due pagine CRUD più complesse del progetto (`assets` e `invoices`) da
PrimeNG ad Angular Material, riusando esattamente il pattern a 4 file stabilito in Fase 1/Gruppo A
(`purpose` come stampo di riferimento) e già consolidato per le classi base
(`AbstractDataTableComponent`, `AbstractSearchComponent`, `AbstractComponent`,
`ConfirmDialogComponent`, `ToastService`) — nessuna di queste va toccata in questo piano.

**Architecture:** Ogni pagina resta a 4 componenti (`XxxComponent` contenitore,
`DataTableXxxComponent`, `SearchXxxComponent`, dialog di filtro) più un nuovo componente dialog
di edit/create dedicato (`XxxEditDialogComponent`, aperto via `MatDialog` da
`editDialogComponent()`). Le 21 colonne configurabili di `assets` e le 10 di `invoices` sono
implementate con un `<ng-container matColumnDef="...">` per campo (obbligatorio in Angular
Material: le colonne non renderizzate perché non in `displayedColumns` non hanno costo, ma il
template deve dichiararle tutte staticamente). La colonna "Utenze" di `assets` e il dialog di
modifica con i tab per `HardType` usano `mat-tab-group`. Il custom sort di `invoices` sostituisce
`sortData` di `MatTableDataSource` (non `sortingDataAccessor`, che non permette comparator a due
argomenti con `localeCompare('it')` — vedi Task 2). I tre `p-select [filter]="true"` del vecchio
codice (`asset_type_id` nel filtro assets, `utility_id_fk`/`supplier_id_fk` nel dialog edit
invoices) diventano `MatAutocomplete` con un `FormControl` di visualizzazione separato dal
`FormControl` reale (pattern standard Material per "select con filtro", nessuna libreria
aggiuntiva).

**Tech Stack:** Angular 20.3 (invariato), `@angular/material`/`@angular/cdk` `^20.x` (già
installati da Fase 1), RxJS 7.8, `class-transformer` per le entity.

## Global Constraints

- Angular resta `^20.3.0` in questo piano — nessun bump a 22 (richiede tutte le pagine migrate,
  vedi piano Fase 1, "Note di chiusura").
- `primeng`/`@primeuix/themes`/`primeicons` restano installati (altre pagine non ancora migrate
  li usano ancora) — non toccare `package.json`.
- Nessuna modifica alle classi base condivise: `AbstractDataTableComponent`,
  `AbstractSearchComponent`, `AbstractComponent`, `ConfirmDialogComponent`, `ToastService`,
  `IColumnDef` (`frontend/src/app/core/interfaces/column-def.interface.ts`, ambient globale,
  nessun import necessario) restano esattamente come sono oggi.
- `ConfirmDialogComponent` renderizza `data.message` come testo semplice (interpolazione, non
  `innerHTML`): niente **grassetto** markdown nei messaggi di conferma — stesso vincolo già
  accettato per `utilizer` (Fase 2/Gruppo A), i messaggi restano testo piatto.
- Gate ruolo Lettore obbligatorio su OGNI edit-dialog: `[readOnly]="['Lettore']"` sul `<form>` +
  `[appHasRole]="['Admin','Operatore']"` sul bottone Salva + `form.disable()` nel constructor se
  ruolo mancante o `'Lettore'` (pattern identico a `PurposeEditDialogComponent`).
- `restoreItem()`/`openDeleteDialog()` vanno overridati in entrambe le data-table (né `Asset` né
  `Invoice` hanno un campo `name` semplice; pattern identico a
  `DataTableUtilizerComponent`).
- Colonne dinamiche: `mat-select multiple` per la selezione, `loadColumnSelection()`/
  `saveColumnSelection()` della base class restano invariati (solo `storageKey`/`allColumns`/
  `defaultFields` cambiano per pagina).
- Niente skeleton PrimeNG: `<mat-progress-bar mode="indeterminate">` quando `loading`.
- Comandi `npm`/`ng`/`tsc` sempre dentro il container Docker (Node ≥24 richiesto — vedi
  CLAUDE.md). Nome container assunto `utenzepa-frontend-1`; verificare con `docker compose ps`
  se diverso.
- Route effettive (da `frontend/src/app/app.routes.ts`): `assets` è servita su path `building`
  (`AssetsComponent`), `invoices` su path `invoices` (`InvoicesComponent`) — non `assets`.
- Decisioni esplicite di correzione/adattamento rispetto al codice PrimeNG originale (motivate
  nei task):
  1. `last_invoice_arrears` diventa `Validators.required` (coerente con l'asterisco già presente
     nella label originale e col default `0`).
  2. `is_paid?: boolean` aggiunto a `Invoice`/`IInvoice` come campo calcolato lato backend,
     escluso in scrittura (`@Exclude({toPlainOnly: true})`).
  3. I due `@Transform` di debug con `console.log` in `invoice.entity.ts` vengono rimossi (tenuto
     solo `@Type(() => Number)`).
  4. Dialog restore di `assets`: header/testo diventano "Ripristina Immobile" (non più
     "Ripristina Asset" — incoerenza nel codice originale, corretta per coerenza col resto della
     pagina che usa sempre "Immobile").
  5. `civic_number`/`zip_code`: nel codice PrimeNG originale è `zip_code` (non `civic_number`) ad
     avere la direttiva `onlyNumbers` + `maxlength="5"` — questo piano segue il codice sorgente
     reale, non la sintesi a memoria.
  6. Ricerca invoices: il vecchio `search-invoices` aveva un campo form `invoice_date_range`
     (mai popolato correttamente: il datepicker PrimeNG in `selectionMode="range"` produce un
     array, ma `InvoicesComponent.onSearch()` leggeva `f.invoice_date_from`/`f.invoice_date_to`,
     chiavi mai presenti nel form — filtro data sempre no-op) e un campo `create_date_range` mai
     renderizzato nel template (dead field). Questo piano introduce due `FormControl` reali
     `invoice_date_from`/`invoice_date_to` (due datepicker singoli Material, non un range) che
     combaciano finalmente con le chiavi già lette da `InvoicesComponent.onSearch()` — la
     conversione `toLocaleDateString('en-CA')` lì presente torna così effettivamente
     raggiungibile.
  7. `InvoicesComponent.onSearch()` viene comunque riscritto/semplificato: la normalizzazione
     virgola→punto (`normalizeDecimalString`) e la seconda rimozione dei valori vuoti erano dead
     code (i campi numerici ora sono input HTML nativi che restituiscono sempre `number`, e
     `AbstractSearchComponent.parseSearchForm()` rimuove già i valori vuoti prima di emettere).
     Il filtro data (punto 6) resta, il resto si allinea al comportamento minimo necessario.
  8. `creationResult`/`ToastModule`/`MessageService` di PrimeNG non esistono più nel contratto
     Material corrente (verificato su `AbstractDataTableComponent` e su `purpose`, già migrato):
     nessuna delle due pagine li usa più; il toast di creazione passa per `entityLabel()`
     (override `'Immobile'`/`'Fattura'`) già gestito da `AbstractComponent.onCreate()` di base.

---

## File Structure

**Nuovi file — `assets`:**
- `frontend/src/app/pages/assets/asset-edit-dialog.component.ts`
- `frontend/src/app/pages/assets/asset-edit-dialog.component.html`
- `frontend/src/app/pages/assets/asset-filter-dialog.component.ts`

**File modificati — `assets`:**
- `frontend/src/app/pages/assets/data-table-assets.component.ts` / `.html`
- `frontend/src/app/pages/assets/search-assets.component.ts` / `.html`
- `frontend/src/app/pages/assets/assets.component.ts` / `.html`

**Nuovi file — `invoices`:**
- `frontend/src/app/pages/invoices/invoice-edit-dialog.component.ts`
- `frontend/src/app/pages/invoices/invoice-edit-dialog.component.html`
- `frontend/src/app/pages/invoices/invoice-filter-dialog.component.ts`

**File modificati — `invoices`:**
- `frontend/src/app/pages/invoices/entity/invoice.entity.ts`
- `frontend/src/app/pages/invoices/entity/invoice.interface.ts`
- `frontend/src/app/pages/invoices/data-table-invoices.component.ts` / `.html`
- `frontend/src/app/pages/invoices/search-invoices.component.ts` / `.html`
- `frontend/src/app/pages/invoices/invoices.component.ts` / `.html`

**File rimossi:**
- `frontend/src/app/pages/invoices/search-invoices.component.css` (stile spostato inline,
  pattern coerente con `search-purpose`/`search-assets`, nessuna pagina Material usa
  `styleUrls` esterni per i filtri).

**File temporaneamente modificati e ripristinati (solo Task 3, QA):**
- `frontend/src/app/app.routes.ts`

---

### Task 1: Migrare `assets`

**Files:**
- Create: `frontend/src/app/pages/assets/asset-edit-dialog.component.ts`
- Create: `frontend/src/app/pages/assets/asset-edit-dialog.component.html`
- Create: `frontend/src/app/pages/assets/asset-filter-dialog.component.ts`
- Modify: `frontend/src/app/pages/assets/data-table-assets.component.ts`
- Modify: `frontend/src/app/pages/assets/data-table-assets.component.html`
- Modify: `frontend/src/app/pages/assets/search-assets.component.ts`
- Modify: `frontend/src/app/pages/assets/search-assets.component.html`
- Modify: `frontend/src/app/pages/assets/assets.component.ts`
- Modify: `frontend/src/app/pages/assets/assets.component.html`

**Interfaces:**
- Consumes: `AbstractDataTableComponent<Asset>` (`editDialogComponent()`, `entityLabel()`,
  `openDeleteDialog()`, `restoreItem()`, `itemInstance()`, `exportToCSV(columns, filename)`,
  `exportCellValue()`, `getNestedValue()`, `loadColumnSelection()`/`saveColumnSelection()`),
  `AbstractSearchComponent` (`filterDialogComponent()`, `openFilterDialog()`,
  `parseSearchForm()`), `EditDialogData<Asset>`, `FilterDialogData<V>`, `Asset.create()`,
  `AssetAggregatorsService.search()`, `AssetService.categoryOptions()`/`toponymOptions()`,
  `HardType.items()`.
- Produces: `AssetEditDialogComponent` (dialog create/edit, registrata da
  `DataTableAssetsComponent.editDialogComponent()`), `AssetFilterDialogComponent` (dialog
  filtri, registrata da `SearchAssetsComponent.filterDialogComponent()`). Nessuna modifica alla
  superficie pubblica verso `assets.component.html` (`data`, `loading`, `onSave`, `onDelete`,
  `onCreate`, `onRestore`, `resetPagingTrigger`).

- [ ] **Step 1: Creare `AssetEditDialogComponent` (TypeScript)**

`frontend/src/app/pages/assets/asset-edit-dialog.component.ts`:

```typescript
import {Component, inject, OnInit} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {MatTabsModule} from '@angular/material/tabs';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatIconModule} from '@angular/material/icon';
import {plainToInstance} from 'class-transformer';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {Asset} from './entity/asset.entity';
import {AuthService} from '../../services/auth.service';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';
import {OnlyNumbersDirective} from '../../core/directives/only-numbers.directive';
import {LatitudeInputDirective} from '../../core/directives/latitude-input.directive';
import {LongitudeInputDirective} from '../../core/directives/longitude-input.directive';
import {AssetAggregatorsService} from '../asset-aggregator/asset-aggregator.service';
import {AssetAggregator} from '../asset-aggregator/entity/asset-aggregator.entity';
import {AssetService} from './asset.service';
import {TOption} from '../../core/types/option.interface';
import {HardType} from '../utility-types/enum/hard-type.enum';
import {Utility} from '../utilities/entity/utility.entity';
import {TruncatePipe} from '../../core/pipes/truncate.pipe';
import {FormatAmountPipe} from '../../core/pipes/format-amount.pipe';
import {DatePipe} from '@angular/common';

@Component({
  selector: 'app-asset-edit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatTabsModule,
    MatTooltipModule,
    MatIconModule,
    HasRoleDirective,
    ReadOnlyDirective,
    OnlyNumbersDirective,
    LatitudeInputDirective,
    LongitudeInputDirective,
    TruncatePipe,
    FormatAmountPipe,
    DatePipe,
  ],
  templateUrl: './asset-edit-dialog.component.html'
})
export class AssetEditDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<AssetEditDialogComponent, Asset | undefined>);
  private authService = inject(AuthService);
  private assetAggregatorsService = inject(AssetAggregatorsService);
  private assetService = inject(AssetService);
  protected data = inject<EditDialogData<Asset>>(MAT_DIALOG_DATA);

  isNew = this.data.mode === 'create';
  maxDescLength = 50;

  assetAggregatorOptions: AssetAggregator[] = [];
  categoryOptions: TOption[] = this.assetService.categoryOptions();
  toponomyOptions: TOption[] = this.assetService.toponymOptions();
  ownershipOptions: TOption[] = [
    {label: 'Sì', value: 1},
    {label: 'No', value: 0}
  ];
  tabs = HardType.items();

  form = this.fb.group({
    asset_name: [this.data.item.asset_name ?? '', Validators.required],
    asset_type_id: [
      this.data.item.assetAggregator != null ? (this.data.item.asset_type_id ?? null) : null,
      Validators.required
    ],
    category: [this.data.item.category ?? null],
    ownership: [this.data.item.ownership ?? 0],
    toponym: [this.data.item.toponym ?? null],
    address: [this.data.item.address ?? null],
    civic_number: [this.data.item.civic_number ?? null],
    municipality: [this.data.item.municipality ?? null],
    zip_code: [this.data.item.zip_code ?? null],
    services_and_artifacts: [this.data.item.services_and_artifacts ?? null],
    latitude: [this.data.item.latitude ?? null],
    longitude: [this.data.item.longitude ?? null],
    cadastral_value: [this.data.item.cadastral_value ?? null],
    sheet: [this.data.item.sheet ?? null],
    parcel: [this.data.item.parcel ?? null],
    subordinate: [this.data.item.subordinate ?? null],
    area_sqm: [this.data.item.area_sqm ?? null],
    associated_building: [this.data.item.associated_building ?? null],
    specific_details: [this.data.item.specific_details ?? null],
    memo: [this.data.item.memo ?? null],
  });

  constructor() {
    const role = this.authService.getCurrentUser()?.role;
    if (!role || role === 'Lettore') {
      this.form.disable();
    }
  }

  ngOnInit(): void {
    this.assetAggregatorsService.search({deleted: false}).subscribe({
      next: data => this.assetAggregatorOptions = data,
      error: err => console.error('Errore nel caricamento degli Asset Aggregator:', err)
    });
  }

  getUtilitiesByHardType(hardType: HardType): Utility[] {
    return this.data.item.utilities?.filter(u => u.utilityType?.hard_type === hardType) ?? [];
  }

  getUtilityCountByType(hardType: HardType): number {
    return this.getUtilitiesByHardType(hardType).length;
  }

  openUtilityDetail(utility: Utility): void {
    window.open(`/utilities?selectedId=${utility.id}`, '_blank');
  }

  save(): void {
    if (!this.form.valid) return;
    const result = plainToInstance(Asset, {
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

Nota: `asset_type_id` replica la logica di `resolveOnRelation('assetAggregator', 'asset_type_id',
data)` presente nell'originale (metodo disponibile solo su `AbstractDataTableComponent`, non
accessibile da un dialog standalone) — se `assetAggregator` non è popolato (FK orfana o non
caricata), il campo parte `null` invece di mostrare un ID non risolvibile nella select.

- [ ] **Step 2: Creare il template `AssetEditDialogComponent`**

`frontend/src/app/pages/assets/asset-edit-dialog.component.html`:

```html
<h2 mat-dialog-title>
  {{ isNew ? 'Aggiungi Immobile' : 'Modifica Immobile: ' + data.item.asset_name }}
</h2>

<mat-dialog-content>
  <form [formGroup]="form" [readOnly]="['Lettore']" style="display: flex; flex-direction: column; gap: 1rem;">

    <div style="display: flex; flex-wrap: wrap; gap: 1rem;">
      <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
        <mat-label>Codice *</mat-label>
        <input matInput formControlName="asset_name">
        @if (form.controls.asset_name.invalid && form.controls.asset_name.touched) {
          <mat-error>Obbligatorio</mat-error>
        }
      </mat-form-field>

      <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
        <mat-label>Tipo immobile *</mat-label>
        <mat-select formControlName="asset_type_id">
          @for (opt of assetAggregatorOptions; track opt.id) {
            <mat-option [value]="opt.id">{{ opt.code }}</mat-option>
          }
        </mat-select>
        @if (form.controls.asset_type_id.invalid && form.controls.asset_type_id.touched) {
          <mat-error>Obbligatorio</mat-error>
        }
      </mat-form-field>

      <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
        <mat-label>Categoria (destinazione d'uso)</mat-label>
        <mat-select formControlName="category">
          @for (opt of categoryOptions; track opt.value) {
            <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
        <mat-label>Proprietà</mat-label>
        <mat-select formControlName="ownership">
          @for (opt of ownershipOptions; track opt.value) {
            <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
    </div>

    <div style="display: flex; flex-wrap: wrap; gap: 1rem;">
      <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
        <mat-label>Toponimo</mat-label>
        <mat-select formControlName="toponym">
          @for (opt of toponomyOptions; track opt.value) {
            <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
        <mat-label>Indirizzo</mat-label>
        <input matInput formControlName="address">
      </mat-form-field>

      <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
        <mat-label>Civico</mat-label>
        <input matInput formControlName="civic_number">
      </mat-form-field>

      <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
        <mat-label>Comune</mat-label>
        <input matInput formControlName="municipality">
      </mat-form-field>
    </div>

    <div style="display: flex; flex-wrap: wrap; gap: 1rem;">
      <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
        <mat-label>CAP</mat-label>
        <input matInput formControlName="zip_code" maxlength="5" inputmode="numeric" onlyNumbers>
      </mat-form-field>

      <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
        <mat-label>Servizi/Manufatti</mat-label>
        <input matInput formControlName="services_and_artifacts">
      </mat-form-field>

      <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
        <mat-label>Latitudine</mat-label>
        <input matInput formControlName="latitude" placeholder="Es. 41.1158" geoLatitude>
      </mat-form-field>

      <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
        <mat-label>Longitudine</mat-label>
        <input matInput formControlName="longitude" placeholder="Es. 16.8776" geoLongitude>
      </mat-form-field>
    </div>

    <div style="display: flex; flex-wrap: wrap; gap: 1rem;">
      <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
        <mat-label>Valore catastale (€)</mat-label>
        <input matInput type="number" step="0.01" formControlName="cadastral_value">
      </mat-form-field>

      <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
        <mat-label>Foglio</mat-label>
        <input matInput formControlName="sheet">
      </mat-form-field>

      <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
        <mat-label>Particella (Mappale)</mat-label>
        <input matInput formControlName="parcel">
      </mat-form-field>

      <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
        <mat-label>Subalterno</mat-label>
        <input matInput formControlName="subordinate">
      </mat-form-field>
    </div>

    <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
      <mat-label>Superficie (mq)</mat-label>
      <input matInput type="number" step="0.01" formControlName="area_sqm">
    </mat-form-field>

    <div style="display: flex; flex-direction: row; gap: 1rem;">
      <mat-form-field style="flex: 1 1 0;">
        <mat-label>Descrizione fabbricato</mat-label>
        <textarea matInput formControlName="associated_building" rows="3" maxlength="255"></textarea>
      </mat-form-field>

      <mat-form-field style="flex: 1 1 0;">
        <mat-label>Specifiche</mat-label>
        <textarea matInput formControlName="specific_details" rows="3"></textarea>
      </mat-form-field>
    </div>

    <mat-form-field>
      <mat-label>Promemoria</mat-label>
      <textarea matInput formControlName="memo" rows="3"></textarea>
    </mat-form-field>

    @if (!isNew) {
      <div>
        <h4>Utilizzatori</h4>
        @if (data.item.utilizerGrants && data.item.utilizerGrants.length > 0) {
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr>
                <th style="text-align: left;">ID</th>
                <th style="text-align: left;">Utilizzatore</th>
                <th style="text-align: left;">Atto di Concessione</th>
                <th style="text-align: left;">Concesso</th>
                <th style="text-align: left;">Scadenza</th>
              </tr>
            </thead>
            <tbody>
              @for (u of data.item.utilizerGrants; track u.id) {
                @if (u.utilizer && !u.deleted) {
                  <tr [class.row-deleted]="u.deleted">
                    <td>{{ u.id }}</td>
                    <td [matTooltip]="u.utilizer.name">{{ u.utilizer.name | truncate: maxDescLength }}</td>
                    <td>
                      @if (u.concession_act) {
                        <span [matTooltip]="u.concession_act">{{ u.concession_act | truncate: maxDescLength }}</span>
                      } @else {
                        N/D
                      }
                    </td>
                    <td>{{ u.grant_date | date: 'dd/MM/yyyy' }}</td>
                    <td>{{ u.expire_date | date: 'dd/MM/yyyy' }}</td>
                  </tr>
                }
              }
            </tbody>
          </table>
        } @else {
          <p style="color: #6A7282; margin: 0.5rem 0;">Nessun utilizzatore associato a questo immobile.</p>
        }
      </div>

      <div>
        <h4>Utenze</h4>
        <mat-tab-group>
          @for (tab of tabs; track tab.value) {
            <mat-tab>
              <ng-template mat-tab-label>
                <i [class]="tab.icon" [style.color]="tab.color" style="margin-right: 5px;"></i>
                {{ tab.label }} ({{ getUtilityCountByType(tab.value) }})
              </ng-template>
              @let utilities = getUtilitiesByHardType(tab.value);
              @if (utilities.length > 0) {
                <table style="width: 100%; border-collapse: collapse; margin-top: 1rem;">
                  <thead>
                    <tr>
                      <th style="text-align: left;">ID Utenza</th>
                      <th style="text-align: left;">Codice</th>
                      <th style="text-align: left;">N° Contatore</th>
                      <th style="text-align: left;">Fornitore</th>
                      <th style="text-align: left;">Attiva</th>
                      <th style="text-align: left;">Inizio Fornitura</th>
                      <th style="text-align: left;">Scadenza Fornitura</th>
                      <th style="width: 60px;"></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (u of utilities; track u.id) {
                      <tr>
                        <td>{{ u.utility_id }}</td>
                        <td>{{ u.utility_code }}</td>
                        <td>{{ u.meter_number }}</td>
                        <td>{{ u.supplier?.company_name }}</td>
                        <td>{{ u.supply_active ? 'Sì' : 'No' }}</td>
                        <td>{{ u.supply_start_date | date: 'dd/MM/yyyy' }}</td>
                        <td>{{ u.supply_expiry_date | date: 'dd/MM/yyyy' }}</td>
                        <td>
                          <button mat-icon-button matTooltip="Apri dettaglio utenza" (click)="openUtilityDetail(u)">
                            <mat-icon>description</mat-icon>
                          </button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              } @else {
                <p style="color: #6A7282; margin: 1rem 0;">
                  Nessuna utenza di tipo <strong>{{ tab.label }}</strong> associata a questo immobile.
                </p>
              }
            </mat-tab>
          }
        </mat-tab-group>
      </div>
    }

  </form>
</mat-dialog-content>

<mat-dialog-actions align="end">
  <button mat-stroked-button (click)="cancel()">Annulla</button>
  <button mat-flat-button (click)="save()" [disabled]="!form.valid" [appHasRole]="['Admin','Operatore']">
    Salva Immobile
  </button>
</mat-dialog-actions>
```

- [ ] **Step 3: Creare `AssetFilterDialogComponent`**

`frontend/src/app/pages/assets/asset-filter-dialog.component.ts`:

```typescript
import {Component, inject, OnInit} from '@angular/core';
import {FormBuilder, FormControl, ReactiveFormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatAutocompleteModule} from '@angular/material/autocomplete';
import {MatRadioModule} from '@angular/material/radio';
import {MatButtonModule} from '@angular/material/button';
import {FilterDialogData} from '../../core/components/abstract-search.component';
import {AssetAggregatorsService} from '../asset-aggregator/asset-aggregator.service';
import {AssetService} from './asset.service';
import {TOption} from '../../core/types/option.interface';

export interface AssetFilterValues {
  asset_name: string | null;
  asset_type_id: number | null;
  category: string | null;
  ownership: number | null;
  toponym: string | null;
  address: string | null;
  civic_number: string | null;
  municipality: string | null;
  zip_code: string | null;
  latitude: string | null;
  longitude: string | null;
  services_and_artifacts: string | null;
  cadastral_value: number | null;
  area_sqm: number | null;
  sheet: string | null;
  parcel: string | null;
  subordinate: string | null;
  associated_building: string | null;
  specific_details: string | null;
  memo: string | null;
}

@Component({
  selector: 'app-asset-filter-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatAutocompleteModule, MatRadioModule, MatButtonModule
  ],
  templateUrl: './asset-filter-dialog.component.html'
})
export class AssetFilterDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<AssetFilterDialogComponent, AssetFilterValues | 'clear'>);
  private assetAggregatorsService = inject(AssetAggregatorsService);
  private assetService = inject(AssetService);
  protected data = inject<FilterDialogData<AssetFilterValues>>(MAT_DIALOG_DATA);

  categoryOptions: TOption[] = this.assetService.categoryOptions();
  toponomyOptions: TOption[] = this.assetService.toponymOptions();

  assetAggregatorOptions: TOption[] = [];
  filteredAssetAggregatorOptions: TOption[] = [];
  assetTypeFilterCtrl = new FormControl<string>('');

  form = this.fb.group({
    asset_name: [this.data.values.asset_name ?? ''],
    asset_type_id: [this.data.values.asset_type_id ?? null],
    category: [this.data.values.category ?? null],
    ownership: [this.data.values.ownership ?? null],
    toponym: [this.data.values.toponym ?? null],
    address: [this.data.values.address ?? ''],
    civic_number: [this.data.values.civic_number ?? ''],
    municipality: [this.data.values.municipality ?? ''],
    zip_code: [this.data.values.zip_code ?? ''],
    latitude: [this.data.values.latitude ?? ''],
    longitude: [this.data.values.longitude ?? ''],
    services_and_artifacts: [this.data.values.services_and_artifacts ?? ''],
    cadastral_value: [this.data.values.cadastral_value ?? null],
    area_sqm: [this.data.values.area_sqm ?? null],
    sheet: [this.data.values.sheet ?? ''],
    parcel: [this.data.values.parcel ?? ''],
    subordinate: [this.data.values.subordinate ?? ''],
    associated_building: [this.data.values.associated_building ?? ''],
    specific_details: [this.data.values.specific_details ?? ''],
    memo: [this.data.values.memo ?? ''],
  });

  ngOnInit(): void {
    this.assetAggregatorsService.search({deleted: false}).subscribe({
      next: data => {
        this.assetAggregatorOptions = data
          .map(a => ({label: a.description ?? '', value: a.id}))
          .sort((a, b) => a.label.localeCompare(b.label));
        this.filteredAssetAggregatorOptions = this.assetAggregatorOptions;
        this.assetTypeFilterCtrl.setValue(this.displayAssetType(this.form.value.asset_type_id ?? null), {emitEvent: false});
      },
      error: err => console.error('Errore nel caricamento degli Asset Aggregator:', err)
    });

    this.assetTypeFilterCtrl.valueChanges.subscribe(term => {
      const t = (typeof term === 'string' ? term : '').toLowerCase();
      this.filteredAssetAggregatorOptions = this.assetAggregatorOptions.filter(o => o.label.toLowerCase().includes(t));
    });
  }

  displayAssetType = (value: number | null): string =>
    this.assetAggregatorOptions.find(o => o.value === value)?.label ?? '';

  onAssetTypeSelected(value: number): void {
    this.form.patchValue({asset_type_id: value});
  }

  apply(): void {
    this.dialogRef.close(this.form.getRawValue() as AssetFilterValues);
  }

  clear(): void {
    this.dialogRef.close('clear');
  }
}
```

- [ ] **Step 4: Creare il template `AssetFilterDialogComponent`**

`frontend/src/app/pages/assets/asset-filter-dialog.component.html`:

```html
<h2 mat-dialog-title>Filtri di ricerca Immobili</h2>
<mat-dialog-content>
  <form [formGroup]="form" id="filter-form" (ngSubmit)="apply()" style="display: flex; flex-direction: column; gap: 1rem;">

    <div style="display: flex; flex-wrap: wrap; gap: 1rem;">
      <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
        <mat-label>Codice univoco</mat-label>
        <input matInput formControlName="asset_name">
      </mat-form-field>

      <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
        <mat-label>Tipo immobile</mat-label>
        <input matInput [formControl]="assetTypeFilterCtrl" [matAutocomplete]="autoAssetType" placeholder="Cerca...">
        <mat-autocomplete #autoAssetType="matAutocomplete" [displayWith]="displayAssetType">
          @for (opt of filteredAssetAggregatorOptions; track opt.value) {
            <mat-option [value]="opt.value" (onSelectionChange)="onAssetTypeSelected(opt.value)">{{ opt.label }}</mat-option>
          }
        </mat-autocomplete>
      </mat-form-field>

      <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
        <mat-label>Categoria</mat-label>
        <mat-select formControlName="category">
          @for (opt of categoryOptions; track opt.value) {
            <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <div style="flex: 1 1 calc(25% - 0.75rem);">
        <label>Proprietà</label>
        <mat-radio-group formControlName="ownership" style="display: flex; gap: 1rem; padding-top: 0.4rem;">
          <mat-radio-button [value]="null">Tutti</mat-radio-button>
          <mat-radio-button [value]="1">Sì</mat-radio-button>
          <mat-radio-button [value]="0">No</mat-radio-button>
        </mat-radio-group>
      </div>
    </div>

    <div style="display: flex; flex-wrap: wrap; gap: 1rem;">
      <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
        <mat-label>Toponimo</mat-label>
        <mat-select formControlName="toponym">
          @for (opt of toponomyOptions; track opt.value) {
            <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
        <mat-label>Indirizzo</mat-label>
        <input matInput formControlName="address">
      </mat-form-field>
      <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
        <mat-label>Civico</mat-label>
        <input matInput formControlName="civic_number">
      </mat-form-field>
      <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
        <mat-label>Comune</mat-label>
        <input matInput formControlName="municipality">
      </mat-form-field>
    </div>

    <div style="display: flex; flex-wrap: wrap; gap: 1rem;">
      <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
        <mat-label>CAP</mat-label>
        <input matInput formControlName="zip_code">
      </mat-form-field>
      <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
        <mat-label>Servizi/Manufatti</mat-label>
        <input matInput formControlName="services_and_artifacts">
      </mat-form-field>
      <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
        <mat-label>Latitudine</mat-label>
        <input matInput formControlName="latitude" placeholder="Es. 41.1158">
      </mat-form-field>
      <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
        <mat-label>Longitudine</mat-label>
        <input matInput formControlName="longitude" placeholder="Es. 16.8776">
      </mat-form-field>
    </div>

    <div style="display: flex; flex-wrap: wrap; gap: 1rem;">
      <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
        <mat-label>Valore catastale</mat-label>
        <input matInput type="number" step="0.01" formControlName="cadastral_value">
      </mat-form-field>
      <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
        <mat-label>Superficie (mq)</mat-label>
        <input matInput type="number" step="0.01" formControlName="area_sqm">
      </mat-form-field>
      <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
        <mat-label>Foglio</mat-label>
        <input matInput formControlName="sheet">
      </mat-form-field>
      <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
        <mat-label>Particella (Mappale)</mat-label>
        <input matInput formControlName="parcel">
      </mat-form-field>
    </div>

    <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
      <mat-label>Subalterno</mat-label>
      <input matInput formControlName="subordinate">
    </mat-form-field>

    <div style="display: flex; flex-direction: row; gap: 1rem;">
      <mat-form-field style="flex: 1 1 0;">
        <mat-label>Descrizione fabbricato</mat-label>
        <textarea matInput formControlName="associated_building" rows="4"></textarea>
      </mat-form-field>
      <mat-form-field style="flex: 1 1 0;">
        <mat-label>Specifiche</mat-label>
        <textarea matInput formControlName="specific_details" rows="4"></textarea>
      </mat-form-field>
    </div>

    <mat-form-field>
      <mat-label>Promemoria</mat-label>
      <textarea matInput formControlName="memo" rows="4"></textarea>
    </mat-form-field>

  </form>
</mat-dialog-content>
<mat-dialog-actions align="end">
  <button mat-stroked-button (click)="clear()">Pulisci Filtri</button>
  <button mat-flat-button type="submit" form="filter-form">Applica Filtri</button>
</mat-dialog-actions>
```

- [ ] **Step 5: Riscrivere `data-table-assets.component.ts`**

`frontend/src/app/pages/assets/data-table-assets.component.ts`:

```typescript
import {Component, Type} from '@angular/core';
import {MatTableModule} from '@angular/material/table';
import {MatSortModule} from '@angular/material/sort';
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
import {Asset} from './entity/asset.entity';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {AssetEditDialogComponent} from './asset-edit-dialog.component';
import {ConfirmDialogComponent} from '../../core/components/confirm-dialog.component';
import {HardType} from '../utility-types/enum/hard-type.enum';
import {FormatAmountPipe} from '../../core/pipes/format-amount.pipe';
import {TruncatePipe} from '../../core/pipes/truncate.pipe';

@Component({
  selector: 'app-data-table-assets',
  standalone: true,
  imports: [
    MatTableModule, MatSortModule, MatPaginatorModule, MatButtonModule, MatIconModule,
    MatTooltipModule, MatProgressBarModule, MatSelectModule, MatFormFieldModule, FormsModule,
    HasRoleDirective, FormatAmountPipe, TruncatePipe
  ],
  templateUrl: './data-table-assets.component.html'
})
export class DataTableAssetsComponent extends AbstractDataTableComponent<Asset> {

  readonly allColumns: IColumnDef[] = [
    {field: 'id', header: 'ID', minWidth: '50px'},
    {field: 'asset_name', header: 'Codice univoco', minWidth: '150px'},
    {field: 'assetAggregator.description', header: 'Tipo immobile', minWidth: '150px'},
    {field: 'category', header: 'Categoria', minWidth: '120px'},
    {field: 'ownership', header: 'Proprietà', minWidth: '100px'},
    {field: 'toponym', header: 'Toponimo', minWidth: '100px'},
    {field: 'address', header: 'Indirizzo', minWidth: '150px'},
    {field: 'civic_number', header: 'Civico', minWidth: '80px'},
    {field: 'municipality', header: 'Comune', minWidth: '150px'},
    {field: 'zip_code', header: 'CAP', minWidth: '80px'},
    {field: 'services_and_artifacts', header: 'Servizi/Manufatti', minWidth: '200px'},
    {field: 'cadastral_value', header: 'Valore catastale', minWidth: '150px'},
    {field: 'latitude', header: 'Latitudine', minWidth: '100px'},
    {field: 'longitude', header: 'Longitudine', minWidth: '100px'},
    {field: 'sheet', header: 'Foglio', minWidth: '80px'},
    {field: 'parcel', header: 'Particella (Mappale)', minWidth: '100px'},
    {field: 'subordinate', header: 'Subalterno', minWidth: '100px'},
    {field: 'area_sqm', header: 'Superficie (mq)', minWidth: '120px'},
    {field: 'associated_building', header: 'Descrizione fabbricato', minWidth: '200px'},
    {field: 'specific_details', header: 'Specifiche', minWidth: '200px'},
    {field: 'memo', header: 'Promemoria', minWidth: '200px'},
  ];

  private readonly defaultVisibleFields = new Set([
    'id', 'asset_name', 'assetAggregator.description', 'category', 'ownership', 'address', 'municipality'
  ]);

  private static readonly STORAGE_KEY = 'columns:assets';

  selectedColumns: IColumnDef[] = this.loadColumnSelection(
    DataTableAssetsComponent.STORAGE_KEY, this.allColumns, this.defaultVisibleFields
  );

  maxDescLength = 50;
  tabs = HardType.items();

  get displayedColumns(): string[] {
    return ['actions', 'utilities', ...this.selectedColumns.map(c => c.field)];
  }

  compareColumns = (a: IColumnDef, b: IColumnDef): boolean => a?.field === b?.field;

  onColumnsChange(): void {
    this.saveColumnSelection(DataTableAssetsComponent.STORAGE_KEY, this.selectedColumns);
  }

  constructor(screen: ScreenSizeService) {
    super(screen);
    this.dataSource.sortingDataAccessor = (item: Asset, property: string) => {
      const value = this.getNestedValue(item, property);
      return (value ?? '') as string | number;
    };
  }

  getUtilityCountByType(item: Asset, hardType: HardType): number {
    return item.utilities?.filter(u => u.utilityType?.hard_type === hardType).length ?? 0;
  }

  protected override exportCellValue(item: Asset, field: string): string {
    switch (field) {
      case 'ownership':
        return item.ownership ? 'Sì' : 'No';
      case 'cadastral_value':
        return item.cadastral_value != null
          ? item.cadastral_value.toLocaleString('it-IT', {minimumFractionDigits: 2, maximumFractionDigits: 2})
          : '';
      case 'assetAggregator.description':
        return item.assetAggregator?.description ?? '';
      default:
        return String(this.getNestedValue(item, field) ?? '');
    }
  }

  override exportToCSV(): void {
    super.exportToCSV(this.allColumns, 'immobili');
  }

  override itemInstance(): Asset {
    return Asset.create();
  }

  override editDialogComponent(): Type<unknown> {
    return AssetEditDialogComponent;
  }

  protected override entityLabel(): string {
    return 'Immobile';
  }

  override openDeleteDialog(entity: Asset): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Elimina Immobile',
        message: `Sei sicuro di voler eliminare l'Immobile ${entity.asset_name}?`,
        confirmLabel: 'Elimina',
        danger: true
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onDelete.emit(entity);
    });
  }

  override restoreItem(entity: Asset): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Ripristina Immobile',
        message: `Riattiva Immobile ${entity.asset_name}?`,
        confirmLabel: 'Ripristina'
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onRestore.emit(entity);
    });
  }
}
```

- [ ] **Step 6: Riscrivere `data-table-assets.component.html`**

`frontend/src/app/pages/assets/data-table-assets.component.html`:

```html
<div style="display: flex; justify-content: space-between; align-items: center;">
  <h3>Elenco ({{ data.length }})</h3>
  <button mat-flat-button (click)="openCreateDialog()" [appHasRole]="['Admin', 'Operatore']">
    <mat-icon>add</mat-icon>
    Aggiungi Immobile
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

<table mat-table [dataSource]="dataSource" matSort #sort="matSort" class="mat-elevation-z1">

  <ng-container matColumnDef="actions">
    <th mat-header-cell *matHeaderCellDef>Azioni</th>
    <td mat-cell *matCellDef="let item">
      @if (!item.deleted) {
        <button mat-icon-button (click)="openEditDialog(item)" [appHasRole]="['Admin', 'Operatore', 'Lettore']"
                matTooltip="Modifica">
          <mat-icon>edit</mat-icon>
        </button>
      }
      <button mat-icon-button
              [class.mat-action-success]="item.deleted"
              [class.mat-action-danger]="!item.deleted"
              (click)="item.deleted ? restoreItem(item) : openDeleteDialog(item)"
              [appHasRole]="['Admin', 'Operatore']"
              [matTooltip]="item.deleted ? 'Ripristina' : 'Elimina'">
        <mat-icon>{{ item.deleted ? 'restore' : 'delete' }}</mat-icon>
      </button>
    </td>
  </ng-container>

  <ng-container matColumnDef="utilities">
    <th mat-header-cell *matHeaderCellDef>Utenze</th>
    <td mat-cell *matCellDef="let item">
      @for (tab of tabs; track tab.value) {
        @let count = getUtilityCountByType(item, tab.value);
        @if (count > 0) {
          <span [matTooltip]="tab.label + ': ' + count" style="margin-right: 6px; display: inline-flex; align-items: center; gap: 2px;">
            <i [class]="tab.icon" [style.color]="tab.color"></i>
            <small>{{ count }}</small>
          </span>
        }
      }
    </td>
  </ng-container>

  <ng-container matColumnDef="id">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>ID</th>
    <td mat-cell *matCellDef="let item">{{ item.id }}</td>
  </ng-container>

  <ng-container matColumnDef="asset_name">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Codice univoco</th>
    <td mat-cell *matCellDef="let item">{{ item.asset_name }}</td>
  </ng-container>

  <ng-container matColumnDef="assetAggregator.description">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Tipo immobile</th>
    <td mat-cell *matCellDef="let item">
      @if (item.assetAggregator?.description) {
        <span [matTooltip]="item.assetAggregator.description">
          {{ item.assetAggregator.description | truncate: maxDescLength }}
        </span>
      }
    </td>
  </ng-container>

  <ng-container matColumnDef="category">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Categoria</th>
    <td mat-cell *matCellDef="let item">{{ item.category }}</td>
  </ng-container>

  <ng-container matColumnDef="ownership">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Proprietà</th>
    <td mat-cell *matCellDef="let item">{{ item.ownership ? 'Sì' : 'No' }}</td>
  </ng-container>

  <ng-container matColumnDef="toponym">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Toponimo</th>
    <td mat-cell *matCellDef="let item">{{ item.toponym }}</td>
  </ng-container>

  <ng-container matColumnDef="address">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Indirizzo</th>
    <td mat-cell *matCellDef="let item">{{ item.address }}</td>
  </ng-container>

  <ng-container matColumnDef="civic_number">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Civico</th>
    <td mat-cell *matCellDef="let item">{{ item.civic_number }}</td>
  </ng-container>

  <ng-container matColumnDef="municipality">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Comune</th>
    <td mat-cell *matCellDef="let item">{{ item.municipality }}</td>
  </ng-container>

  <ng-container matColumnDef="zip_code">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>CAP</th>
    <td mat-cell *matCellDef="let item">{{ item.zip_code }}</td>
  </ng-container>

  <ng-container matColumnDef="services_and_artifacts">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Servizi/Manufatti</th>
    <td mat-cell *matCellDef="let item">
      @if (item.services_and_artifacts) {
        <span [matTooltip]="item.services_and_artifacts">{{ item.services_and_artifacts | truncate: maxDescLength }}</span>
      }
    </td>
  </ng-container>

  <ng-container matColumnDef="cadastral_value">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Valore catastale</th>
    <td mat-cell *matCellDef="let item">{{ item.cadastral_value | formatAmount }}</td>
  </ng-container>

  <ng-container matColumnDef="latitude">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Latitudine</th>
    <td mat-cell *matCellDef="let item">{{ item.latitude }}</td>
  </ng-container>

  <ng-container matColumnDef="longitude">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Longitudine</th>
    <td mat-cell *matCellDef="let item">{{ item.longitude }}</td>
  </ng-container>

  <ng-container matColumnDef="sheet">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Foglio</th>
    <td mat-cell *matCellDef="let item">{{ item.sheet }}</td>
  </ng-container>

  <ng-container matColumnDef="parcel">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Particella (Mappale)</th>
    <td mat-cell *matCellDef="let item">{{ item.parcel }}</td>
  </ng-container>

  <ng-container matColumnDef="subordinate">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Subalterno</th>
    <td mat-cell *matCellDef="let item">{{ item.subordinate }}</td>
  </ng-container>

  <ng-container matColumnDef="area_sqm">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Superficie (mq)</th>
    <td mat-cell *matCellDef="let item">{{ item.area_sqm }}</td>
  </ng-container>

  <ng-container matColumnDef="associated_building">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Descrizione fabbricato</th>
    <td mat-cell *matCellDef="let item">
      @if (item.associated_building) {
        <span [matTooltip]="item.associated_building">{{ item.associated_building | truncate: maxDescLength }}</span>
      }
    </td>
  </ng-container>

  <ng-container matColumnDef="specific_details">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Specifiche</th>
    <td mat-cell *matCellDef="let item">
      @if (item.specific_details) {
        <span [matTooltip]="item.specific_details">{{ item.specific_details | truncate: maxDescLength }}</span>
      }
    </td>
  </ng-container>

  <ng-container matColumnDef="memo">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Promemoria</th>
    <td mat-cell *matCellDef="let item">
      @if (item.memo) {
        <span [matTooltip]="item.memo">{{ item.memo | truncate: maxDescLength }}</span>
      }
    </td>
  </ng-container>

  <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
  <tr mat-row *matRowDef="let row; columns: displayedColumns;" [class.row-deleted]="row.deleted"></tr>

  <tr class="mat-row" *matNoDataRow>
    <td class="mat-cell" [attr.colspan]="displayedColumns.length">Nessun immobile trovato.</td>
  </tr>
</table>

<mat-paginator #paginator [pageSizeOptions]="rowsPerPageOptions" [pageSize]="10"></mat-paginator>

<style>
  .row-deleted {
    background-color: #fcebeb;
    opacity: 0.7;
    text-decoration: line-through;
  }
</style>
```

- [ ] **Step 7: Riscrivere `search-assets.component.ts`**

`frontend/src/app/pages/assets/search-assets.component.ts`:

```typescript
import {Component, Type} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {AbstractSearchComponent} from '../../core/components/abstract-search.component';
import {AssetFilterDialogComponent} from './asset-filter-dialog.component';

@Component({
  selector: 'app-search-assets',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule],
  templateUrl: './search-assets.component.html',
})
export class SearchAssetsComponent extends AbstractSearchComponent {

  constructor(private fb: FormBuilder) {
    super();
    this.qSearch = this.fb.group({
      qsearch: [''],
      asset_name: [''],
      asset_type_id: [null],
      category: [null],
      ownership: [null],
      toponym: [null],
      address: [''],
      civic_number: [''],
      municipality: [''],
      zip_code: [''],
      latitude: [''],
      longitude: [''],
      services_and_artifacts: [''],
      cadastral_value: [null],
      area_sqm: [null],
      sheet: [''],
      parcel: [''],
      subordinate: [''],
      associated_building: [''],
      specific_details: [''],
      memo: [''],
    });
  }

  override filterDialogComponent(): Type<unknown> {
    return AssetFilterDialogComponent;
  }

  override filterDialogWidth(): string {
    return '1000px';
  }
}
```

(rimosso il caricamento di `assetAggregatorOptions`/`toponomyOptions`/`categoryOptions` dal
componente search: ora vivono in `AssetFilterDialogComponent`, aperto via `MatDialog`, coerente
col pattern `purpose`/`purpose-filter-dialog`)

- [ ] **Step 8: Riscrivere `search-assets.component.html`**

`frontend/src/app/pages/assets/search-assets.component.html`:

```html
<div [formGroup]="qSearch" style="display: flex; align-items: center; gap: 0.5rem;">
  <mat-form-field style="flex: 1;" subscriptSizing="dynamic">
    <input matInput placeholder="Cerca per nome Asset, indirizzo o toponimo..." formControlName="qsearch" (keyup.enter)="onQuickSearch()">
  </mat-form-field>

  <button mat-stroked-button (click)="openFilterDialog()" style="height: 3.5rem;">
    <mat-icon>filter_list</mat-icon>
    Filtri
  </button>
</div>
```

- [ ] **Step 9: Riscrivere `assets.component.ts`**

`frontend/src/app/pages/assets/assets.component.ts`:

```typescript
import {Component, ViewChild} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {Asset} from './entity/asset.entity';
import {AssetService} from './asset.service';
import {DataTableAssetsComponent} from './data-table-assets.component';
import {SearchAssetsComponent} from './search-assets.component';
import {AbstractComponent} from '../../core/components/abstract.component';

@Component({
  selector: 'app-assets',
  standalone: true,
  imports: [DataTableAssetsComponent, SearchAssetsComponent],
  templateUrl: './assets.component.html'
})
export class AssetsComponent extends AbstractComponent<Asset> {

  @ViewChild('dataTable') dataTable!: DataTableAssetsComponent;

  private selectedId?: number | null;

  constructor(
    protected override service: AssetService,
    private route: ActivatedRoute
  ) {
    super();
  }

  protected override getEntityIdentifier(entity: Asset): string {
    return entity.asset_name ?? '';
  }

  protected override entityLabel(): string {
    return 'Immobile';
  }

  override ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.selectedId = params['selectedId'] ? Number(params['selectedId']) : null;
      this.loadAll();
    });
  }

  override loadAll() {
    this.loading = true;
    this.service.search({}).subscribe((result: Asset[]) => {
      this.list = this.service.fromPlain(result);
      this.allItems = [...this.list];

      if (this.selectedId) {
        const asset = this.list.find(a => a.id === this.selectedId);
        if (asset) setTimeout(() => this.dataTable?.openEditDialog(asset));
      }
      this.loading = false;
    });
  }
}
```

(rimossi `creationResult`/override di `onCreate`: `AbstractComponent.onCreate()` di base già
mostra il toast `"Immobile creato"` usando `entityLabel()`, ora overridato)

- [ ] **Step 10: Riscrivere `assets.component.html`**

`frontend/src/app/pages/assets/assets.component.html`:

```html
<div style="padding: 1rem;">
  <div>
    <h1>Gestione Immobili</h1>
    <p style="color: #6A7282;">Gestisci le anagrafiche degli immobili comunali</p>
  </div>

  <div style="margin-top: 1rem;">
    <app-search-assets (search)="onSearch($event)"></app-search-assets>
  </div>

  <div style="margin-top: 1.5rem;">
    <app-data-table-assets
      #dataTable
      [data]="list"
      [loading]="loading"
      (onSave)="onSave($event)"
      (onDelete)="onDelete($event)"
      (onCreate)="onCreate($event)"
      (onRestore)="onRestore($event)"
      [resetPagingTrigger]="resetPagingCount"
    ></app-data-table-assets>
  </div>
</div>
```

- [ ] **Step 11: Verificare la compilazione dei file di `assets`**

```bash
docker exec utenzepa-frontend-1 npx tsc --noEmit -p tsconfig.app.json
```

Expected: nessun errore nuovo sotto `src/app/pages/assets/`. Errori nelle pagine non ancora
migrate (`invoices` — fino al Task 2 — e le altre 13) restano attesi.

- [ ] **Step 12: Commit**

```bash
git add frontend/src/app/pages/assets/
git commit -m "refactor(frontend): migra pagina assets (immobili) a Angular Material"
```

---

### Task 2: Migrare `invoices`

**Files:**
- Modify: `frontend/src/app/pages/invoices/entity/invoice.entity.ts`
- Modify: `frontend/src/app/pages/invoices/entity/invoice.interface.ts`
- Create: `frontend/src/app/pages/invoices/invoice-edit-dialog.component.ts`
- Create: `frontend/src/app/pages/invoices/invoice-edit-dialog.component.html`
- Create: `frontend/src/app/pages/invoices/invoice-filter-dialog.component.ts`
- Modify: `frontend/src/app/pages/invoices/data-table-invoices.component.ts`
- Modify: `frontend/src/app/pages/invoices/data-table-invoices.component.html`
- Modify: `frontend/src/app/pages/invoices/search-invoices.component.ts`
- Modify: `frontend/src/app/pages/invoices/search-invoices.component.html`
- Modify: `frontend/src/app/pages/invoices/invoices.component.ts`
- Modify: `frontend/src/app/pages/invoices/invoices.component.html`
- Delete: `frontend/src/app/pages/invoices/search-invoices.component.css`

**Interfaces:**
- Consumes: `AbstractDataTableComponent<Invoice>`, `AbstractSearchComponent`,
  `EditDialogData<Invoice>`, `FilterDialogData<V>`, `Invoice.create()`, `UtilityService.search()`,
  `SuppliersService.search()`, `BudgetChaptersService.search()`, `ExportHelper.formatDate()`/
  `.boolData()`, `TruncatePipe`, `FormatAmountPipe`.
- Produces: `InvoiceEditDialogComponent` (registrata da
  `DataTableInvoicesComponent.editDialogComponent()`), `InvoiceFilterDialogComponent`
  (registrata da `SearchInvoicesComponent.filterDialogComponent()`), `Invoice.is_paid?: boolean`
  (nuovo campo, sola lettura).

- [ ] **Step 1: Aggiornare `invoice.interface.ts`**

`frontend/src/app/pages/invoices/entity/invoice.interface.ts` — aggiungere `is_paid`:

```typescript
import {IUtility} from '../../utilities/entity/utility.interface';
import {IBudgetChapter} from '../../budget-chapters/entity/budget-chapter.interface';
import {ISupplier} from '../../suppliers/entity/supplier.interface';

export interface IInvoice {
  id: number;
  invoice_id: string;
  invoice_date: Date | null;
  protocol_number: string | null;
  net_amount_excl_vat: number;
  last_invoice_arrears?: number | null;
  notes_on_invoices?: string | null;
  utility_id_fk: number;
  supplier_id_fk?: number | null;
  create_date: Date | null;
  update_date: Date | null;
  created_by_user_id: number;
  updated_by_user_id: number;
  deleted: boolean;
  utility?: IUtility | null;
  supplier?: ISupplier | null;
  budget_chapters?: IBudgetChapter[];
  is_paid?: boolean;
}
```

- [ ] **Step 2: Aggiornare `invoice.entity.ts`**

`frontend/src/app/pages/invoices/entity/invoice.entity.ts` — aggiungere `is_paid` (escluso in
scrittura, è calcolato dal backend) e rimuovere i due `@Transform` di debug con `console.log`:

```typescript
import {Exclude, plainToInstance, Type} from 'class-transformer';
import {AbstractEntity} from '../../../core/entities/abstract.entity';
import {IInvoice} from './invoice.interface';
import {Utility} from '../../utilities/entity/utility.entity';
import {Supplier} from '../../suppliers/entity/supplier.entity';
import {BudgetChapter} from '../../budget-chapters/entity/budget-chapter.entity';

export class Invoice extends AbstractEntity implements IInvoice {
  invoice_id!: string;
  protocol_number!: string;

  @Type(() => Number)
  net_amount_excl_vat!: number;

  @Type(() => Number)
  last_invoice_arrears?: number;

  notes_on_invoices?: string;
  utility_id_fk!: number;
  supplier_id_fk?: number;

  @Type(() => Date)
  invoice_date!: Date;

  @Exclude({toPlainOnly: true})
  @Type(() => Utility)
  utility?: Utility;

  @Exclude({toPlainOnly: true})
  @Type(() => Supplier)
  supplier?: Supplier;

  @Type(() => BudgetChapter)
  budget_chapters?: BudgetChapter[];

  @Exclude({toPlainOnly: true})
  is_paid?: boolean;

  static create(data?: Partial<Invoice>): Invoice {
    return plainToInstance(Invoice, {
      invoice_id: '',
      protocol_number: null,
      net_amount_excl_vat: 0,
      invoice_date: null,
      utility_id_fk: null,
      supplier_id_fk: null,
      deleted: false,
      ...data
    });
  }
}
```

Nota: rimosso anche il `@Transform` originale su `invoice_date` (convertiva `Date` in
`toISOString()` in scrittura) e quello su `budget_chapters` (mappava l'array di oggetti in array
di ID in scrittura) — quest'ultimo comportamento resta necessario, ma viene ora gestito
esplicitamente in `InvoiceEditDialogComponent.save()` (Step 4), che costruisce il payload finale
con `budget_chapters` già filtrato/valorizzato prima di chiamare `plainToInstance`; l'assenza del
`@Transform` su `invoice_date` non cambia il comportamento perché `AbstractService.parseCreate`/
`parseUpdate` chiamano `instanceToPlain` che serializza comunque un `Date` nativo in ISO string
per `JSON.stringify` lato `HttpClient` — verificare in Step 11 che il payload di rete sia
invariato (stringa ISO) prima di considerare il task concluso.

- [ ] **Step 3: Creare `InvoiceEditDialogComponent` (TypeScript)**

`frontend/src/app/pages/invoices/invoice-edit-dialog.component.ts`:

```typescript
import {Component, inject, OnInit} from '@angular/core';
import {FormBuilder, FormControl, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatAutocompleteModule} from '@angular/material/autocomplete';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatNativeDateModule} from '@angular/material/core';
import {MatButtonModule} from '@angular/material/button';
import {plainToInstance} from 'class-transformer';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {Invoice} from './entity/invoice.entity';
import {AuthService} from '../../services/auth.service';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';
import {UtilityService} from '../utilities/utility.service';
import {SuppliersService} from '../suppliers/suppliers.service';
import {BudgetChaptersService} from '../budget-chapters/budget-chapters.service';
import {Utility} from '../utilities/entity/utility.entity';
import {Supplier} from '../suppliers/entity/supplier.entity';
import {BudgetChapter} from '../budget-chapters/entity/budget-chapter.entity';

@Component({
  selector: 'app-invoice-edit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatAutocompleteModule, MatDatepickerModule, MatNativeDateModule, MatButtonModule,
    HasRoleDirective, ReadOnlyDirective
  ],
  templateUrl: './invoice-edit-dialog.component.html'
})
export class InvoiceEditDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<InvoiceEditDialogComponent, Invoice | undefined>);
  private authService = inject(AuthService);
  private utilityService = inject(UtilityService);
  private suppliersService = inject(SuppliersService);
  private budgetChapterService = inject(BudgetChaptersService);
  protected data = inject<EditDialogData<Invoice>>(MAT_DIALOG_DATA);

  isNew = this.data.mode === 'create';

  utilityOptions: Utility[] = [];
  filteredUtilityOptions: Utility[] = [];
  utilityFilterCtrl = new FormControl<string>('');

  supplierOptions: Supplier[] = [];
  filteredSupplierOptions: Supplier[] = [];
  supplierFilterCtrl = new FormControl<string>('');

  budgetChapterOptions: BudgetChapter[] = [];

  form = this.fb.group({
    invoice_id: [this.data.item.invoice_id ?? '', Validators.required],
    protocol_number: [this.data.item.protocol_number ?? '', Validators.required],
    invoice_date: [this.data.item.invoice_date ? new Date(this.data.item.invoice_date) : null, Validators.required],
    net_amount_excl_vat: [this.data.item.net_amount_excl_vat ?? null, Validators.required],
    last_invoice_arrears: [this.data.item.last_invoice_arrears ?? 0, Validators.required],
    utility_id_fk: [this.data.item.utility_id_fk ?? null, Validators.required],
    supplier_id_fk: [this.data.item.supplier != null ? (this.data.item.supplier_id_fk ?? null) : null],
    notes_on_invoices: [this.data.item.notes_on_invoices ?? ''],
    budget_chapter_ids: [(this.data.item.budget_chapters ?? []).map(bc => bc.id)],
  });

  constructor() {
    const role = this.authService.getCurrentUser()?.role;
    if (!role || role === 'Lettore') {
      this.form.disable();
    }
  }

  ngOnInit(): void {
    this.utilityService.search().subscribe({
      next: data => {
        this.utilityOptions = data.sort((a, b) => (a.utility_id ?? '').localeCompare(b.utility_id ?? ''));
        this.filteredUtilityOptions = this.utilityOptions;
        this.utilityFilterCtrl.setValue(this.displayUtility(this.form.value.utility_id_fk ?? null), {emitEvent: false});
      },
      error: err => console.error('Errore nel caricamento delle Utenze:', err)
    });
    this.suppliersService.search({deleted: false}).subscribe({
      next: data => {
        this.supplierOptions = data.sort((a, b) => (a.supplier_id ?? '').localeCompare(b.supplier_id ?? ''));
        this.filteredSupplierOptions = this.supplierOptions;
        this.supplierFilterCtrl.setValue(this.displaySupplier(this.form.value.supplier_id_fk ?? null), {emitEvent: false});
      },
      error: err => console.error('Errore nel caricamento dei fornitori:', err)
    });
    this.budgetChapterService.search({deleted: false}).subscribe({
      next: data => this.budgetChapterOptions = data.sort((a, b) => (a.chapter_code ?? '').localeCompare(b.chapter_code ?? '')),
      error: err => console.error('Errore nel caricamento dei Capitoli di Spesa:', err)
    });

    this.utilityFilterCtrl.valueChanges.subscribe(term => {
      const t = (typeof term === 'string' ? term : '').toLowerCase();
      this.filteredUtilityOptions = this.utilityOptions.filter(u => (u.utility_id ?? '').toLowerCase().includes(t));
    });
    this.supplierFilterCtrl.valueChanges.subscribe(term => {
      const t = (typeof term === 'string' ? term : '').toLowerCase();
      this.filteredSupplierOptions = this.supplierOptions.filter(s => (s.supplier_id ?? '').toLowerCase().includes(t));
    });
  }

  displayUtility = (id: number | null): string =>
    this.utilityOptions.find(u => u.id === id)?.utility_id ?? '';

  displaySupplier = (id: number | null): string =>
    this.supplierOptions.find(s => s.id === id)?.supplier_id ?? '';

  onUtilitySelected(id: number): void {
    this.form.patchValue({utility_id_fk: id});
  }

  onSupplierSelected(id: number): void {
    this.form.patchValue({supplier_id_fk: id});
  }

  // Normalizza stringhe numeriche in formato italiano (es. "1.234,56") in number.
  // Preservato da InvoicesComponent.cleanAndConvertNumericFields (codice PrimeNG originale) —
  // difensivo: i campi ora sono input HTML nativi type="number" (restituiscono sempre un
  // number in getRawValue(), mai una stringa con virgola), ma la conversione resta a protezione
  // di eventuali valori stringa iniettati programmaticamente.
  private cleanAndConvertNumericFields(raw: Record<string, any>): void {
    ['net_amount_excl_vat', 'last_invoice_arrears'].forEach(field => {
      const value = raw[field];
      if (value === null || value === undefined || value === '') {
        raw[field] = null;
        return;
      }
      if (typeof value === 'string') {
        const cleaned = parseFloat(value.replace(/\./g, '').replace(/,/g, '.'));
        raw[field] = isNaN(cleaned) ? null : cleaned;
      }
    });
  }

  save(): void {
    if (!this.form.valid) return;
    const raw = this.form.getRawValue();
    this.cleanAndConvertNumericFields(raw);
    const {budget_chapter_ids, ...rest} = raw;
    const budgetChapters = (budget_chapter_ids ?? [])
      .map((id: number) => this.budgetChapterOptions.find(bc => bc.id === id))
      .filter((bc: BudgetChapter | undefined): bc is BudgetChapter => bc != null);
    const result = plainToInstance(Invoice, {
      id: this.data.item.id,
      ...rest,
      budget_chapters: budgetChapters,
    });
    this.dialogRef.close(result);
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}
```

- [ ] **Step 4: Creare il template `InvoiceEditDialogComponent`**

`frontend/src/app/pages/invoices/invoice-edit-dialog.component.html`:

```html
<h2 mat-dialog-title>
  {{ isNew ? 'Aggiungi Fattura' : 'Modifica Fattura: ' + data.item.invoice_id }}
</h2>

<mat-dialog-content>
  <form [formGroup]="form" [readOnly]="['Lettore']" style="display: flex; flex-wrap: wrap; gap: 1rem;">

    <mat-form-field style="flex: 1 1 calc(50% - 0.5rem);">
      <mat-label>ID Fattura *</mat-label>
      <input matInput formControlName="invoice_id">
      @if (form.controls.invoice_id.invalid && form.controls.invoice_id.touched) {
        <mat-error>Obbligatorio</mat-error>
      }
    </mat-form-field>

    <mat-form-field style="flex: 1 1 calc(50% - 0.5rem);">
      <mat-label>Numero Protocollo *</mat-label>
      <input matInput formControlName="protocol_number">
      @if (form.controls.protocol_number.invalid && form.controls.protocol_number.touched) {
        <mat-error>Obbligatorio</mat-error>
      }
    </mat-form-field>

    <mat-form-field style="flex: 1 1 calc(50% - 0.5rem);">
      <mat-label>Data Fattura *</mat-label>
      <input matInput [matDatepicker]="invoiceDatePicker" formControlName="invoice_date">
      <mat-datepicker-toggle matIconSuffix [for]="invoiceDatePicker"></mat-datepicker-toggle>
      <mat-datepicker #invoiceDatePicker></mat-datepicker>
      @if (form.controls.invoice_date.invalid && form.controls.invoice_date.touched) {
        <mat-error>Obbligatorio</mat-error>
      }
    </mat-form-field>

    <mat-form-field style="flex: 1 1 calc(50% - 0.5rem);">
      <mat-label>Importo Netto (IVA Esclusa) * (€)</mat-label>
      <input matInput type="number" step="0.01" formControlName="net_amount_excl_vat">
      @if (form.controls.net_amount_excl_vat.invalid && form.controls.net_amount_excl_vat.touched) {
        <mat-error>Obbligatorio</mat-error>
      }
    </mat-form-field>

    <mat-form-field style="flex: 1 1 calc(50% - 0.5rem);">
      <mat-label>Utenza Associata *</mat-label>
      <input matInput [formControl]="utilityFilterCtrl" [matAutocomplete]="autoUtility" placeholder="Cerca...">
      <mat-autocomplete #autoUtility="matAutocomplete" [displayWith]="displayUtility">
        @for (opt of filteredUtilityOptions; track opt.id) {
          <mat-option [value]="opt.id" (onSelectionChange)="onUtilitySelected(opt.id)">{{ opt.utility_id }}</mat-option>
        }
      </mat-autocomplete>
      @if (form.controls.utility_id_fk.invalid && form.controls.utility_id_fk.touched) {
        <mat-error>Obbligatorio</mat-error>
      }
    </mat-form-field>

    <mat-form-field style="flex: 1 1 calc(50% - 0.5rem);">
      <mat-label>Fornitore</mat-label>
      <input matInput [formControl]="supplierFilterCtrl" [matAutocomplete]="autoSupplier" placeholder="Cerca...">
      <mat-autocomplete #autoSupplier="matAutocomplete" [displayWith]="displaySupplier">
        @for (opt of filteredSupplierOptions; track opt.id) {
          <mat-option [value]="opt.id" (onSelectionChange)="onSupplierSelected(opt.id)">{{ opt.supplier_id }}</mat-option>
        }
      </mat-autocomplete>
    </mat-form-field>

    <mat-form-field style="flex: 1 1 calc(50% - 0.5rem);">
      <mat-label>Capitoli di Spesa Associati</mat-label>
      <mat-select formControlName="budget_chapter_ids" multiple>
        @for (opt of budgetChapterOptions; track opt.id) {
          <mat-option [value]="opt.id">{{ opt.label }}</mat-option>
        }
      </mat-select>
    </mat-form-field>

    <mat-form-field style="flex: 1 1 calc(50% - 0.5rem);">
      <mat-label>Morosità Ultima Fattura * (€)</mat-label>
      <input matInput type="number" step="0.01" formControlName="last_invoice_arrears">
      @if (form.controls.last_invoice_arrears.invalid && form.controls.last_invoice_arrears.touched) {
        <mat-error>Obbligatorio</mat-error>
      }
    </mat-form-field>

    <mat-form-field style="flex: 1 1 100%;">
      <mat-label>Note</mat-label>
      <textarea matInput formControlName="notes_on_invoices" rows="3"></textarea>
    </mat-form-field>

  </form>
</mat-dialog-content>

<mat-dialog-actions align="end">
  <button mat-stroked-button (click)="cancel()">Annulla</button>
  <button mat-flat-button (click)="save()" [disabled]="!form.valid" [appHasRole]="['Admin','Operatore']">
    {{ isNew ? 'Crea Fattura' : 'Salva Fattura' }}
  </button>
</mat-dialog-actions>
```

- [ ] **Step 5: Creare `InvoiceFilterDialogComponent`**

`frontend/src/app/pages/invoices/invoice-filter-dialog.component.ts`:

```typescript
import {Component, inject, OnInit} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatNativeDateModule} from '@angular/material/core';
import {MatButtonModule} from '@angular/material/button';
import {FilterDialogData} from '../../core/components/abstract-search.component';
import {SuppliersService} from '../suppliers/suppliers.service';
import {BudgetChaptersService} from '../budget-chapters/budget-chapters.service';
import {UtilityService} from '../utilities/utility.service';
import {TOption} from '../../core/types/option.interface';

export interface InvoiceFilterValues {
  invoice_id: string | null;
  protocol_number: string | null;
  net_amount_excl_vat: number | null;
  last_invoice_arrears: number | null;
  utility_id_fk: number | null;
  supplier_id_fk: number | null;
  budget_chapter_ids: number[] | null;
  invoice_date_from: Date | null;
  invoice_date_to: Date | null;
  notes_on_invoices: string | null;
}

@Component({
  selector: 'app-invoice-filter-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatDatepickerModule, MatNativeDateModule, MatButtonModule
  ],
  templateUrl: './invoice-filter-dialog.component.html'
})
export class InvoiceFilterDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<InvoiceFilterDialogComponent, InvoiceFilterValues | 'clear'>);
  private suppliersService = inject(SuppliersService);
  private budgetChapterService = inject(BudgetChaptersService);
  private utilitiesService = inject(UtilityService);
  protected data = inject<FilterDialogData<InvoiceFilterValues>>(MAT_DIALOG_DATA);

  supplierOptions: TOption[] = [];
  utilityOptions: TOption[] = [];
  budgetChapterOptions: TOption[] = [];

  form = this.fb.group({
    invoice_id: [this.data.values.invoice_id ?? ''],
    protocol_number: [this.data.values.protocol_number ?? ''],
    net_amount_excl_vat: [this.data.values.net_amount_excl_vat ?? null],
    last_invoice_arrears: [this.data.values.last_invoice_arrears ?? null],
    utility_id_fk: [this.data.values.utility_id_fk ?? null],
    supplier_id_fk: [this.data.values.supplier_id_fk ?? null],
    budget_chapter_ids: [this.data.values.budget_chapter_ids ?? null],
    invoice_date_from: [this.data.values.invoice_date_from ?? null],
    invoice_date_to: [this.data.values.invoice_date_to ?? null],
    notes_on_invoices: [this.data.values.notes_on_invoices ?? ''],
  });

  ngOnInit(): void {
    this.suppliersService.search({deleted: false}).subscribe({
      next: data => this.supplierOptions = data
        .map(s => ({label: s.supplier_id, value: s.id}))
        .sort((a, b) => a.label.localeCompare(b.label))
    });
    this.utilitiesService.search({deleted: false}).subscribe({
      next: data => this.utilityOptions = data
        .map(u => ({label: `${u.utility_id} (${u.utility_code || 'N/D'})`, value: u.id}))
        .sort((a, b) => a.label.localeCompare(b.label))
    });
    this.budgetChapterService.search({deleted: false}).subscribe({
      next: data => this.budgetChapterOptions = data
        .map(b => ({label: `${b.chapter_code} - ${b.description}`, value: b.id}))
        .sort((a, b) => a.label.localeCompare(b.label))
    });
  }

  apply(): void {
    this.dialogRef.close(this.form.getRawValue() as InvoiceFilterValues);
  }

  clear(): void {
    this.dialogRef.close('clear');
  }
}
```

- [ ] **Step 6: Creare il template `InvoiceFilterDialogComponent`**

`frontend/src/app/pages/invoices/invoice-filter-dialog.component.html`:

```html
<h2 mat-dialog-title>Filtri di ricerca Fatture</h2>
<mat-dialog-content>
  <form [formGroup]="form" id="filter-form" (ngSubmit)="apply()" style="display: flex; flex-wrap: wrap; gap: 1rem;">

    <mat-form-field style="flex: 1 1 calc(33.333% - 0.66rem);">
      <mat-label>ID Fattura</mat-label>
      <input matInput formControlName="invoice_id" placeholder="ID univoco della fattura">
    </mat-form-field>

    <mat-form-field style="flex: 1 1 calc(33.333% - 0.66rem);">
      <mat-label>Numero Protocollo</mat-label>
      <input matInput formControlName="protocol_number">
    </mat-form-field>

    <mat-form-field style="flex: 1 1 calc(33.333% - 0.66rem);">
      <mat-label>Importo Netto (Escl. IVA)</mat-label>
      <input matInput type="number" step="0.01" formControlName="net_amount_excl_vat" placeholder="Ricerca per valore esatto">
    </mat-form-field>

    <mat-form-field style="flex: 1 1 calc(33.333% - 0.66rem);">
      <mat-label>Morosità Ultima Fattura</mat-label>
      <input matInput type="number" step="0.01" formControlName="last_invoice_arrears" placeholder="Ricerca per valore esatto">
    </mat-form-field>

    <mat-form-field style="flex: 1 1 calc(33.333% - 0.66rem);">
      <mat-label>Utenza Associata</mat-label>
      <mat-select formControlName="utility_id_fk">
        @for (opt of utilityOptions; track opt.value) {
          <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
        }
      </mat-select>
    </mat-form-field>

    <mat-form-field style="flex: 1 1 calc(33.333% - 0.66rem);">
      <mat-label>Fornitore</mat-label>
      <mat-select formControlName="supplier_id_fk">
        @for (opt of supplierOptions; track opt.value) {
          <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
        }
      </mat-select>
    </mat-form-field>

    <mat-form-field style="flex: 1 1 100%;">
      <mat-label>Capitoli di Spesa Associati</mat-label>
      <mat-select formControlName="budget_chapter_ids" multiple>
        @for (opt of budgetChapterOptions; track opt.value) {
          <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
        }
      </mat-select>
    </mat-form-field>

    <mat-form-field style="flex: 1 1 calc(50% - 0.5rem);">
      <mat-label>Data Fattura da</mat-label>
      <input matInput [matDatepicker]="dateFromPicker" formControlName="invoice_date_from">
      <mat-datepicker-toggle matIconSuffix [for]="dateFromPicker"></mat-datepicker-toggle>
      <mat-datepicker #dateFromPicker></mat-datepicker>
    </mat-form-field>

    <mat-form-field style="flex: 1 1 calc(50% - 0.5rem);">
      <mat-label>Data Fattura a</mat-label>
      <input matInput [matDatepicker]="dateToPicker" formControlName="invoice_date_to">
      <mat-datepicker-toggle matIconSuffix [for]="dateToPicker"></mat-datepicker-toggle>
      <mat-datepicker #dateToPicker></mat-datepicker>
    </mat-form-field>

    <mat-form-field style="flex: 1 1 100%;">
      <mat-label>Note su Fattura (Testuale)</mat-label>
      <input matInput formControlName="notes_on_invoices">
    </mat-form-field>

  </form>
</mat-dialog-content>
<mat-dialog-actions align="end">
  <button mat-stroked-button (click)="clear()">Pulisci Filtri</button>
  <button mat-flat-button type="submit" form="filter-form">Applica Filtri</button>
</mat-dialog-actions>
```

- [ ] **Step 7: Riscrivere `data-table-invoices.component.ts`**

`frontend/src/app/pages/invoices/data-table-invoices.component.ts`:

```typescript
import {Component, Type} from '@angular/core';
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
import {DatePipe} from '@angular/common';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ScreenSizeService} from '../../services/screen-size.service';
import {Invoice} from './entity/invoice.entity';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {InvoiceEditDialogComponent} from './invoice-edit-dialog.component';
import {ConfirmDialogComponent} from '../../core/components/confirm-dialog.component';
import {FormatAmountPipe} from '../../core/pipes/format-amount.pipe';
import {TruncatePipe} from '../../core/pipes/truncate.pipe';
import {ExportHelper} from '../../core/helpers/export.helper';

@Component({
  selector: 'app-data-table-invoices',
  standalone: true,
  imports: [
    MatTableModule, MatSortModule, MatPaginatorModule, MatButtonModule, MatIconModule,
    MatTooltipModule, MatProgressBarModule, MatSelectModule, MatFormFieldModule, FormsModule,
    DatePipe, HasRoleDirective, FormatAmountPipe, TruncatePipe
  ],
  templateUrl: './data-table-invoices.component.html'
})
export class DataTableInvoicesComponent extends AbstractDataTableComponent<Invoice> {

  readonly allColumns: IColumnDef[] = [
    {field: 'invoice_id', header: 'ID Fattura', minWidth: '120px'},
    {field: 'protocol_number', header: 'N. Protocollo', minWidth: '120px'},
    {field: 'invoice_date', header: 'Data Fattura', minWidth: '120px'},
    {field: 'net_amount_excl_vat', header: 'Importo Netto', minWidth: '120px'},
    {field: 'last_invoice_arrears', header: 'Morosità', minWidth: '120px'},
    {field: 'utility.utility_id', header: 'Utenza (POD/PDR)', minWidth: '200px'},
    {field: 'supplier.supplier_id', header: 'Fornitore', minWidth: '150px'},
    {field: 'budget_chapters', header: 'Capitoli Associati', minWidth: '180px'},
    {field: 'is_paid', header: 'Stato Pagamento', minWidth: '120px'},
    {field: 'notes_on_invoices', header: 'Note', minWidth: '200px'},
  ];

  private readonly defaultVisibleFields = new Set([
    'invoice_id', 'protocol_number', 'invoice_date', 'net_amount_excl_vat',
    'last_invoice_arrears', 'utility.utility_id', 'supplier.supplier_id',
    'budget_chapters', 'is_paid',
  ]);

  private static readonly STORAGE_KEY = 'columns:invoices';

  selectedColumns: IColumnDef[] = this.loadColumnSelection(
    DataTableInvoicesComponent.STORAGE_KEY, this.allColumns, this.defaultVisibleFields
  );

  maxDescLength = 50;

  get displayedColumns(): string[] {
    return ['actions', ...this.selectedColumns.map(c => c.field)];
  }

  compareColumns = (a: IColumnDef, b: IColumnDef): boolean => a?.field === b?.field;

  onColumnsChange(): void {
    this.saveColumnSelection(DataTableInvoicesComponent.STORAGE_KEY, this.selectedColumns);
  }

  constructor(screen: ScreenSizeService) {
    super(screen);
    // Custom sort fedele all'originale PrimeNG customSort(event): path annidati
    // (es. "utility.utility_id") + confronto stringhe con localeCompare('it') + fallback
    // numerico. MatTableDataSource.sortingDataAccessor restituisce un solo valore comparabile
    // per colonna e usa un ordinamento lessicografico non locale-aware: per riprodurre
    // fedelmente il comparator originale (che riceveva sia v1 sia v2) è necessario sovrascrivere
    // sortData, l'unico hook di MatTableDataSource che riceve l'intero array e può applicare un
    // Array.prototype.sort con comparator a due argomenti.
    this.dataSource.sortData = (data: Invoice[], sort: MatSort): Invoice[] => {
      const active = sort.active;
      const direction = sort.direction;
      if (!active || direction === '') return data;
      const order = direction === 'asc' ? 1 : -1;
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

  protected override exportCellValue(item: Invoice, field: string): string {
    switch (field) {
      case 'invoice_date':
        return ExportHelper.formatDate(item.invoice_date);
      case 'net_amount_excl_vat':
        return item.net_amount_excl_vat != null
          ? item.net_amount_excl_vat.toLocaleString('it-IT', {minimumFractionDigits: 2, maximumFractionDigits: 2})
          : '';
      case 'last_invoice_arrears':
        return item.last_invoice_arrears != null
          ? item.last_invoice_arrears.toLocaleString('it-IT', {minimumFractionDigits: 2, maximumFractionDigits: 2})
          : '';
      case 'budget_chapters':
        return item.budget_chapters?.map(bc => bc.label).join(', ') ?? '';
      case 'is_paid':
        return ExportHelper.boolData(item.is_paid);
      default:
        return String(this.getNestedValue(item, field) ?? '');
    }
  }

  override exportToCSV(): void {
    super.exportToCSV(this.allColumns, 'fatture');
  }

  override itemInstance(): Invoice {
    return Invoice.create();
  }

  override editDialogComponent(): Type<unknown> {
    return InvoiceEditDialogComponent;
  }

  protected override entityLabel(): string {
    return 'Fattura';
  }

  override openDeleteDialog(entity: Invoice): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Elimina Fattura',
        message: `Sei sicuro di voler eliminare la Fattura ${entity.invoice_id}?`,
        confirmLabel: 'Elimina',
        danger: true
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onDelete.emit(entity);
    });
  }

  override restoreItem(entity: Invoice): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Ripristina Fattura',
        message: `Riattiva Fattura ${entity.invoice_id}?`,
        confirmLabel: 'Ripristina'
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onRestore.emit(entity);
    });
  }
}
```

- [ ] **Step 8: Riscrivere `data-table-invoices.component.html`**

`frontend/src/app/pages/invoices/data-table-invoices.component.html`:

```html
<div style="display: flex; justify-content: space-between; align-items: center;">
  <h3>Elenco ({{ data.length }})</h3>
  <button mat-flat-button (click)="openCreateDialog()" [appHasRole]="['Admin', 'Operatore']">
    <mat-icon>add</mat-icon>
    Aggiungi Fattura
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

<table mat-table [dataSource]="dataSource" matSort matSortActive="invoice_id" matSortDirection="asc" #sort="matSort" class="mat-elevation-z1">

  <ng-container matColumnDef="actions">
    <th mat-header-cell *matHeaderCellDef>Azioni</th>
    <td mat-cell *matCellDef="let item">
      @if (!item.deleted) {
        <button mat-icon-button (click)="openEditDialog(item)" [appHasRole]="['Admin', 'Operatore', 'Lettore']"
                matTooltip="Modifica">
          <mat-icon>edit</mat-icon>
        </button>
      }
      <button mat-icon-button
              [class.mat-action-success]="item.deleted"
              [class.mat-action-danger]="!item.deleted"
              (click)="item.deleted ? restoreItem(item) : openDeleteDialog(item)"
              [appHasRole]="['Admin', 'Operatore']"
              [matTooltip]="item.deleted ? 'Ripristina' : 'Elimina'">
        <mat-icon>{{ item.deleted ? 'restore' : 'delete' }}</mat-icon>
      </button>
    </td>
  </ng-container>

  <ng-container matColumnDef="invoice_id">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>ID Fattura</th>
    <td mat-cell *matCellDef="let item">{{ item.invoice_id }}</td>
  </ng-container>

  <ng-container matColumnDef="protocol_number">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>N. Protocollo</th>
    <td mat-cell *matCellDef="let item">{{ item.protocol_number }}</td>
  </ng-container>

  <ng-container matColumnDef="invoice_date">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Data Fattura</th>
    <td mat-cell *matCellDef="let item">{{ item.invoice_date | date: 'dd/MM/yyyy' }}</td>
  </ng-container>

  <ng-container matColumnDef="net_amount_excl_vat">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Importo Netto</th>
    <td mat-cell *matCellDef="let item">{{ item.net_amount_excl_vat | formatAmount }}</td>
  </ng-container>

  <ng-container matColumnDef="last_invoice_arrears">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Morosità</th>
    <td mat-cell *matCellDef="let item">{{ item.last_invoice_arrears | formatAmount }}</td>
  </ng-container>

  <ng-container matColumnDef="utility.utility_id">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Utenza (POD/PDR)</th>
    <td mat-cell *matCellDef="let item">{{ item.utility?.utility_id || 'N/D' }}</td>
  </ng-container>

  <ng-container matColumnDef="supplier.supplier_id">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Fornitore</th>
    <td mat-cell *matCellDef="let item">{{ item.supplier?.supplier_id || 'N/D' }}</td>
  </ng-container>

  <ng-container matColumnDef="budget_chapters">
    <th mat-header-cell *matHeaderCellDef>Capitoli Associati</th>
    <td mat-cell *matCellDef="let item">
      @for (bc of item.budget_chapters; track bc.id) {
        <div>{{ bc.label | truncate: 40 }}</div>
      }
    </td>
  </ng-container>

  <ng-container matColumnDef="is_paid">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Stato Pagamento</th>
    <td mat-cell *matCellDef="let item" style="text-align: center;">
      @if (item.is_paid === true) {
        <mat-icon style="color: #00c10d;">check_circle</mat-icon>
      } @else if (item.is_paid === false) {
        <mat-icon style="color: #f59e0b;">warning</mat-icon>
      } @else {
        N/D
      }
    </td>
  </ng-container>

  <ng-container matColumnDef="notes_on_invoices">
    <th mat-header-cell *matHeaderCellDef>Note</th>
    <td mat-cell *matCellDef="let item">
      @if (item.notes_on_invoices) {
        <span [matTooltip]="item.notes_on_invoices">{{ item.notes_on_invoices | truncate: maxDescLength }}</span>
      }
    </td>
  </ng-container>

  <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
  <tr mat-row *matRowDef="let row; columns: displayedColumns;" [class.row-deleted]="row.deleted"></tr>

  <tr class="mat-row" *matNoDataRow>
    <td class="mat-cell" [attr.colspan]="displayedColumns.length">Nessuna fattura trovata.</td>
  </tr>
</table>

<mat-paginator #paginator [pageSizeOptions]="rowsPerPageOptions" [pageSize]="10"></mat-paginator>

<style>
  .row-deleted {
    background-color: #fcebeb;
    opacity: 0.7;
    text-decoration: line-through;
  }
</style>
```

Nota: `matSortActive="invoice_id" matSortDirection="asc"` non è nel codice originale (che non
impostava un sort iniziale) — aggiunto solo perché `dataSource.sortData` (Step 7) richiede
`sort.active` valorizzato per applicare il comparator: senza un sort iniziale la tabella
resterebbe nell'ordine di arrivo dal backend fino al primo click su un header, comportamento
identico all'originale (`sortData` con `active` vuoto ritorna `data` invariato) — questo
attributo è quindi opzionale, mantenuto solo se si vuole un ordinamento iniziale deterministico;
se il comportamento originale "nessun sort finché l'utente non clicca" va preservato
esattamente, rimuovere `matSortActive`/`matSortDirection` da questo `<table>`.

- [ ] **Step 9: Riscrivere `search-invoices.component.ts`**

`frontend/src/app/pages/invoices/search-invoices.component.ts`:

```typescript
import {Component, Type} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {AbstractSearchComponent} from '../../core/components/abstract-search.component';
import {InvoiceFilterDialogComponent} from './invoice-filter-dialog.component';

@Component({
  selector: 'app-search-invoices',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule],
  templateUrl: './search-invoices.component.html',
})
export class SearchInvoicesComponent extends AbstractSearchComponent {

  constructor(private fb: FormBuilder) {
    super();
    this.qSearch = this.fb.group({
      qsearch: [''],
      invoice_id: [''],
      protocol_number: [''],
      net_amount_excl_vat: [null],
      last_invoice_arrears: [null],
      utility_id_fk: [null],
      supplier_id_fk: [null],
      budget_chapter_ids: [null],
      invoice_date_from: [null],
      invoice_date_to: [null],
      notes_on_invoices: [''],
    });
  }

  override filterDialogComponent(): Type<unknown> {
    return InvoiceFilterDialogComponent;
  }

  override filterDialogWidth(): string {
    return '1000px';
  }
}
```

(rimossi `deleted`/`create_date_range`: `deleted` non era mai esposto nel form del filtro
originale — mai renderizzato nel template — e `create_date_range` era un dead field come
documentato nei Global Constraints, punto 6; caricamento opzioni fornitori/utenze/capitoli
spostato in `InvoiceFilterDialogComponent`, coerente col pattern `assets`)

- [ ] **Step 10: Riscrivere `search-invoices.component.html`**

`frontend/src/app/pages/invoices/search-invoices.component.html`:

```html
<div [formGroup]="qSearch" style="display: flex; align-items: center; gap: 0.5rem;">
  <mat-form-field style="flex: 1;" subscriptSizing="dynamic">
    <input matInput placeholder="Cerca per testo libero (ID Fattura, Protocollo, Note...)" formControlName="qsearch" (keyup.enter)="onQuickSearch()">
  </mat-form-field>

  <button mat-stroked-button (click)="openFilterDialog()" style="height: 3.5rem;">
    <mat-icon>filter_list</mat-icon>
    Filtri
  </button>
</div>
```

- [ ] **Step 11: Eliminare `search-invoices.component.css`**

```bash
git rm frontend/src/app/pages/invoices/search-invoices.component.css
```

- [ ] **Step 12: Riscrivere `invoices.component.ts`**

`frontend/src/app/pages/invoices/invoices.component.ts`:

```typescript
import {Component} from '@angular/core';
import {InvoicesService} from './invoices.service';
import {DataTableInvoicesComponent} from './data-table-invoices.component';
import {SearchInvoicesComponent} from './search-invoices.component';
import {AbstractComponent} from '../../core/components/abstract.component';
import {Invoice} from './entity/invoice.entity';

@Component({
  selector: 'app-invoices',
  standalone: true,
  imports: [DataTableInvoicesComponent, SearchInvoicesComponent],
  templateUrl: './invoices.component.html'
})
export class InvoicesComponent extends AbstractComponent<Invoice> {

  constructor(protected override service: InvoicesService) {
    super();
  }

  protected override getEntityIdentifier(entity: Invoice): string {
    return entity.invoice_id;
  }

  protected override entityLabel(): string {
    return 'Fattura';
  }
}
```

(rimosso l'override di `onSearch()`: la normalizzazione decimale e la seconda rimozione dei
valori vuoti erano dead code — vedi Global Constraints, punto 7 — e `filters.hasOwnProperty
('text')` non corrispondeva a nessun campo del form; `onSearch(filters)` di base gestisce sia la
quick search generica sia l'inoltro dei filtri completi a `service.search()`, sufficiente per
`invoice_date_from`/`invoice_date_to` che arrivano come stringa ISO — già gestiti da
`AbstractSearchComponent.parseSearchForm()` prima dell'emit; rimossi `creationResult`/override
di `onCreate`/`onSave` per lo stesso motivo di `assets` — `cleanAndConvertNumericFields` è ora
in `InvoiceEditDialogComponent.save()`, Step 3)

- [ ] **Step 13: Riscrivere `invoices.component.html`**

`frontend/src/app/pages/invoices/invoices.component.html`:

```html
<div style="padding: 1rem;">
  <div>
    <h1>Gestione Fatture</h1>
    <p style="color: #6A7282;">Gestisci le anagrafiche e i dettagli delle fatture.</p>
  </div>

  <div style="margin-top: 1rem;">
    <app-search-invoices (search)="onSearch($event)"></app-search-invoices>
  </div>

  <div style="margin-top: 1.5rem;">
    <app-data-table-invoices
      [data]="list"
      [loading]="loading"
      (onSave)="onSave($event)"
      (onDelete)="onDelete($event)"
      (onCreate)="onCreate($event)"
      (onRestore)="onRestore($event)"
      [resetPagingTrigger]="resetPagingCount"
    ></app-data-table-invoices>
  </div>
</div>
```

- [ ] **Step 14: Verificare la compilazione dei file di `invoices`**

```bash
docker exec utenzepa-frontend-1 npx tsc --noEmit -p tsconfig.app.json
```

Expected: nessun errore nuovo sotto `src/app/pages/invoices/`. Verificare in particolare che
`Invoice.is_paid` (Step 1-2) non generi errori nei punti che lo consumano (`data-table-invoices`
Step 7-8) e che `InvoiceEditDialogComponent.save()` (Step 3) componga correttamente
`budget_chapters: BudgetChapter[]` (non più `number[]`, coerente con la rimozione del vecchio
`@Transform` toPlainOnly sull'entity).

- [ ] **Step 15: Commit**

```bash
git add frontend/src/app/pages/invoices/
git commit -m "refactor(frontend): migra pagina invoices (fatture) a Angular Material"
```

---

### Task 3: QA manuale `assets` + `invoices`

**Files:**
- Temporarily modify (poi ripristinare): `frontend/src/app/app.routes.ts`

- [ ] **Step 1: Verificare lo stato di build atteso**

```bash
docker exec utenzepa-frontend-1 npm run build
```

Expected: `assets`/`invoices` non generano più errori; le altre 13 pagine non ancora migrate
(`consip-agreement`, `costs-borne-by`, `maintenance-managers`, `suppliers`, `system-users`,
`utilities`, `utility-aggregator`, `utility-types`, `utilizer-grant`, `budget-chapters`,
`asset-aggregator`, ecc.) restano rosse — atteso, coerente con la nota di chiusura del piano
Fase 1 (non risolto finché tutte le pagine non sono migrate).

- [ ] **Step 2: Stub temporaneo delle rotte non ancora migrate**

Per avviare `ng serve` e verificare `assets`/`invoices` a schermo, il dev server compila
comunque l'intero programma: le pagine non ancora migrate bloccherebbero l'avvio. Commentare
temporaneamente in `frontend/src/app/app.routes.ts` gli import e le entry di route delle pagine
non ancora migrate, lasciando attive solo `dashboard`, `login`, `setup`, `purpose`, `utilizer`,
`building` (assets), `invoices`:

```typescript
import {Routes} from "@angular/router";
import {MainLayoutComponent} from "./layout/main-layout.component";
import {LoginComponent} from "./pages/login/login.component";
import {AuthGuard} from "./guards/auth.guard";
import {AssetsComponent} from "./pages/assets/assets.component";
import {InvoicesComponent} from "./pages/invoices/invoices.component";
import {DashboardComponent} from "./pages/dashboard/dashboard.component";
import {PurposeComponent} from './pages/purpose/purpose.component';
import {UtilizerComponent} from './pages/utilizer/utilizer.component';
import {SetupComponent} from "./pages/setup/setup.component";
import {SetupGuard} from "./guards/setup.guard";
import {RedirectToSetupGuard} from "./guards/redirect-to-setup.guard";

export const routes: Routes = [
  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [AuthGuard],
    canActivateChild: [AuthGuard],
    children: [
      {path: '', redirectTo: 'dashboard', pathMatch: 'full'},
      {path: 'building', component: AssetsComponent},
      {path: 'invoices', component: InvoicesComponent},
      {path: 'purpose', component: PurposeComponent},
      {path: 'utilizer', component: UtilizerComponent},
      {path: 'dashboard', component: DashboardComponent},
    ]
  },
  {path: 'setup', component: SetupComponent, canActivate: [SetupGuard]},
  {path: 'login', component: LoginComponent, canActivate: [RedirectToSetupGuard]},
  {path: '**', redirectTo: '', pathMatch: 'full'}
];
```

Questo file NON va committato in questo stato — è uno stub solo per la verifica manuale, vedi
Step 5.

- [ ] **Step 3: Avviare l'app in dev**

```bash
docker compose up -d
```

Frontend su http://localhost:4300 (porta effettiva da verificare in `.env`, vedi CLAUDE.md).

- [ ] **Step 4: Eseguire la checklist manuale**

Pagina `assets` (`/building`):
- [ ] La lista carica ed elenca gli immobili esistenti, colonna "Utenze" mostra le icone/conteggi corretti per riga
- [ ] Selettore "Colonne visibili" mostra tutte le 21 colonne, aggiungerne/rimuoverne aggiorna la tabella e persiste dopo un refresh (localStorage `columns:assets`)
- [ ] "Esporta CSV" scarica un file con tutte le 21 colonne indipendentemente dalla selezione visibile
- [ ] Ricerca rapida filtra per nome Asset/indirizzo/toponimo; dialog filtri si apre, applica un filtro (es. Comune), "Pulisci Filtri" resetta
- [ ] "Aggiungi Immobile" apre il dialog di creazione, validazione required su Codice/Tipo immobile, salvataggio crea la riga e mostra lo snackbar "Immobile creato"
- [ ] Modifica riga esistente apre il dialog precompilato; per un immobile con utilizzatori/utenze associate, sezione "Utilizzatori" e tab "Utenze" (Acqua/Luce/Gas/Internet) mostrano i dati corretti con conteggio nel titolo tab; "Apri dettaglio utenza" apre `/utilities?selectedId=...` in una nuova scheda
- [ ] Bottone Modifica nascosto su riga eliminata
- [ ] Elimina riga apre `ConfirmDialogComponent` con testo "Elimina Immobile"/"Sei sicuro di voler eliminare l'Immobile {{nome}}?", conferma elimina (riga marcata `row-deleted`)
- [ ] Ripristina riga eliminata apre `ConfirmDialogComponent` con testo "Ripristina Immobile"/"Riattiva Immobile {{nome}}?" (non più "Ripristina Asset")
- [ ] Sort per colonna funziona su tutte le colonne visibili, incluse quelle annidate (Tipo immobile)
- [ ] Deep-link `/building?selectedId=<id>` apre automaticamente il dialog di modifica di quell'immobile al caricamento pagina
- [ ] Gate ruolo Lettore: con un utente `Lettore`, form disabilitato, bottone Salva nascosto

Pagina `invoices` (`/invoices`):
- [ ] La lista carica ed elenca le fatture esistenti
- [ ] Selettore "Colonne visibili" (10 colonne) e "Esporta CSV" (tutte e 10, con formattazione data/importi/capitoli/stato pagamento) funzionano
- [ ] Sort per colonna funziona, incluse le colonne annidate (Utenza, Fornitore) — verificare che l'ordinamento sia alfabetico italiano (es. accenti/maiuscole coerenti con `localeCompare('it')`)
- [ ] Ricerca rapida filtra per ID Fattura/Protocollo/Note; dialog filtri si apre, il filtro "Data Fattura da/a" applica correttamente un intervallo, "Pulisci Filtri" resetta
- [ ] "Aggiungi Fattura" apre il dialog, validazione required su ID/Protocollo/Data/Importo Netto/Morosità/Utenza; i select "Utenza Associata"/"Fornitore" filtrano digitando; "Capitoli di Spesa Associati" è multiselezione; salvataggio crea la riga e mostra lo snackbar "Fattura creato"
- [ ] Modifica riga esistente apre il dialog precompilato coi valori corretti (inclusi i capitoli di spesa già associati)
- [ ] Bottone Modifica nascosto su riga eliminata
- [ ] Elimina riga apre `ConfirmDialogComponent` con testo "Elimina Fattura"/"Sei sicuro di voler eliminare la Fattura {{id}}?"
- [ ] Ripristina riga eliminata apre `ConfirmDialogComponent` con testo "Ripristina Fattura"/"Riattiva Fattura {{id}}?"
- [ ] Gate ruolo Lettore: con un utente `Lettore`, form disabilitato, bottone Salva nascosto

- [ ] **Step 5: Ripristinare `app.routes.ts`**

```bash
git checkout -- frontend/src/app/app.routes.ts
```

Verificare che il file torni esattamente alla versione con tutte le 17 route originali:

```bash
git diff frontend/src/app/app.routes.ts
```

Expected: nessuna differenza (output vuoto).

- [ ] **Step 6: Annotare eventuali problemi trovati e correggerli prima di procedere**

Non considerare il Gruppo D concluso finché la checklist dello Step 4 non è interamente verde.
Eventuali fix vanno committati come commit aggiuntivi sui file dei Task 1/2 (non richiedono un
nuovo task in questo piano).

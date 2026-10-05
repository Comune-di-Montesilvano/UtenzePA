# Creazione dalle schede: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** da ogni scheda si crea al volo l'elemento da collegare (pulsante "+" accanto alle select, "Nuovo …" nelle tabelle collegate), senza uscire dalla scheda.

**Architecture:** `EntityNavigatorService` ottiene un metodo `create…` per ogni entità (apre scheda/dialog in pila, salva, restituisce il record). `app-filterable-select` e `app-multi-select` ottengono `createLabel` + `(create)`: pulsante "+" a destra e opzione "Crea «testo»" a ricerca vuota. Ogni scheda, al ritorno, ricarica la sorgente delle opzioni e imposta il valore (la select sincronizza l'etichetta quando arrivano le opzioni).

**Tech Stack:** Angular 22 standalone + Angular Material 22, RxJS. Solo frontend, nessuna modifica backend.

**Spec:** `docs/superpowers/specs/2026-10-05-crud-dalle-schede-design.md`

## Global Constraints

- Niente dati personali reali in codice, test, commit (solo nomi fittizi tipo "Ditta Prova").
- Tutti i componenti: `changeDetection: ChangeDetectionStrategy.Eager`.
- Permessi: "+" e "Nuovo …" solo con `canEdit` (Admin/Operatore, `isEditorRole`); mai per il Lettore.
- Opzioni passate ai componenti = campi cache, mai getter.
- Schede aperte solo via `EntityNavigatorService`/`openSheet()`; dialog semplici con `width` + `maxWidth` espliciti.
- `ngModel` dentro `[formGroup]`: `[ngModelOptions]="{standalone: true}"`.
- Mai `git add -A`/`git add .`: elencare i file. Commit Conventional Commits, chiusi da `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Verifica frontend: nessun test runner (nessun browser nel container). A ogni task: `docker logs --since 90s utenzepa-frontend-1 2>&1 | grep -E "✘|ERROR|generation"` deve mostrare "generation complete" senza `✘`. Comandi Docker uno alla volta.

## Review Focus

- Select con valore impostato a un id non ancora presente tra le opzioni (opzioni ricaricate in corso): l'etichetta deve comparire all'arrivo delle opzioni, il valore non deve azzerarsi. Coperto dal comportamento esistente di `syncDisplayFromValue` (Task 1, passo di verifica E2E dedicato).
- Fornitore creato come persona fisica: i filtri dei fornitori (`type === 'LEGAL' || roles.includes(SUPPLIER)`) lo escluderebbero. Il filtro usa l'id corrente del controllo, non `data.item` (Task 4, 9, 10).
- Annulla nella scheda di creazione: nessun record, nessun cambio di valore, nessun toast (tutti i task, `if (!created) return`).
- Errore backend (es. P.IVA duplicata): toast col messaggio del backend, scheda di partenza intatta (Task 3, `fail()` già esistente).
- Lettore: nessun "+" e nessun "Nuovo …" (Task 11, E2E).

---

### Task 1: "+" in `app-filterable-select` e `app-multi-select`

**Files:**
- Modify: `frontend/src/app/core/components/filterable-select.component.ts`
- Modify: `frontend/src/app/core/components/multi-select.component.ts`

**Interfaces:**
- Produces: su entrambi `@Input() createLabel: string | null = null` e `@Output() create = new EventEmitter<string>()` (testo digitato; `''` dal pulsante).

- [ ] **Step 1: filterable-select, template.** Avvolgere il `mat-form-field` in una riga flex e aggiungere pulsante + opzione "Crea". Sostituire il template con:

```html
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
          <!-- contenuto opzione invariato (span con icona/label/count/sublabel) -->
        </mat-option>
      }
      @if (createLabel && filteredOptions.length === 0 && searchText()) {
        <mat-option disabled class="fs-empty"><span>Nessun risultato</span></mat-option>
        <mat-option [value]="CREATE" class="fs-create">
          <span class="fs-create-inner"><mat-icon>add</mat-icon>Crea «{{ searchText() }}»</span>
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
```

Il contenuto interno della `mat-option` esistente (span annidati con icona, label, count, sublabel) resta identico: copiarlo dal file attuale.

- [ ] **Step 2: filterable-select, stili, import, logica.** Aggiungere `styles`, import `MatButtonModule`, `MatTooltipModule`, `EventEmitter`, `Output`, e:

```ts
styles: [`
  :host { display: block; }
  .fs-row { display: flex; align-items: flex-start; gap: 8px; }
  .fs-field { flex: 1 1 auto; min-width: 0; }
  .fs-add { min-width: 0; width: 44px; height: 56px; padding: 0; flex: 0 0 auto; }
  .fs-add .mat-icon { margin: 0; }
  .fs-create-inner { display: inline-flex; align-items: center; gap: 8px; font-weight: 500; color: var(--mat-sys-primary, #1d4ed8); }
`],
```

```ts
@Input() createLabel: string | null = null;
@Output() create = new EventEmitter<string>();
// Sentinella dell'opzione "Crea «…»": non è mai un valore del controllo.
readonly CREATE = {__create: true} as unknown as TOption;

searchText(): string {
  const v = this.searchControl.value;
  return typeof v === 'string' ? v.trim() : '';
}
```

In `onOptionSelected` gestire la sentinella prima della logica attuale:

```ts
onOptionSelected(event: MatAutocompleteSelectedEvent): void {
  const opt: TOption = event.option.value;
  if (opt === this.CREATE) {
    const text = this.searchText();
    // Il controllo resta com'era: il valore arriva dalla scheda di creazione.
    this.searchControl.setValue(text, {emitEvent: false});
    this.create.emit(text);
    return;
  }
  this.value = opt.value;
  this.onChangeFn(this.value);
  this.markTouched();
}
```

`displayFn` riceve la sentinella solo per un istante: aggiungere `if (opt === this.CREATE) return this.searchText();` in testa.

Il vecchio `style="width: 100%;"` sul `mat-form-field` è sostituito da `.fs-field`: senza `createLabel` il campo occupa tutta la riga come prima.

- [ ] **Step 3: multi-select.** Stessa riga flex con pulsante (nessuna opzione "Crea", il filtro è dentro il pannello: lì basta il pulsante). Template:

```html
<div class="fs-row">
  <mat-form-field class="fs-field">
    <!-- mat-label + mat-select invariati -->
  </mat-form-field>
  @if (createLabel) {
    <button mat-stroked-button type="button" class="fs-add" [disabled]="selectControl.disabled"
            [matTooltip]="createLabel" [attr.aria-label]="createLabel" (click)="create.emit('')">
      <mat-icon>add</mat-icon>
    </button>
  }
</div>
```

Aggiungere agli `styles` esistenti le regole `.fs-row`, `.fs-field`, `.fs-add`, `.fs-add .mat-icon` dello Step 2, e `@Input() createLabel`, `@Output() create` come sopra; import `MatButtonModule`, `MatTooltipModule`, `EventEmitter`, `Output`.

- [ ] **Step 4: compilazione.** Run: `docker logs --since 90s utenzepa-frontend-1 2>&1 | grep -E "✘|ERROR|generation"` — Expected: "generation complete", nessun `✘`. Controllare a occhio (Playwright, scheda contratto) che il Fornitore senza `createLabel` sia identico a prima.

- [ ] **Step 5: commit.**

```bash
git add frontend/src/app/core/components/filterable-select.component.ts frontend/src/app/core/components/multi-select.component.ts
git commit -m "feat(ui): pulsante + e opzione Crea nelle select con ricerca"
```

---

### Task 2: payload delle anagrafiche in un punto solo

**Files:**
- Modify: `frontend/src/app/pages/budget-chapters/entity/budget-chapter.entity.ts`, `budget-chapters/budget-chapters.component.ts`
- Modify: `frontend/src/app/pages/utility-types/entity/utility-type.entity.ts`, `utility-types/utility-types.component.ts`
- Modify: `frontend/src/app/pages/asset-nature/entity/asset-nature.entity.ts`, `asset-nature/asset-nature.component.ts`
- Modify: `frontend/src/app/pages/asset-function/entity/asset-function.entity.ts`, `asset-function/asset-function.component.ts`
- Modify: `frontend/src/app/pages/consip-agreement/entity/consip-agreement.entity.ts`, `consip-agreement/consip-agreement.component.ts`

**Interfaces:**
- Produces: `static toPayload(e: X): Partial<X>` su `BudgetChapter`, `UtilityType`, `AssetNature`, `AssetFunction`, `ConsipAgreement` (senza autore: lo aggiunge il chiamante).

- [ ] **Step 1: metodi statici.** In ogni entity, accanto a `static create`, spostare il corpo attuale di `entityToPayload` del componente elenco, senza i due campi autore. Esempio `BudgetChapter`:

```ts
// Campi inviati in creazione/modifica: usato dall'elenco e dal navigatore.
static toPayload(e: BudgetChapter): Partial<BudgetChapter> {
  return {chapter_code: e.chapter_code, article: e.article, description: e.description, pdc: e.pdc, supply_type: e.supply_type};
}
```

`UtilityType`: `{name, description, hard_type}`. `AssetNature`: `{name, icon, function_ids: e.function_ids ?? []}`. `AssetFunction`: `{name, icon}`. `ConsipAgreement`: `{supplier_id, name, description, cig_master, safeguard, expiration_date}`.

- [ ] **Step 2: elenchi.** In ogni `*.component.ts` sostituire il corpo di `entityToPayload` con:

```ts
protected override entityToPayload(entity: BudgetChapter): Partial<BudgetChapter> {
  return {...BudgetChapter.toPayload(entity), created_by_user_id: this.userId, updated_by_user_id: this.userId};
}
```

(adattando classe). Nessun altro cambiamento.

- [ ] **Step 3: compilazione** come Task 1 Step 4.

- [ ] **Step 4: commit.**

```bash
git add frontend/src/app/pages/budget-chapters/entity/budget-chapter.entity.ts frontend/src/app/pages/budget-chapters/budget-chapters.component.ts frontend/src/app/pages/utility-types/entity/utility-type.entity.ts frontend/src/app/pages/utility-types/utility-types.component.ts frontend/src/app/pages/asset-nature/entity/asset-nature.entity.ts frontend/src/app/pages/asset-nature/asset-nature.component.ts frontend/src/app/pages/asset-function/entity/asset-function.entity.ts frontend/src/app/pages/asset-function/asset-function.component.ts frontend/src/app/pages/consip-agreement/entity/consip-agreement.entity.ts frontend/src/app/pages/consip-agreement/consip-agreement.component.ts
git commit -m "refactor(ui): payload delle anagrafiche nelle entity"
```

---

### Task 3: `EntityNavigatorService`, metodi di creazione

**Files:**
- Modify: `frontend/src/app/core/services/entity-navigator.service.ts`
- Modify: `frontend/src/app/pages/plants/plant-edit-dialog.component.ts` (chiusura con l'impianto)
- Modify: `frontend/src/app/pages/plants/plant-edit-dialog.component.html:341`
- Modify: `frontend/src/app/pages/assets/asset-edit-dialog.component.ts` (`createGrant` nuova firma)
- Modify: `frontend/src/app/pages/contracts/commitments/commitment-edit-dialog.component.ts` (nessun cambio di dati, solo export già presente)

**Interfaces:**
- Consumes: `X.toPayload` (Task 2).
- Produces (tutti `Observable<T | null>`, `null` = annullato o errore già notificato):
  - `createThirdParty(prefill?: Partial<ThirdParty>): Observable<ThirdParty | null>`
  - `createBudgetChapter(): Observable<BudgetChapter | null>`
  - `createConsipAgreement(prefill?: Partial<ConsipAgreement>): Observable<ConsipAgreement | null>`
  - `createUtilityType(prefill?: Partial<UtilityType>): Observable<UtilityType | null>`
  - `createAssetNature(prefill?: Partial<AssetNature>): Observable<AssetNature | null>`
  - `createAssetFunction(natureId: number | null, prefill?: Partial<AssetFunction>): Observable<AssetFunction | null>`
  - `createAsset(prefill?: Partial<Asset>): Observable<Asset | null>`
  - `createInvoice(prefill?: Partial<Invoice>): Observable<Invoice | null>`
  - `createCommitment(contractId: number): Observable<Commitment | null>`
  - modificati: `createPlant(assetId: number | null): Observable<Plant | null>`, `createGrant(prefill: Partial<UtilizerGrant>): Observable<UtilizerGrant | null>`, `createSupplyContract(utilityIds: number[], prefill?: Partial<Contract>): Observable<Contract | null>`

- [ ] **Step 1: dialog impianto.** Chiusura sempre con l'impianto salvato o `null`. In `plant-edit-dialog.component.ts` aggiungere:

```ts
// Al chiamante: l'impianto se qualcosa è stato salvato, altrimenti null.
close(): void {
  this.dialogRef.close(this.saved ? this.plant : null);
}
```

sostituire `this.dialogRef.close(true);` (dopo l'update, riga ~558) con `this.plant = plant; this.close();`, e nell'HTML (riga 341) `(click)="dialogRef.close(saved)"` con `(click)="close()"`. `openPlant` resta `map(saved => !!saved)`.

- [ ] **Step 2: helper dialog semplice e lazy import.** Aggiungere le costanti di import dinamico:

```ts
const BUDGET_CHAPTER_DIALOG = () => import('../../pages/budget-chapters/budget-chapter-edit-dialog.component').then(m => m.BudgetChapterEditDialogComponent);
const CONSIP_DIALOG = () => import('../../pages/consip-agreement/consip-agreement-edit-dialog.component').then(m => m.ConsipAgreementEditDialogComponent);
const UTILITY_TYPE_DIALOG = () => import('../../pages/utility-types/utility-type-edit-dialog.component').then(m => m.UtilityTypeEditDialogComponent);
const NATURE_DIALOG = () => import('../../pages/asset-nature/asset-nature-edit-dialog.component').then(m => m.AssetNatureEditDialogComponent);
const FUNCTION_DIALOG = () => import('../../pages/asset-function/asset-function-edit-dialog.component').then(m => m.AssetFunctionEditDialogComponent);
const COMMITMENT_DIALOG = () => import('../../pages/contracts/commitments/commitment-edit-dialog.component').then(m => m.CommitmentEditDialogComponent);
```

e il metodo privato (stessa configurazione delle anagrafiche in `AbstractDataTableComponent.dialogConfig`):

```ts
// Anagrafiche semplici: dialog classico, come dall'elenco.
private simple<D, R>(load: () => Promise<ComponentType<unknown>>, data: D, width = '1150px'): Observable<R | undefined> {
  return from(load()).pipe(
    switchMap(component => this.dialog.open<unknown, D, R>(component, {width, maxWidth: width, position: EDIT_DIALOG_POSITION, data}).afterClosed()),
  );
}
```

(`EDIT_DIALOG_POSITION` da `../components/abstract-data-table.component`).

- [ ] **Step 3: metodi.** Iniettare `BudgetChaptersService`, `ConsipAgreementService`, `UtilityTypesService`, `AssetNaturesService`, `AssetFunctionsService`, `CommitmentService`, `BudgetChaptersService` (verificare i path con `grep -rn "export class .*Service" frontend/src/app/pages`). Poi:

```ts
createThirdParty(prefill: Partial<ThirdParty> = {}): Observable<ThirdParty | null> {
  return this.sheet<EditDialogData<ThirdParty>, ThirdParty>(THIRD_PARTY_DIALOG, {mode: 'create', item: ThirdParty.create(prefill)}).pipe(
    switchMap(r => (r ? this.thirdParties.create({...r, ...this.authorship()}) : of(null))),
    catchError(err => this.fail('Errore nella creazione del soggetto', err)),
  );
}

createBudgetChapter(): Observable<BudgetChapter | null> {
  return this.simple<EditDialogData<BudgetChapter>, BudgetChapter>(BUDGET_CHAPTER_DIALOG, {mode: 'create', item: BudgetChapter.create()}).pipe(
    switchMap(r => (r ? this.chapters.create({...BudgetChapter.toPayload(r), ...this.authorship()}) : of(null))),
    catchError(err => this.fail('Errore nella creazione del capitolo', err)),
  );
}

createConsipAgreement(prefill: Partial<ConsipAgreement> = {}): Observable<ConsipAgreement | null> {
  return this.simple<EditDialogData<ConsipAgreement>, ConsipAgreement>(CONSIP_DIALOG, {mode: 'create', item: ConsipAgreement.create(prefill)}).pipe(
    switchMap(r => (r ? this.consip.create({...ConsipAgreement.toPayload(r), ...this.authorship()}) : of(null))),
    catchError(err => this.fail('Errore nella creazione della convenzione CONSIP', err)),
  );
}

createUtilityType(prefill: Partial<UtilityType> = {}): Observable<UtilityType | null> {
  return this.simple<EditDialogData<UtilityType>, UtilityType>(UTILITY_TYPE_DIALOG, {mode: 'create', item: UtilityType.create(prefill)}).pipe(
    switchMap(r => (r ? this.utilityTypes.create({...UtilityType.toPayload(r), ...this.authorship()}) : of(null))),
    catchError(err => this.fail('Errore nella creazione del tipo utenza', err)),
  );
}

createAssetNature(prefill: Partial<AssetNature> = {}): Observable<AssetNature | null> {
  return this.simple<EditDialogData<AssetNature>, AssetNature>(NATURE_DIALOG, {mode: 'create', item: AssetNature.create(prefill)}).pipe(
    switchMap(r => (r ? this.natures.create({...AssetNature.toPayload(r), ...this.authorship()}) : of(null))),
    catchError(err => this.fail('Errore nella creazione della tipologia', err)),
  );
}

// Una funzione nuova va anche tra le ammesse della tipologia scelta,
// altrimenti la scheda immobile non la propone.
createAssetFunction(natureId: number | null, prefill: Partial<AssetFunction> = {}): Observable<AssetFunction | null> {
  return this.simple<EditDialogData<AssetFunction>, AssetFunction>(FUNCTION_DIALOG, {mode: 'create', item: AssetFunction.create(prefill)}).pipe(
    switchMap(r => (r ? this.functions.create({...AssetFunction.toPayload(r), ...this.authorship()}) : of(null))),
    switchMap(fn => {
      if (!fn || natureId == null) return of(fn);
      return this.natures.getById(natureId).pipe(
        switchMap(n => this.natures.update(natureId, {
          function_ids: [...(n.functions ?? []).map(f => f.id), fn.id],
          updated_by_user_id: this.authorship().updated_by_user_id,
        } as Partial<AssetNature>)),
        map(() => fn),
      );
    }),
    catchError(err => this.fail('Errore nella creazione della funzione', err)),
  );
}

createAsset(prefill: Partial<Asset> = {}): Observable<Asset | null> {
  return this.sheet<EditDialogData<Asset>, Asset>(ASSET_DIALOG, {mode: 'create', item: Asset.create(prefill)}).pipe(
    switchMap(r => (r ? this.assets.create({...r, ...this.authorship()}) : of(null))),
    catchError(err => this.fail("Errore nella creazione dell'immobile", err)),
  );
}

createInvoice(prefill: Partial<Invoice> = {}): Observable<Invoice | null> {
  return this.sheet<EditDialogData<Invoice>, Invoice>(INVOICE_DIALOG, {mode: 'create', item: Invoice.create(prefill)}).pipe(
    switchMap(r => (r ? this.invoices.create({...r, ...this.authorship()}) : of(null))),
    catchError(err => this.fail('Errore nella creazione della fattura', err)),
  );
}

createCommitment(contractId: number): Observable<Commitment | null> {
  return this.chapters.search({deleted: false}).pipe(
    map(list => list.map(c => ({label: chapterLabel(c), value: c.id,
      searchText: `${c.chapter_code}/${c.article ?? 0} ${c.description ?? ''} ${c.pdc ?? ''}`}))
      .sort((a, b) => a.label.localeCompare(b.label))),
    switchMap(chapterOptions => this.simple<CommitmentDialogData, CommitmentPayload>(
      COMMITMENT_DIALOG, {item: null, chapterOptions}, '560px')),
    switchMap(p => (p ? this.commitmentService.create(contractId, p) : of(null))),
    catchError(err => this.fail("Errore nella creazione dell'impegno", err)),
  );
}
```

Verificare prima di scrivere: che `AssetNaturesService` abbia `getById`/`update` (estende `AbstractService`), che `chapterLabel` esista e da dove si importa (`grep -rn "export function chapterLabel" frontend/src/app`), che `CommitmentService.create(contractId, payload)` restituisca `Observable<Commitment>`, che i `create` dei servizi accettino `Partial<T>` (altrimenti cast `as T` come fa già `createUtility`). L'`Asset` creato lato elenco (`AssetsComponent.onCreate`) va controllato: se fa trasformazioni (es. coordinate), replicarle qui.

Modificare i tre esistenti:

```ts
createPlant(assetId: number | null): Observable<Plant | null> {
  return this.sheet<{plantId: null; assetId: number | null; readOnly: boolean}, Plant | null>(
    PLANT_DIALOG, {plantId: null, assetId, readOnly: this.readOnly()},
  ).pipe(map(p => p ?? null));
}

createSupplyContract(utilityIds: number[], prefill: Partial<Contract> = {}): Observable<Contract | null> {
  return this.sheet<EditDialogData<Contract> & {preselectedUtilityIds: number[]}, Contract>(
    CONTRACT_DIALOG, {mode: 'create', item: Contract.create(prefill), preselectedUtilityIds: utilityIds},
  ).pipe(
    switchMap(r => (r ? this.contracts.create(r) : of(null))),
    catchError(err => this.fail('Errore nella creazione del contratto di fornitura', err)),
  );
}

createGrant(prefill: Partial<UtilizerGrant>): Observable<UtilizerGrant | null> {
  return this.sheet<EditDialogData<UtilizerGrant>, UtilizerGrant>(
    GRANT_DIALOG, {mode: 'create', item: UtilizerGrant.create(prefill)},
  ).pipe(
    switchMap(r => (r ? this.grants.create(r) : of(null))),
    catchError(err => this.fail('Errore nella creazione del contratto immobiliare', err)),
  );
}
```

In `asset-edit-dialog.component.ts`: `this.navigator.createGrant([this.data.item.id])` → `this.navigator.createGrant({asset_ids: [this.data.item.id]})`.

- [ ] **Step 4: precompilazione nome dal testo digitato.** Aggiungere un helper esportato nello stesso file, usato dalle schede:

```ts
// Testo digitato nella select → campo nome dell'entità creata.
export const nameFrom = (text: string) => (text.trim() ? text.trim() : undefined);
```

- [ ] **Step 5: compilazione** come Task 1 Step 4.

- [ ] **Step 6: commit.**

```bash
git add frontend/src/app/core/services/entity-navigator.service.ts frontend/src/app/pages/plants/plant-edit-dialog.component.ts frontend/src/app/pages/plants/plant-edit-dialog.component.html frontend/src/app/pages/assets/asset-edit-dialog.component.ts
git commit -m "feat(ui): navigatore, creazione di ogni entità collegabile"
```

---

### Task 4: scheda contratto di fornitura

**Files:**
- Modify: `frontend/src/app/pages/contracts/contract-edit-dialog.component.{ts,html}`
- Modify: `frontend/src/app/pages/contracts/commitments/commitment-edit-dialog.component.ts`

**Interfaces:**
- Consumes: `createThirdParty`, `createConsipAgreement`, `createUtility`, `createBudgetChapter`, `nameFrom` (Task 3); `createLabel`/`(create)` (Task 1).

- [ ] **Step 1: estrarre i caricamenti.** Da `ngOnInit` spostare il blocco fornitori in `private loadSuppliers(): void` e il blocco CONSIP in `private loadConsip(): void`; `ngOnInit` li chiama. Nel filtro dei fornitori sostituire `p.id === this.data.item.supplier_id_fk` con `p.id === this.form.controls.supplier_id_fk.value` (un fornitore persona creato al volo deve restare visibile).

- [ ] **Step 2: Fornitore.**

```html
<app-filterable-select label="Fornitore" placeholder="Cerca fornitore..." [options]="supplierOptions" formControlName="supplier_id_fk"
  [createLabel]="canEdit ? 'Nuovo soggetto terzo' : null" (create)="newSupplier($event)"></app-filterable-select>
```

```ts
newSupplier(text: string): void {
  this.navigator.createThirdParty({company_name: nameFrom(text)}).subscribe(p => {
    if (!p) return;
    this.form.controls.supplier_id_fk.setValue(p.id);
    this.form.controls.supplier_id_fk.markAsDirty();
    this.loadSuppliers();
  });
}
```

- [ ] **Step 3: Convenzione CONSIP → `app-filterable-select`.** Aggiungere il campo cache `consipOptions: TOption[]`, valorizzato in `loadConsip` da `consipAgreementOptions` (`{label: a.name ?? `#${a.id}`, value: a.id, sublabel: a.cig_master ?? undefined}`). Sostituire la `mat-select` (riga ~42) con:

```html
<app-filterable-select label="Convenzione CONSIP" placeholder="Cerca convenzione..." [options]="consipOptions"
  formControlName="consip_agreement_id" [createLabel]="canEdit ? 'Nuova convenzione CONSIP' : null"
  (create)="newConsip($event)"></app-filterable-select>
```

Leggere `onConsipAgreementChange($event)` e trasformarlo in `private onConsipAgreementChange(id: number | null)`, chiamato da `this.form.controls.consip_agreement_id.valueChanges.subscribe(id => this.onConsipAgreementChange(id))` in `ngOnInit` (solo se `canEdit`). Mantenere la stessa logica interna (usa `consipAgreementOptions` per trovare la convenzione).

```ts
newConsip(text: string): void {
  this.navigator.createConsipAgreement({name: nameFrom(text), supplier_id: this.form.controls.supplier_id_fk.value ?? undefined}).subscribe(a => {
    if (!a) return;
    this.loadConsip(() => this.form.controls.consip_agreement_id.setValue(a.id));
    this.form.controls.consip_agreement_id.markAsDirty();
  });
}
```

`loadConsip(after?: () => void)`: chiama `after?.()` dopo aver valorizzato le opzioni (la logica di `onConsipAgreementChange` ha bisogno della convenzione tra le opzioni).

- [ ] **Step 4: tab Utenze, "Nuova utenza".** Sulla `app-linked-table` aggiungere `[createLabel]="canEdit ? 'Nuova utenza' : null" (create)="newUtility()"`:

```ts
newUtility(): void {
  this.navigator.createUtility(Utility.create()).subscribe(u => {
    if (!u) return;
    this.loadUtilities();
    this.addUtility(u.id);
  });
}
```

(`addUtility` già esistente aggiorna `utility_ids` e `refreshLinks`; finché `loadUtilities` non torna la riga usa `allUtilities`, quindi nel `next` di `loadUtilities` c'è già `refreshLinks()`.)

- [ ] **Step 5: impegni, "+" sul capitolo.** In `CommitmentEditDialogComponent`: iniettare `EntityNavigatorService`, copiare `data.chapterOptions` in un campo `chapterOptions` (cache), e:

```html
<app-filterable-select label="Capitolo *" placeholder="Cerca capitolo..." [options]="chapterOptions"
  formControlName="budget_chapter_id_fk" createLabel="Nuovo capitolo" (create)="newChapter()"
  [errorMessage]="...invariato..."></app-filterable-select>
```

```ts
newChapter(): void {
  this.navigator.createBudgetChapter().subscribe(c => {
    if (!c) return;
    this.chapterOptions = [...this.chapterOptions, {label: chapterLabel(c), value: c.id,
      searchText: `${c.chapter_code}/${c.article ?? 0} ${c.description ?? ''} ${c.pdc ?? ''}`}]
      .sort((a, b) => a.label.localeCompare(b.label));
    this.form.controls.budget_chapter_id_fk.setValue(c.id);
  });
}
```

Il dialog impegno si apre solo da utenti che possono modificare: nessun controllo di ruolo aggiuntivo. Attenzione al ciclo di import: `commitment-edit-dialog` importa il navigatore, il navigatore importa il dialog solo in modo dinamico (Task 3) — nessun ciclo statico.

- [ ] **Step 6: compilazione + E2E.** Compilazione come Task 1. E2E (utente temporaneo, vedi Task 11 per creazione/pulizia): scheda contratto → "+" Fornitore → soggetto "Ditta Prova CRUD" (P.IVA fittizia valida `00000000000` se accettata, altrimenti una di test) → torna selezionato; "+" CONSIP con testo digitato → nome precompilato; tab Utenze → Nuova utenza → collegata; Impegni → Nuovo impegno → "+" capitolo.

- [ ] **Step 7: commit.**

```bash
git add frontend/src/app/pages/contracts/contract-edit-dialog.component.ts frontend/src/app/pages/contracts/contract-edit-dialog.component.html frontend/src/app/pages/contracts/commitments/commitment-edit-dialog.component.ts
git commit -m "feat(ui): contratto di fornitura, creazione di fornitore, convenzione, utenza e capitolo"
```

---

### Task 5: scheda contratto immobiliare

**Files:**
- Modify: `frontend/src/app/pages/utilizer-grant/utilizer-grant-edit-dialog.component.{ts,html}`

- [ ] **Step 1: estrarre `loadParties()` e `loadAssets()`** dai blocchi in `ngOnInit` (righe ~209–232).

- [ ] **Step 2: Parti del contratto.** Sull'`app-multi-select` (riga ~54) aggiungere `[createLabel]="canEdit ? 'Nuovo soggetto terzo' : null" (create)="newParty()"`:

```ts
newParty(): void {
  this.navigator.createThirdParty().subscribe(p => {
    if (!p) return;
    const c = this.form.controls.party_ids;
    c.setValue([...(c.value ?? []), p.id]);
    c.markAsDirty();
    this.loadParties();
  });
}
```

- [ ] **Step 3: tab Immobili.** `[createLabel]="canEdit ? 'Nuovo immobile' : null" (create)="newAsset()"`:

```ts
newAsset(): void {
  this.navigator.createAsset().subscribe(a => {
    if (!a) return;
    this.loadAssets();
    this.addAsset(a.id);
  });
}
```

- [ ] **Step 4: tab Utenze.** Le righe sono le utenze degli immobili del contratto: la nuova utenza nasce sugli immobili salvati del contratto.

```html
<app-linked-table ... [createLabel]="canEdit && savedAssetIds().length ? 'Nuova utenza' : null" (create)="newUtility()">
```

```ts
savedAssetIds(): number[] {
  return (this.item.assets ?? []).map(a => a.id);
}

newUtility(): void {
  const ids = this.savedAssetIds();
  this.navigator.createUtility(Utility.create({asset_ids: ids})).subscribe(u => {
    if (u) this.loadUtilities();
  });
}
```

Se `item.assets` non è popolato in modifica, usare `this.item.asset_ids` (verificare nel file quale dei due arriva da `getById`). Aggiornare `p.sheet-hint` del tab: "Utenze degli immobili del contratto. Una nuova utenza nasce su tutti gli immobili salvati del contratto."

- [ ] **Step 5: compilazione + E2E** (nuovo soggetto tra le parti; nuovo immobile collegato; nuova utenza visibile nel tab dopo la creazione).

- [ ] **Step 6: commit.**

```bash
git add frontend/src/app/pages/utilizer-grant/utilizer-grant-edit-dialog.component.ts frontend/src/app/pages/utilizer-grant/utilizer-grant-edit-dialog.component.html
git commit -m "feat(ui): contratto immobiliare, creazione di parti, immobili e utenze"
```

---

### Task 6: scheda utenza

**Files:**
- Modify: `frontend/src/app/pages/utilities/utility-edit-dialog.component.{ts,html}`
- Modify: `frontend/src/app/pages/utilities/utility-invoices-tab.component.ts`

- [ ] **Step 1: Tipo utenza → `app-filterable-select`.** Estrarre `loadUtilityTypes()`. Campo cache `utilityTypeSelectOptions: TOption[]` (`{label: t.name, value: t.id, sublabel: HardTypeLabel?.[t.hard_type]}` — usare l'etichetta del tipo fisico se esiste un enum etichette, altrimenti solo `label`). Sostituire la `mat-select` (riga ~43) con `app-filterable-select` (`formControlName="utility_type_id_fk"`, `[createLabel]="canEdit ? 'Nuovo tipo utenza' : null"`, `(create)="newUtilityType($event)"`). `onUtilityTypeChange(event: MatSelectChange)` diventa `onUtilityTypeChange(id: number | null)` (stessa logica con `id` al posto di `event.value`), chiamato da `valueChanges` del controllo in `ngOnInit`. Controllare che la logica di avvio (`selectedHardType` iniziale) non dipendesse dal primo `selectionChange`.

```ts
newUtilityType(text: string): void {
  this.navigator.createUtilityType({name: nameFrom(text)}).subscribe(t => {
    if (!t) return;
    this.loadUtilityTypes(() => this.form.controls.utility_type_id_fk.setValue(t.id));
    this.form.controls.utility_type_id_fk.markAsDirty();
  });
}
```

(`loadUtilityTypes(after?)` come `loadConsip` del Task 4: il cambio tipo ha bisogno di `utilityTypeOptions` aggiornate.)

- [ ] **Step 2: Capitolo di spesa.** Estrarre `loadBudgetChapters()` dal blocco in `ngOnInit`. Sulla `app-filterable-select` del capitolo (riga ~79) `[createLabel]="canEdit ? 'Nuovo capitolo' : null" (create)="newChapter()"`:

```ts
newChapter(): void {
  this.navigator.createBudgetChapter().subscribe(c => {
    if (!c) return;
    this.form.controls.budget_chapter_code_fk.setValue(c.id);
    this.form.controls.budget_chapter_code_fk.markAsDirty();
    this.loadBudgetChapters();
  });
}
```

Verificare il nome reale del controllo capitolo nell'HTML (riga ~79) e usarlo.

- [ ] **Step 3: tab Immobili e Impianti.** `createLabel` "Nuovo immobile" / "Nuovo impianto":

```ts
newAsset(): void {
  this.navigator.createAsset().subscribe(a => {
    if (!a) return;
    this.loadAssets();
    this.addAsset(a.id);
  });
}

newPlant(): void {
  this.navigator.createPlant(null).subscribe(p => {
    if (!p) return;
    this.loadPlants();
    this.addPlant(p.id);
  });
}
```

- [ ] **Step 4: tab Fatture, "Nuova fattura".** In `UtilityInvoicesTabComponent` aggiungere `@Input() canEdit = false` e `@Input() contractId: number | null = null`, pulsante in testa al tab:

```html
@if (canEdit) {
  <div class="sheet-actions-row">
    <button mat-stroked-button type="button" (click)="newInvoice()"><mat-icon>add</mat-icon> Nuova fattura</button>
  </div>
}
```

```ts
newInvoice(): void {
  this.navigator.createInvoice({
    contratto_id_fk: this.contractId,
    lines: [{amount: 0, utility_id_fk: this.utilityId, commitment_id_fk: null, period_start: null, period_end: null,
      consumption: null, supply_code: null, description: null}],
  }).subscribe(inv => {
    if (inv) this.load();
  });
}
```

Stile: `.sheet-actions-row { display: flex; justify-content: flex-end; margin-bottom: 8px; }` negli `styles` del tab (o classe esistente equivalente: cercare `grep -rn "sheet-actions\|lt-toolbar" frontend/src/app/core/components/entity-sheet`). Import `MatButtonModule`, `MatIconModule`. Nell'HTML della scheda utenza: `<app-utility-invoices-tab [utilityId]="data.item.id" [canEdit]="canEdit" [contractId]="currentContractId()">`, con

```ts
// Contratto aperto dell'utenza, solo se uno: precompila la fattura.
currentContractId(): number | null {
  const open = this.contracts.filter(c => !c.closed);
  return open.length === 1 ? open[0].id : null;
}
```

Verificare il nome del flag "chiuso" del contratto (`closed` nel DTO di ricerca backend; nell'entity frontend controllare `grep -n "closed" frontend/src/app/pages/contracts/entity/contract.entity.ts`). Il fornitore della fattura segue il contratto già da solo (logica esistente su `contratto_id_fk.valueChanges` — controllare che parta anche con il valore iniziale; se no, passare anche `supplier_id_fk` dal contratto).

- [ ] **Step 5: compilazione + E2E** (tipo nuovo con testo digitato → selezionato e campi ARERA coerenti; capitolo nuovo; immobile/impianto nuovi collegati; fattura nuova con la riga sull'utenza, visibile nel tab).

- [ ] **Step 6: commit.**

```bash
git add frontend/src/app/pages/utilities/utility-edit-dialog.component.ts frontend/src/app/pages/utilities/utility-edit-dialog.component.html frontend/src/app/pages/utilities/utility-invoices-tab.component.ts
git commit -m "feat(ui): utenza, creazione di tipo, capitolo, immobile, impianto e fattura"
```

---

### Task 7: scheda immobile (tipologia e funzione)

**Files:**
- Modify: `frontend/src/app/pages/assets/asset-edit-dialog.component.{ts,html}`

- [ ] **Step 1: opzioni cache.** Estrarre `loadNatures(after?)` e `loadFunctions()`. Campi cache `natureSelectOptions: TOption[]` (`{label: n.name, value: n.id, icon: n.icon}`) e `functionSelectOptions: TOption[]`, ricalcolato da `refreshFunctionOptions()` = `this.functionOptions().map(f => ({label: f.name, value: f.id, icon: f.icon || ICON_FALLBACK}))`, chiamato dopo `loadNatures` e in `nature_id.valueChanges` (subscription esistente alla riga ~210).

- [ ] **Step 2: select.** Sostituire le `mat-select` di `nature_id` (riga ~52) e `function_id` (riga ~72) con `app-filterable-select` (`[createLabel]="canEdit ? 'Nuova tipologia' : null"` / `'Nuova funzione'`). Il blocco `@for`/icone/messaggi d'errore esistenti: riportare gli `mat-error` come `[errorMessage]` (`form.controls.nature_id.invalid && form.controls.nature_id.touched ? 'Obbligatoria' : null`). Il disable della funzione senza tipologia (riga ~224) agisce già sul controllo: la select si disabilita e il "+" con lei (`[disabled]="searchControl.disabled"`, Task 1).

```ts
newNature(text: string): void {
  this.navigator.createAssetNature({name: nameFrom(text)}).subscribe(n => {
    if (!n) return;
    this.loadNatures(() => this.form.controls.nature_id.setValue(n.id));
    this.form.controls.nature_id.markAsDirty();
  });
}

newFunction(text: string): void {
  const natureId = this.form.controls.nature_id.value;
  this.navigator.createAssetFunction(natureId, {name: nameFrom(text)}).subscribe(f => {
    if (!f) return;
    this.loadFunctions();
    this.loadNatures(() => this.form.controls.function_id.setValue(f.id));
    this.form.controls.function_id.markAsDirty();
  });
}
```

Attenzione: la subscription su `nature_id.valueChanges` azzera `function_id` se non è tra le ammesse; dopo `newFunction` la tipologia ricaricata contiene la funzione, quindi l'ordine "ricarica tipologie → setValue funzione" è obbligato.

- [ ] **Step 3: compilazione + E2E** (immobile nuovo: "+" tipologia con testo "Tipologia Prova" → selezionata; funzione disabilitata finché manca la tipologia; "+" funzione → selezionata e ammessa; riaprendo Impostazioni → Tipologie la funzione risulta tra le ammesse).

- [ ] **Step 4: commit.**

```bash
git add frontend/src/app/pages/assets/asset-edit-dialog.component.ts frontend/src/app/pages/assets/asset-edit-dialog.component.html
git commit -m "feat(ui): immobile, creazione di tipologia e funzione"
```

---

### Task 8: scheda impianto

**Files:**
- Modify: `frontend/src/app/pages/plants/plant-edit-dialog.component.{ts,html}`

- [ ] **Step 1: tab Immobili.** `[createLabel]="data.readOnly ? null : 'Nuovo immobile'" (create)="newAsset()"`:

```ts
newAsset(): void {
  this.navigator.createAsset().subscribe(a => {
    if (!a) return;
    this.loadAssets();
    this.addAsset(a.id);
  });
}
```

- [ ] **Step 2: tab Utenze.** Solo con impianto salvato (un'utenza senza immobile né impianto non si salva): `[createLabel]="!data.readOnly && plant ? 'Nuova utenza' : null" (create)="newUtility()"`:

```ts
newUtility(): void {
  if (!this.plant) return;
  this.navigator.createUtility(Utility.create({plant_ids: [this.plant.id]})).subscribe(u => {
    if (!u) return;
    this.loadUtilities();
    this.savedUtilityIds.add(u.id);
    this.addUtility(u.id);
    this.saved = true;
  });
}
```

(`savedUtilityIds` esiste già per il riallineamento: il legame è già sul server, va registrato come salvato così il riallineamento non lo tratta come aggiunto qui.) Verificare il nome reale del set (`grep -n "savedUtilityIds" plant-edit-dialog.component.ts`).

- [ ] **Step 3: compilazione + E2E.**

- [ ] **Step 4: commit.**

```bash
git add frontend/src/app/pages/plants/plant-edit-dialog.component.ts frontend/src/app/pages/plants/plant-edit-dialog.component.html
git commit -m "feat(ui): impianto, creazione di immobili e utenze"
```

---

### Task 9: scheda fattura e righe

**Files:**
- Modify: `frontend/src/app/pages/invoices/invoice-edit-dialog.component.{ts,html}`
- Modify: `frontend/src/app/pages/invoices/invoice-lines-tab.component.ts`

- [ ] **Step 1: estrarre** `loadContracts()`, `loadSuppliers()` (filtro con `this.form.controls.supplier_id_fk.value` al posto di `data.item.supplier_id_fk`), `loadUtilities()` da `ngOnInit`.

- [ ] **Step 2: Contratto e Fornitore.**

```html
<app-filterable-select label="Contratto di fornitura" ... formControlName="contratto_id_fk"
  [createLabel]="canEdit ? 'Nuovo contratto di fornitura' : null" (create)="newContract()"></app-filterable-select>
<app-filterable-select label="Fornitore" ... formControlName="supplier_id_fk"
  [createLabel]="canEdit ? 'Nuovo soggetto terzo' : null" (create)="newSupplier($event)"></app-filterable-select>
```

```ts
newContract(): void {
  const supplier = this.form.controls.supplier_id_fk.value;
  this.navigator.createSupplyContract([], supplier ? {supplier_id_fk: supplier} : {}).subscribe(c => {
    if (!c) return;
    // Il fornitore segue il contratto tramite valueChanges: serve il contratto in this.contracts.
    this.loadContracts(() => this.form.controls.contratto_id_fk.setValue(c.id));
    this.form.controls.contratto_id_fk.markAsDirty();
  });
}

newSupplier(text: string): void {
  this.navigator.createThirdParty({company_name: nameFrom(text)}).subscribe(p => {
    if (!p) return;
    this.form.controls.supplier_id_fk.setValue(p.id);
    this.form.controls.supplier_id_fk.markAsDirty();
    this.loadSuppliers();
  });
}
```

- [ ] **Step 3: righe.** In `InvoiceLinesTabComponent`: input `@Input() contractId: number | null = null`, output `@Output() createUtility = new EventEmitter<number>()` e `@Output() createCommitment = new EventEmitter<number>()` (indice della riga). Sulle due `app-filterable-select` (righe ~48 e ~52):

```html
[createLabel]="readOnly ? null : 'Nuova utenza'" (create)="createUtility.emit(i)"
...
[createLabel]="readOnly || !contractId ? null : 'Nuovo impegno'" (create)="createCommitment.emit(i)"
```

(se l'indice nel `@for` non si chiama `i`, usare il nome reale; `$index`.) Sotto la select Impegno, quando `!readOnly && !contractId`: `<span class="line-hint">Impegni disponibili scegliendo il contratto.</span>` (stile `font-size: .75rem; color: var(--sheet-muted)`).

Nella scheda fattura:

```html
<app-invoice-lines-tab ... [contractId]="form.controls.contratto_id_fk.value"
  (createUtility)="newLineUtility($event)" (createCommitment)="newLineCommitment($event)">
```

```ts
newLineUtility(index: number): void {
  this.navigator.createUtility(Utility.create()).subscribe(u => {
    if (!u) return;
    this.loadUtilities();
    this.lines = this.lines.map((l, i) => (i === index ? {...l, utility_id_fk: u.id} : l));
  });
}

newLineCommitment(index: number): void {
  const contractId = this.form.controls.contratto_id_fk.value;
  if (!contractId) return;
  this.navigator.createCommitment(contractId).subscribe(c => {
    if (!c) return;
    this.loadCommitments(contractId);
    this.lines = this.lines.map((l, i) => (i === index ? {...l, commitment_id_fk: c.id} : l));
  });
}
```

- [ ] **Step 4: compilazione + E2E** (fattura nuova: "+" contratto → selezionato e fornitore seguito; riga: "+" utenza → valorizzata; "+" impegno → valorizzato; Salva → riaperta coerente).

- [ ] **Step 5: commit.**

```bash
git add frontend/src/app/pages/invoices/invoice-edit-dialog.component.ts frontend/src/app/pages/invoices/invoice-edit-dialog.component.html frontend/src/app/pages/invoices/invoice-lines-tab.component.ts
git commit -m "feat(ui): fattura, creazione di contratto, fornitore, utenza e impegno"
```

---

### Task 10: soggetto terzo e convenzione CONSIP

**Files:**
- Modify: `frontend/src/app/pages/third-parties/third-party-edit-dialog.component.{ts,html}`
- Modify: `frontend/src/app/pages/consip-agreement/consip-agreement-edit-dialog.component.{ts,html}`

- [ ] **Step 1: soggetto terzo, tab.** Sulle tabelle contratti immobiliari e contratti di fornitura:

```html
<app-linked-table [columns]="grantColumns" [rows]="grants" [rowStatus]="grantStatusOf"
  [createLabel]="canEdit ? 'Nuovo contratto immobiliare' : null" (create)="newGrant()"
  emptyText="Nessun contratto immobiliare." (open)="openGrant($event.id)"></app-linked-table>
...
<app-linked-table [columns]="contractColumns" [rows]="contracts" [rowStatus]="contractStatusOf"
  [createLabel]="canEdit ? 'Nuovo contratto di fornitura' : null" (create)="newContract()"
  emptyText="Nessun contratto di fornitura." (open)="openContract($event.id)"></app-linked-table>
```

Estrarre `loadContracts()` dalla riga ~118.

```ts
newGrant(): void {
  this.navigator.createGrant({party_ids: [this.data.item.id]}).subscribe(g => {
    if (g) this.loadGrants();
  });
}

newContract(): void {
  this.navigator.createSupplyContract([], {supplier_id_fk: this.data.item.id}).subscribe(c => {
    if (c) this.loadContracts();
  });
}
```

Verificare che il dialog del contratto immobiliare legga `party_ids` dal `item` in creazione (`grep -n "party_ids" utilizer-grant-edit-dialog.component.ts`); se legge solo `parties`, passare anche `parties: [this.data.item]`.

- [ ] **Step 2: convenzione CONSIP, Fornitore.** Estrarre `loadSuppliers()` (filtro con `this.form.controls.supplier_id.value`), poi `[createLabel]="'Nuovo soggetto terzo'"` sulla select (il dialog è già disabilitato per il Lettore; nascondere comunque: `[createLabel]="form.disabled ? null : 'Nuovo soggetto terzo'"`), `(create)="newSupplier($event)"` come nel Task 4 con `supplier_id`. Iniettare `EntityNavigatorService`.

- [ ] **Step 3: compilazione + E2E.**

- [ ] **Step 4: commit.**

```bash
git add frontend/src/app/pages/third-parties/third-party-edit-dialog.component.ts frontend/src/app/pages/third-parties/third-party-edit-dialog.component.html frontend/src/app/pages/consip-agreement/consip-agreement-edit-dialog.component.ts frontend/src/app/pages/consip-agreement/consip-agreement-edit-dialog.component.html
git commit -m "feat(ui): soggetto terzo e convenzione, creazione dei contratti e del fornitore"
```

---

### Task 11: verifica completa, documentazione, PR

**Files:**
- Modify: `CLAUDE.md` (sezione Frontend, riga sulle schede entità)
- Modify: `docs/roadmap-patrimonio.md` (voce 15/13: nota "creazione dalle schede")

- [ ] **Step 1: build di produzione.** `docker exec utenzepa-frontend-1 pnpm run build` — Expected: build OK senza errori di template.

- [ ] **Step 2: utente temporaneo E2E.** Creare utente `e2e_tmp` (Operatore) come da CLAUDE.md (hash bcrypt via container api, `INSERT` su `system_users` con `username`, `auth_provider='local'`, `status='Attivo'`, `created_by_user_id=1`, `updated_by_user_id=1`). Percorrere la tabella "Giro CRUD" della spec, una riga per volta, con nomi fittizi ("Ditta Prova CRUD", "Tipologia Prova", …). Poi utente Lettore (stesso utente, `role='Lettore'`): nessun "+" e nessun "Nuovo …" in contratto, utenza, immobile, fattura.

- [ ] **Step 3: pulizia.** Eliminare fisicamente tutti i record creati nel test (soggetti, convenzioni, capitoli, tipi utenza, tipologie, funzioni, immobili, impianti, utenze, contratti, impegni, fatture con le righe, legami `plant_assets`/`utility_*`/`utilizer_grant_parties`, `asset_nature_functions`), poi `DELETE FROM audit_logs WHERE user_id=<id>` e l'utente. Le FK verso `system_users` si elencano con la query di CLAUDE.md. Controllo finale: `SELECT COUNT(*) FROM third_parties WHERE company_name LIKE '%Prova%'` = 0 (e analoghi).

- [ ] **Step 4: CLAUDE.md.** Nella riga "Schede entità" aggiungere: `Creazione al volo: \`createLabel\`/\`(create)\` su \`app-filterable-select\`/\`app-multi-select\` (pulsante "+" e "Crea «testo»") e su \`app-linked-table\`; la scheda chiama \`EntityNavigatorService.create…\`, poi ricarica le opzioni e imposta il valore (la select mostra l'etichetta all'arrivo delle opzioni). Payload delle anagrafiche in \`X.toPayload\` (entity), condiviso da elenco e navigatore.`

- [ ] **Step 5: commit e PR.**

```bash
git add CLAUDE.md docs/roadmap-patrimonio.md
git commit -m "docs: creazione dalle schede in CLAUDE.md e roadmap"
git push -u origin feat/crud-dalle-schede
gh pr create --title "feat(ui): creazione dalle schede (+ Nuovo sui collegamenti)" --body "..."
```

Body: riepilogo per scheda + "Test: build, E2E con utente temporaneo (poi eliminato con i record di prova)" + riga finale `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Attendere CI (`gh pr checks <N> --watch`), merge solo su conferma dell'utente.

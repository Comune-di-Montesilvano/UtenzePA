# Fase 2: migrazione delle 13 pagine restanti da PrimeNG ad Angular Material

Data: 2026-08-06
Branch: `angular22-material-migration` (continua Fase 1, stesso branch/worktree)
Precede: bump Angular 20→22 e rimozione `primeng`/`@primeuix/themes`/`primeicons` (ultimo step, dopo che tutte le pagine sono migrate)

## Contesto

Fase 1 (completata, review finale approvata) ha migrato la pagina pilota `purpose`
e i due componenti astratti condivisi (`AbstractComponent`, `AbstractDataTableComponent`)
da PrimeNG ad Angular Material. Da quel momento tutte le 13 pagine CRUD non ancora
migrate non compilano più contro `AbstractDataTableComponent` — condizione nota e
accettata, la build/CI del frontend resta rossa per l'intera durata della Fase 2.

Ricognizione completa delle 13 pagine (agente Explore, 2026-08-06): tutte estendono
gli stessi due componenti astratti e seguono lo stesso pattern strutturale di
`purpose` (pagina contenitore + `search-*` + `data-table-*`), con varianti di
complessità dovute a numero di campi, relazioni FK, componenti PrimeNG aggiuntivi
(multiselect, datepicker, checkbox, fieldset, colonne dinamiche + export CSV).

## Raggruppamento per rischio/somiglianza

| Gruppo | Pagine | Caratteristiche |
|---|---|---|
| A | `asset-aggregator`, `maintenance-managers`, `utility-aggregator`, `utilizer` | 2 campi (`code`/`name` + `description`), nessuna relazione FK, cloni strutturali l'uno dell'altro |
| B | `budget-chapters`, `suppliers`, `system-users`, `utility-types` | 1 relazione FK singola e/o validators custom (CF/P.IVA/CAP in `suppliers`), many-to-many doppio multiselect in `utility-types` |
| C | `consip-agreement`, `utilizer-grant` | relazioni FK multiple, datepicker singolo/range, `utilizer-grant` unico uso di `p-checkbox` |
| D | `assets`, `invoices` | colonne dinamiche configurabili + export CSV, relazioni multiple, `assets` ha tabs PrimeNG e sotto-tabelle read-only, `invoices` ha `customSort` manuale e normalizzazione formati numerici IT |
| E | `utilities` | caso estremo: 39 colonne configurabili, 41 campi ricerca, form in 5 `p-fieldset` con campi condizionali per hard-type, 8 relazioni FK, `customSort` manuale, **e l'override `ngAfterViewInit()` che non chiama `super.ngAfterViewInit()`** (rischio già identificato in Fase 1, qui si materializza: senza fix, sort/paginator Material non si agganciano, nessun errore di compilazione, fallimento silenzioso a runtime) |

Ordine di migrazione: **A → B → C → D → E**, dal pattern più semplice al più
complesso, per consolidare il pattern Material su casi via via più ricchi prima di
affrontare `utilities`.

## Scope di questo documento

Questa spec copre l'intera Fase 2 a livello di **design/strategia**. I piani di
implementazione (`writing-plans`) vengono scritti **un gruppo alla volta**, non
tutti insieme: scrivere codice reale per 13 pagine (39+ file) senza averli letti
per intero viola la regola "no placeholder / niente codice a scatola chiusa" di
`writing-plans`. Il primo piano coperto da questo giro (vedi
`docs/superpowers/plans/2026-08-06-primeng-to-material-fase2-groupA.md`) copre:
1. Refactor condiviso di `AbstractSearchComponent` (dialog filtri simmetrico a
   `editDialogComponent()`, fix duplicazione M6 e mutazione per riferimento M7
   segnalate dalla review finale di Fase 1)
2. Le 4 pagine del Gruppo A

I gruppi B-E vengono pianificati singolarmente, in giri successivi, dopo review
del Gruppo A.

## Refactor condiviso: dialog filtri in `AbstractSearchComponent`

Oggi (dopo Fase 1) ogni `search-*.component.ts` migrato duplica la stessa logica
di apertura del dialog filtri (vedi `search-purpose.component.ts`), e il dialog
filtri (`PurposeFilterDialogComponent`) muta direttamente la `FormGroup` del
genitore passata per riferimento — se l'utente chiude il dialog con ESC/backdrop
dopo aver modificato i campi, i valori restano scritti nel form del genitore senza
che la ricerca sia stata effettivamente applicata (comportamento ereditato dal
vecchio `p-dialog`, non introdotto da Fase 1, ma non necessario portarselo dietro
nel nuovo pattern generico).

Nuovo contratto in `AbstractSearchComponent`:
- `abstract filterDialogComponent(): Type<unknown>` — ritorna la classe del dialog
  filtri specifico per pagina (simmetrico a `editDialogComponent()` di
  `AbstractDataTableComponent`)
- `openFilterDialog(): void` — apre `filterDialogComponent()` passando
  `FilterDialogData<V> = {values: V}` (uno snapshot di `this.qSearch.value`, non
  il `FormGroup`), gestisce il risultato:
  - `result === 'clear'` → `this.qSearch.reset(); this.onSearch();`
  - `result` oggetto → `this.qSearch.patchValue(result); this.onSearch();`
  - `result === undefined` (annulla/ESC/backdrop) → nessuna azione
- Il dialog filtri per-pagina costruisce il **proprio** `FormGroup` interno a
  partire da `data.values` (stessa forma di `PurposeEditDialogComponent`, che
  già costruisce un form interno a partire da `data.item` senza mutare l'entità
  originale), chiude con `dialogRef.close(this.form.getRawValue())` su "Applica",
  `dialogRef.close('clear')` su "Pulisci Filtri", nessuna chiamata a `close()` su
  ESC/backdrop (comportamento di default di `MatDialog`, ok).
- `filterDialogVisible` viene **rimosso subito** da `AbstractSearchComponent`
  (stessa scelta già fatta in Fase 1 Task 5 per `editDialogVisible`/
  `deleteDialogVisible`/`restoreDialogVisible` su `AbstractDataTableComponent`:
  rottura intenzionale e immediata delle pagine non ancora migrate, invece di
  tenere in vita un campo morto fino a fine Fase 2). Da questo refactor in poi,
  anche i `search-*.component.html` non ancora migrati (13, tutti tranne
  `purpose`) smettono di compilare — si aggiunge alla rottura già presente sui
  `data-table-*.component.ts` da Fase 1, stessa condizione accettata.

**Convenzione dialog (decisione presa ora, fissa per il resto della Fase 2):**
dialog di edit/create → `templateUrl` esterno (form potenzialmente lunghi,
leggibilità); dialog di filtro e conferma → template inline nel `.ts` (sempre
brevi). Coerente con quanto già fatto in Fase 1 (`PurposeEditDialogComponent`
esterno, `ConfirmDialogComponent`/`PurposeFilterDialogComponent` inline).

## Pattern aggiuntivi necessari da Gruppo B in poi (non nel Gruppo A)

Non implementati in questo giro (Gruppo A non li usa), ma da definire una volta
sola quando servirà (Gruppo B/C/D):
- **Date**: `provideNativeDateAdapter()` + `MAT_DATE_LOCALE: 'it-IT'` in
  `app.config.ts`, formato `dd/mm/yyyy` — necessario da `consip-agreement`
  (Gruppo C) in poi.
- **Checkbox binario**: `mat-checkbox` — necessario da `utilizer-grant`
  (Gruppo C).
- **Fieldset/raggruppamento campi form**: `mat-expansion-panel` (decisione presa,
  non `<fieldset>` nativo, per coerenza visiva con Material) — necessario da
  `assets`/`utilities` (Gruppi D/E).
- **Colonne configurabili + export CSV**: componente riusabile
  `ColumnPickerComponent` (`mat-menu` + `mat-checkbox` per colonna, sostituisce
  `p-multiselect` usato oggi per la selezione colonne) — la logica di
  `exportToCSV`/`loadColumnSelection`/`saveColumnSelection` in
  `AbstractDataTableComponent` resta invariata (già Material-agnostica), cambia
  solo la UI del picker. Necessario da `assets`/`invoices`/`utilities` (Gruppi
  D/E).
- **`mat-form-field` con prefix/suffix** (per `p-inputgroup`, es. campo asset con
  pulsanti azione in `utilities`) — solo Gruppo E.

## Verifica

Stessa metodologia di Fase 1: `tsc --noEmit -p tsconfig.app.json` mirato ai file
del task (gli errori nelle pagine non ancora migrate restano attesi e vanno
ignorati finché non è il loro turno), QA manuale per pagina/gruppo via browser
(stesso stub temporaneo non committato usato in Fase 1 per isolare l'app
compilabile, se necessario). Nessun gate CI automatico fino a fine Fase 2 (nota
comunicata all'utente prima di iniziare).

## Rischi noti riportati dalla ricognizione (da tenere presenti pagina per pagina)

- `invoices`: `console.log` di debug dimenticato nell'entity (`invoice.entity.ts`)
  da rimuovere durante la migrazione (non correlato a Material, pulizia colta
  nel passaggio).
- `utilizer`: import PrimeNG morti (`InputNumberModule`, `CheckboxModule`,
  `DatePickerModule`, `RadioButtonModule`) mai usati nell'HTML, override
  `ngOnInit()` vuoto/ridondante, `entityToPayload` commentato/disabilitato da
  verificare — da ripulire, non da portare 1:1.
- `system-users`: manca lo skeleton loading rispetto al pattern standard delle
  altre pagine (incoerenza preesistente) — da uniformare o documentare come
  scelta esplicita durante la migrazione.
- `maintenance-managers`: piccola incoerenza UI nel bottone modifica/elimina
  rispetto al pattern standard (nasconde "modifica" su riga eliminata invece di
  lasciarlo sempre visibile come le altre pagine) — verificare se intenzionale o
  refuso durante la migrazione.
- `utilities`: **confermare esplicitamente con un test manuale dedicato** (sort
  per colonna + cambio pagina) che `ngAfterViewInit()` chiami
  `super.ngAfterViewInit()` dopo la migrazione — è il rischio più concreto
  dell'intera Fase 2, un fallimento silenzioso senza errore di compilazione.

# Retrofit layout dialog modifica/creazione — da verticale a orizzontale

## Contesto

Durante la migrazione PrimeNG→Angular Material (Fase 2, Gruppi A-E, tutte le pagine ora migrate), ogni dialog di modifica/creazione è stato costretto in `width: '600px'`, hardcoded senza hook di override in `AbstractDataTableComponent.openCreateDialog()`/`openEditDialog()` (`frontend/src/app/core/components/abstract-data-table.component.ts:96,105`). Per starci dentro, tutti i dialog dal Gruppo D in poi usano un layout a 2 colonne verticali (`flex: 1 1 45%`).

Durante la QA manuale del Gruppo E (ultima pagina, `utilities`), l'utente ha chiesto che il form si sviluppi in **orizzontale**, e ha confermato che la richiesta vale per **tutte** le pagine già migrate (Gruppi A-E), non solo `utilities`.

## Decisione

- Larghezza dialog target: **1100–1200px**, layout a **4 colonne**.
- Meccanismo: hook overridabile `editDialogWidth(): string` su `AbstractDataTableComponent`, stesso pattern già esistente per `filterDialogWidth()` su `AbstractSearchComponent`. Default `'1150px'`, usato in `openCreateDialog()` e `openEditDialog()` al posto del valore fisso. Nessuna pagina ha bisogno di override per ora (uniforme su tutte).
- Ogni dialog di modifica/creazione riconvertito da `flex: 1 1 45%` (2 colonne) a `flex: 1 1 21%` circa (4 colonne, con `flex-wrap: wrap` e `gap`), mantenendo i fieldset/gruppi logici già esistenti (es. "Identificazione", "Caratteristiche tecniche" in `utilities`) come contenitori a griglia interna. Campi testuali lunghi (note, specifiche) restano a riga piena (`flex: 1 1 100%`).
- Tabelle annidate larghe (es. Utilizzatori/Utenze in `assets`) restano con `overflow-x: auto` come già stabilito nel Gruppo D — non toccate da questo retrofit, il problema non era la larghezza dialog per loro.

## Pagine coinvolte (14, tutte le già migrate)

Gruppo A: `purpose`, `asset-aggregator`, `maintenance-managers`, `utility-aggregator`, `utilizer`
Gruppo B: `budget-chapters`, `suppliers`, `system-users`, `utility-types`
Gruppo C: `consip-agreement`, `utilizer-grant`
Gruppo D: `assets`, `invoices`
Gruppo E: `utilities`

## Scope esplicitamente escluso

- Non tocca i dialog filtro (`*-filter-dialog.component.*`) — restano come sono, non hanno lo stesso vincolo di larghezza (usano `filterDialogWidth()` già overridabile).
- Non tocca `ConfirmDialogComponent` (350px, dialog di conferma semplici, va bene stretto).
- Non introduce nuovi controlli/campi, è puramente un retrofit di layout CSS/template.

## Rischio

Le pagine dei Gruppi A-D erano già chiuse e review-approvate: questo retrofit le riapre. Ogni pagina toccata va ri-testata a compilazione (`ng build`, non solo `tsc --noEmit` — lezione appresa nel Gruppo D) e, dove il layout cambia sostanzialmente, verificata visivamente.

# Migrazione da PrimeNG ad Angular Material + bump Angular 20→22

Data: 2026-08-06
Branch: dedicato, da creare da `main` (worktree separato da `backup-import-ui`)
PR di riferimento bloccata: #29

## Contesto e motivazione

PR #29 (bump Angular 20→22) è bloccata: dependabot escludeva `@angular/animations`
dal gruppo (transitiva, non dichiarata in `package.json`), e una volta risolto quel
conflitto emerge un blocco più serio — PrimeNG v22 (versione allineata ad Angular 22)
passa a licenza dual Community/Commercial, e la Community license **esclude
esplicitamente** enti pubblici/PA finanziati da tassazione (fonte:
https://primeui.dev/licenses/community). Per il Comune di Montesilvano l'unica
opzione con PrimeNG 22 sarebbe la licenza Commercial ($599/dev perpetua + 1 anno
update). `primeng-lts` non è un'alternativa gratuita: prodotto commerciale a sé,
discontinuato (ultima release 4 anni fa).

Decisione presa (vedi commento su PR #29): non acquistare licenza, migrare via da
PrimeNG verso **Angular Material** (MIT, sempre free, supportato ufficialmente dal
team Angular su ogni major).

Verificato: PrimeNG 20 ha peer-dep rigido `@angular/core: ^20.0.4` — non convive con
Angular 22. Il bump Angular deve quindi avvenire **dopo** la rimozione completa di
PrimeNG dal progetto, non prima e non in parallelo pagina-per-pagina.

## Scope di questo branch

Un'unica PR che copre:
1. Rimozione completa di PrimeNG da tutte le pagine (47 template, 49 file `.ts`) e
   sostituzione con Angular Material.
2. Bump `@angular/*` (incl. `@angular/cli`, `@angular/build`) da `^20.3.0` a `^22.x`,
   con `@angular/animations` dichiarata esplicitamente come dipendenza diretta.
3. Rimozione pacchetti `primeng`, `@primeuix/themes`, `primeicons` da `package.json`.

Fuori scope: cambi funzionali alle pagine (solo swap di libreria UI, comportamento
invariato), redesign visivo oltre a quanto necessario per replicare l'aspetto
attuale con componenti Material.

## Component mapping

| PrimeNG | Angular Material | Note |
|---|---|---|
| `p-table` + `p-sortIcon` + `p-paginator` | `MatTable` + `MatSort` + `MatPaginator` (CDK) | cambio di paradigma: da direttiva dichiarativa a composizione esplicita colonna-per-colonna. Impatta `AbstractDataTableComponent`/`AbstractComponent` (vedi sotto). |
| `p-dialog` `[(visible)]` | `MatDialog` (servizio, `open()` imperativo, componente dialog separato) | refactor di pattern, non solo swap di tag |
| `p-select` | `mat-select` | |
| `p-button` / `pButton` | `mat-button` / `mat-raised-button` | |
| `p-inputtext` / `p-textarea` | `matInput` + `mat-form-field` | |
| `p-toast` + `MessageService` | `MatSnackBar`, dietro un `ToastService` custom con stessa firma (`add({severity, summary, detail, key})`) per minimizzare il diff nei 16 componenti che estendono `AbstractComponent` | |
| `p-skeleton` | CSS custom (Material non ha skeleton nativo) o `mat-progress-bar` indeterminate come fallback | |
| `p-checkbox` / `p-radiobutton` | `mat-checkbox` / `mat-radio-button` | |
| `p-tabs` | `mat-tab-group` | usato in `backup-import` (feature recente) |
| `p-drawer` | `MatSidenav`/`MatDrawer` | |
| `p-tooltip` | `matTooltip` | |
| `p-card` | `mat-card` | |
| `p-fieldset` | `mat-expansion-panel` o fieldset HTML nativo + CSS | |
| `p-tag` / `p-badge` | componente custom leggero (Material non ha equivalente diretto) | |
| PrimeIcons (`pi pi-*`) | `mat-icon` (Material Icons font) | rimappare le icone usate in tutti i template |

## Componenti condivisi da rifattorizzare per primi

`frontend/src/app/core/components/abstract.component.ts` e
`abstract-data-table.component.ts` sono estesi da **tutte e 16** le pagine CRUD
(assets, invoices, suppliers, purpose, ecc.). Vanno rifattorizzati per primi,
preservando la superficie pubblica (`@Input`/`@Output`: `data`, `loading`,
`onSave`/`onDelete`/`onCreate`/`onRestore`, `resetPagingTrigger`,
`editDialogVisible`/`deleteDialogVisible`/`restoreDialogVisible`) così che il
refactor per-pagina successivo tocchi solo `data-table-*.component.ts`/`.html` e
`search-*.component.ts`/`.html`, non le pagine "contenitore" (`purpose.component.ts`
ecc.) né la logica di business (`onSave`, `onDelete`, gestione errori HTTP).

- `AbstractComponent.messageService` (oggi `MessageService` da `primeng/api`) →
  `ToastService` interno basato su `MatSnackBar`, stessa firma `add(...)`.
- `AbstractDataTableComponent.pTable` (oggi `Table` da `primeng/table`,
  `@ViewChild('myTable')`) → sostituito da `MatSort`/`MatPaginator` refs;
  `resetPagingTrigger` continua a esistere come `@Input` ma internamente resetta
  paginator/sort Material invece di chiamare `pTable.reset()`.
- I tre booleani dialog (`editDialogVisible`, `deleteDialogVisible`,
  `restoreDialogVisible`) restano come stato, ma pilotano l'apertura di
  `MatDialog.open(...)` invece del binding `[(visible)]` di PrimeNG.

## Theming

Tema Material custom (M3, `mat.theme()`) per replicare l'attuale palette:
- primary `#030213` (bottone/testo primario), secondary bianco con bordo `#D4D4D4`
- verde `#00C10D` / rosso `#E7000B` per azioni (restore/delete)
- font Inter (già caricato in `styles.scss`, resta)

`styles.scss` va ripulito dalle regole `.p-*`/`p-component`/`p-datatable-*` una volta
completata la rimozione dei rispettivi componenti PrimeNG.

## Ordine di lavoro nella PR

1. Setup: `npm install @angular/material @angular/cdk`, tema custom, `ToastService`
2. Refactor `AbstractComponent` + `AbstractDataTableComponent` (vedi sopra)
3. Pagina pilota `purpose` (list + search + table con 3 dialog: edit/delete/restore)
   come pattern di riferimento per le restanti pagine
4. Resto delle pagine con lo stesso pattern, in ordine di complessità crescente
   (pagine con solo list+search+table prima, pagine con drawer/tabs/upload dopo:
   `backup-import` per ultima, essendo la più recente e meno standard)
5. Rimozione `primeng`, `@primeuix/themes`, `primeicons` da `package.json`;
   pulizia `styles.scss`
6. Bump `@angular/*` (incl. `@angular/cli`/`@angular/build`) a `^22.x`,
   `@angular/animations` esplicita in `package.json`; `ng update` per breaking
   change residui; verifica build

## Verifica

- `npm run build` (prod) verde
- `ng test` (Karma/Jasmine) verde — nessun test e2e frontend esistente da rompere
- QA manuale pagina per pagina (nessun visual regression automatico configurato):
  checklist minima per ciascuna delle 16 pagine CRUD — list carica, ricerca/filtri,
  create, edit, delete, restore, sort colonne, paginazione, export CSV dove presente
- `docker exec` sul container `api`/frontend per allineamento versioni Node/npm
  (vedi CLAUDE.md — build locale può differire da quella richiesta dal progetto)

## Rischi noti

- Refactor pattern dialog (`[(visible)]` → `MatDialog.open()`) è il cambio più
  invasivo: non un semplice swap di tag, tocca la logica di ogni
  `data-table-*.component.ts`.
- Nessun test e2e/visual regression frontend esistente: la verifica di non-
  regressione visiva/funzionale è manuale, pagina per pagina.
- PR grande (47 template): review pesante, ma scelta deliberata (vedi decisione
  utente: PrimeNG rimosso e bump Angular nella stessa PR, non in step incrementali)
  per evitare il periodo di convivenza Material+PrimeNG con peer-dep in conflitto.

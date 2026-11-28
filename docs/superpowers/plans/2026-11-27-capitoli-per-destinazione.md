# Capitoli per destinazione (rilascio a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capitolo dell'utenza ricavato da destinazione di spesa (immobile/impianto) + natura (tipo utenza), con segnalazione delle liquidazioni su altri capitoli.

**Architecture:** Nuovo modulo `apis/spending-destinations/` (anagrafica, funzione pura di derivazione, servizio di ricalcolo in coda come `SupplyReconcileService`). `utilities.budget_chapter_code_fk` resta la colonna letta da tutto il resto, scritta dal ricalcolo con audit di sistema; `chapter_source` dice se è ricavata o a mano. Quote AUTO degli esercizi chiusi congelate.

**Tech Stack:** NestJS 11, TypeORM/MySQL 8, Angular 22 + Material, Jest, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-27-capitoli-per-destinazione-design.md`

## Global Constraints

- Parte da `main` **dopo il merge della PR #461 (v1.61.0)**: usa `HERE`/`monthWindows` di `apis/spending/`.
- Rilascio v1.62.0 (minor: migration). Note `docs/releases/v1.62.0.md`, `publiccode.yml`, guida con data.
- Conflitti e duplicati: sempre 400 con messaggio italiano, mai 409.
- SQL a mano solo in `*.sql.ts` con il motivo nel commento; letture in `*.queries.ts`.
- Scritture del ricalcolo: autore `SYSTEM_USER_ID` (-1), audit sul campo `budget_chapter_code_fk` come in `accounting-import/link-applier.service.ts:105-117`; `update_date` invariata (`update_date: () => '`update_date`'`).
- File sorgente CRLF: modifiche con Edit o Python `newline=''`, mai `sed -i`.
- Migration scritta in scratch e spostata a contenuto finale; verifica `schema:log`.
- Frontend: token colore `--app-*`/`--tone-*`, `ChangeDetectionStrategy.Eager`, schede con `app-entity-sheet`.
- Nuova anomalia: query in fondo a `getAnomalies()`, aggiornare `toHaveBeenCalledTimes` della spec.

## Review Focus

1. Utenza con due immobili di destinazioni diverse → ambigua: capitolo invariato, `MANUAL`, segnalata (Task 3).
2. Destinazione senza capitolo per quella natura e senza capitolo «tutte le nature» → capitolo attuale tenuto, `MANUAL` (Task 3).
3. Etichetta spostata da un capitolo all'altro (rinumerazione) → utenze sul capitolo nuovo, quote AUTO del 2025 invariate (Task 4 int-spec, Task 5).
4. Form utenza che rimanda lo stesso `budget_chapter_code_fk` con `chapter_source = DERIVED` → nessun errore; valore diverso → 400 (Task 7).
5. Immobile, impianto, capitolo o destinazione cancellati → ignorati nella derivazione (Task 3, Task 4).

---

### Task 1: Anagrafica destinazioni + migration

**Files:**
- Create: `backend/src/apis/spending-destinations/{entity/spending-destination.entity.ts, dto/create-spending-destination.dto.ts, dto/update-spending-destination.dto.ts, spending-destinations.service.ts, spending-destinations.controller.ts, spending-destinations.module.ts, spending-destinations.service.spec.ts}` (sul modello di `apis/act-types/`)
- Create: `backend/src/database/migrations/<ts>-SpendingDestinations.ts`
- Modify: entity `asset.entity.ts`, `plant.entity.ts`, `budgetChapter.entity.ts`, `utility.entity.ts`; `app.module.ts`

**Interfaces:**
- Produces: tabella `spending_destinations(id, name varchar(100), notes text null, create/update_date, created/updated_by_user_id, deleted)`; colonne `assets.spending_destination_id int null FK`, `plants.spending_destination_id int null FK`, `budget_chapters.spending_destination_id int null FK`, `budget_chapters.hard_type varchar null` (valori `HardTypeEnum`), `utilities.chapter_source varchar(10) not null default 'MANUAL'`; enum `ChapterSource { DERIVED = 'DERIVED', MANUAL = 'MANUAL' }` in `spending-destinations/chapter-source.enum.ts`.
- API: `GET /spending-destinations` (tutti i ruoli, con conteggi `assets`, `plants`, `chapters`, `utilities`), `POST`/`PATCH /:id`/`DELETE /:id` solo Admin.

- [ ] **Step 1:** Test in `spending-destinations.service.spec.ts`: `create` con nome già usato da una destinazione non cancellata → `BadRequestException('Destinazione già presente')`; `remove` di destinazione usata da immobili/impianti/capitoli → 400 `'Destinazione in uso'`.
- [ ] **Step 2:** `pnpm exec jest src/apis/spending-destinations --maxWorkers=2` → FAIL.
- [ ] **Step 3:** Entity, DTO, service, controller, module; migration (up/down) con le colonne sopra e le FK `ON DELETE SET NULL`.
- [ ] **Step 4:** Test PASS; `docker restart utenzepa-api-1`, riga in `migrations`, `schema:log` senza statement sulle tabelle toccate.
- [ ] **Step 5:** Commit `feat(spending-destinations): add destinations registry`.

### Task 2: Destinazione e natura sul capitolo

**Files:**
- Modify: `backend/src/apis/budget-chapters/dto/*.ts`, `budget-chapters.service.ts`, `budget-chapters.service.spec.ts`

**Interfaces:**
- Consumes: colonne del Task 1.
- Produces: DTO `spending_destination_id?: number | null`, `hard_type?: HardTypeEnum | null`; dopo ogni create/update che cambia uno dei due → `ChapterDerivationService.requestAll()` (Task 4; fino ad allora chiamata assente).

- [ ] **Step 1:** Test: secondo capitolo non cancellato con stessa destinazione e stessa natura → 400 `'Esiste già un capitolo <cod>/<art> per <destinazione> · <natura>'`; stessa destinazione, natura `null` su entrambi → 400; natura diversa → ok.
- [ ] **Step 2:** FAIL. **Step 3:** controllo in `create`/`update` (escluso sé stesso). **Step 4:** PASS. **Step 5:** Commit.

### Task 3: Derivazione pura

**Files:**
- Create: `backend/src/apis/spending-destinations/chapter-derivation.ts`, `chapter-derivation.spec.ts`

**Interfaces:**
- Produces:
```ts
export interface DerivationUtility { id: number; hard_type: HardTypeEnum | null; chapter_id: number | null; source: ChapterSource;
  asset_destinations: number[]; plant_destinations: number[]; plant_asset_destinations: number[] } // solo non cancellati, null esclusi
export interface DerivationChapter { id: number; destination_id: number; hard_type: HardTypeEnum | null }
export type DerivationReason = 'no_destination' | 'ambiguous' | 'no_chapter';
export interface DerivationResult { id: number; destination_id: number | null; chapter_id: number | null; source: ChapterSource; reason: DerivationReason | null }
export function deriveChapters(utilities: DerivationUtility[], chapters: DerivationChapter[]): DerivationResult[];
```
Regola: destinazioni distinte di `asset_destinations`; se vuote, di `plant_destinations`; se vuote, di `plant_asset_destinations`. Primo insieme non vuoto con >1 valore → `ambiguous`; tutti vuoti → `no_destination`. Capitolo = stessa destinazione e `hard_type` uguale, altrimenti stessa destinazione e `hard_type` null, altrimenti `no_chapter`. Ricavato → `{chapter_id, source: DERIVED, reason: null}`; altrimenti `{chapter_id: utility.chapter_id, source: MANUAL, reason}`.

- [ ] **Step 1:** Test `deriveChapters`: (a) immobile dest 1 + capitolo (1, LIGHT) → DERIVED; (b) immobili [1, 2] → MANUAL `ambiguous`, chapter_id invariato; (c) nessun immobile, impianto dest 3 → capitolo di 3; (d) immobile senza dest (array vuoto) + impianto dest 3 → capitolo di 3; (e) impianto senza dest ma su immobile dest 1 → capitolo di 1; (f) dest 1 con solo capitolo `hard_type: null` → quello; (g) dest 1 senza capitoli → MANUAL `no_chapter`; (h) immobile dest 1 e impianto dest 3 → dest 1 (vince l'immobile).
- [ ] **Step 2:** FAIL. **Step 3:** implementa. **Step 4:** PASS. **Step 5:** Commit.

### Task 4: Servizio di ricalcolo

**Files:**
- Create: `spending-destinations/chapter-derivation.queries.ts`, `chapter-derivation.service.ts`, `chapter-derivation.int-spec.ts`
- Modify: `spending-destinations.module.ts` (cron), servizi che salvano asset, plant, utility (collegamenti immobili/impianti), budget chapter, destinazione

**Interfaces:**
- Consumes: `deriveChapters` (Task 3), `CommitmentReconcileService.reconcileUtilities(ids)`, `AuditLogService.record`.
- Produces: `ChapterDerivationService.requestAll(): Promise<void>` (in coda, un giro alla volta, richieste durante un giro → un solo giro dopo), `requestAllSafe(): Promise<void>` (logga, non lancia), `lastResults(): Map<number, DerivationResult>` (per anomalia e scheda; ricalcolato se vuoto). Cron `CHAPTER_DERIVATION_CRON` default `'20 3 * * *'` Europe/Rome + giro all'avvio in background.
- Scrittura: solo righe con `chapter_id` o `source` diversi: `budget_chapter_code_fk`, `chapter_source`, `updated_by_user_id = -1`, `update_date` invariata; audit `utilities`/UPDATE/`budget_chapter_code_fk` (vecchio → nuovo) solo se cambia il capitolo; poi `reconcileUtilities(changedIds)`.

- [ ] **Step 1:** int-spec: immobile con dest D, capitoli C1 (D, LIGHT) e C2; utenza luce su C2 collegata all'immobile → dopo `requestAll()` capitolo C1, `chapter_source = 'DERIVED'`, una riga `audit_logs` con `user_id = -1`; spostata l'etichetta da C1 a C3 → utenza su C3; immobile cancellato → utenza resta su C3 ma `MANUAL`.
- [ ] **Step 2:** `docker exec -e MYSQL_DB=utenzepa_it utenzepa-api-1 pnpm run test:int src/apis/spending-destinations` → FAIL.
- [ ] **Step 3:** queries (QueryBuilder, `deleted = 0` su utenze, immobili, impianti, capitoli, destinazioni), service, cron, chiamate `requestAllSafe()` dopo i salvataggi elencati.
- [ ] **Step 4:** PASS. **Step 5:** Commit.

### Task 5: Esercizi chiusi congelati

**Files:**
- Modify: `backend/src/apis/budget-commitments/commitment-reconcile.service.ts:150-200`, spec del service

**Interfaces:**
- Produces: in `run()`, fattura con `year < anno corrente (Europe/Rome)` e quota AUTO esistente → la quota entra in `fixed` dell'allocazione (consuma la rimanenza) e non viene né tolta né riscritta. Fattura di esercizio chiuso senza quota → allocata come oggi.

- [ ] **Step 1:** Test: fattura 2025 con quota AUTO su impegno A, capitolo dell'utenza cambiato (impegno candidato B) → dopo `reconcileContracts` quota invariata, nessun `dropAutoShare`; fattura 2026 nella stessa situazione → quota su B; fattura 2025 senza quota → riceve quota.
- [ ] **Step 2:** FAIL. **Step 3:** implementa (`now` iniettabile come in `SupplyReconcileService`). **Step 4:** PASS. **Step 5:** Commit.

### Task 6: Import contabilità senza capitolo delle utenze + anomalie

**Files:**
- Modify: `accounting-import/link-applier.service.ts` (via `planUtilityChapters` e scrittura), spec; `anomalies/anomalies.sql.ts` (nuove `utilitiesPaidOnOtherChapters`, via `utilityChapterAmbiguous`), `anomalies.service.ts`, spec e int-spec; frontend `core/services/anomalies.service.ts`, `pages/utilities/utilities-filters.ts`

**Interfaces:**
- Produces: anomalie `utilities_paid_on_other_chapters: {id, utility_id, chapters: string, amount: number}` (ultimi 365 giorni, righe di fatture valide non `OFFSET`, importo = riga × quote su capitoli ≠ capitolo dell'utenza / quote totali, solo importi > 1 €) e `utilities_destination_missing: {id, utility_id, reason: DerivationReason}` (utenze attive con `chapter_source = MANUAL`, da `ChapterDerivationService.lastResults()`); `accounting_utility_chapter_ambiguous` rimossa (backend e frontend). Segnalazioni nell'elenco utenze: «Pagate su altri capitoli», «Senza destinazione».

- [ ] **Step 1:** Test link-applier: nessuna scrittura su `utilities` anche con un solo capitolo liquidato. int-spec anomalie: utenza su C1 con fattura liquidata su impegno di C2 → in `utilities_paid_on_other_chapters` con `chapters: 'C2'`.
- [ ] **Step 2:** FAIL. **Step 3:** implementa. **Step 4:** PASS, `ng build`. **Step 5:** Commit.

### Task 7: Utenza: capitolo in sola lettura e spiegazione

**Files:**
- Modify: `utility/utility.service.ts:875-895`, controller, spec; frontend `pages/utilities/utility-edit-dialog.component.ts` (+ html), `entity/utility.entity.ts`, `utility.service.ts`
- Create: `spending-destinations/chapter-info.ts` (+ spec)

**Interfaces:**
- Produces: `GET /utilities/:id/chapter-info` → `{source: ChapterSource, reason: DerivationReason | null, destination: {id, name} | null, via: {kind: 'asset' | 'plant', id, label} | null, chapter_label: string | null, paid_elsewhere: {chapter_label: string, amount: number, months: string[]}[]}` (ultimi 12 mesi, `monthWindows` di v1.61.0). Update con `chapter_source = DERIVED` e `budget_chapter_code_fk` diverso dall'attuale → 400 `'Capitolo ricavato dalla destinazione: modificare la destinazione dell'immobile o dell'impianto'`.
- UI: campo Capitolo disabilitato se DERIVED, sotto «da <destinazione> (<immobile/impianto>), <natura>» oppure «a mano: <motivo>»; riga «Pagata anche su 12331/2: gen–mar 2026 (1.234,56 €)» con `formatMonths`.

- [ ] **Step 1:** Test service: PATCH con stesso capitolo e DERIVED → ok; diverso → 400; MANUAL diverso → ok. Spec `chapter-info.ts` (raggruppamento per capitolo e mesi).
- [ ] **Step 2:** FAIL. **Step 3:** implementa. **Step 4:** PASS, `ng build`. **Step 5:** Commit.

### Task 8: Frontend destinazioni, immobili, impianti, capitoli

**Files:**
- Create: `frontend/src/app/pages/spending-destinations/spending-destinations.component.ts` (sul modello di `pages/act-types/act-types.component.ts`), service; rotta + voce in `comp/sidebar/sidebar.component.ts` (Impostazioni, solo Admin in modifica)
- Modify: `pages/assets/asset-edit-dialog.component.{ts,html}`, `pages/plants/plant-edit-dialog.component.{ts,html}`, `pages/budget-chapters/budget-chapter-edit-dialog.component.{ts,html}`; backend DTO asset/plant con `spending_destination_id`
- Backend: `GET /spending-destinations/suggestions` → `{asset_id, label, destination_id, utilities}[]` (immobili senza destinazione: destinazione più frequente tra i capitoli attuali delle loro utenze, a pari merito nessuna proposta); `POST /spending-destinations/:id/assets` `{asset_ids: number[]}` (Admin/Operatore) → assegna e `requestAll()`.

- [ ] **Step 1:** Test service backend delle proposte (pari merito → esclusa) e dell'assegnazione (audit sull'immobile).
- [ ] **Step 2:** FAIL. **Step 3:** backend + pagina (elenco con conteggi; tab «Da battezzare» con proposte, selezione multipla, «Assegna»), campi `app-filterable-select` «Destinazione di spesa» nelle tre schede, «Natura» nella scheda capitolo.
- [ ] **Step 4:** PASS, `ng build`, verifica Playwright: assegna destinazione a un immobile → la scheda utenza mostra il capitolo ricavato.
- [ ] **Step 5:** Commit.

### Task 9: Documentazione e rilascio

**Files:**
- Modify: `frontend/public/guida/guida.md` (sezione destinazioni, campo capitolo dell'utenza, segnalazioni; data in testa), `CLAUDE.md` (Dominio: capitoli per destinazione, import contabilità non scrive più il capitolo, esercizi chiusi congelati), `publiccode.yml` (v1.62.0), `docs/roadmap-patrimonio.md` (voce fabbisogno capitoli = rilascio b)
- Create: `docs/releases/v1.62.0.md` (Aggiornamento: migration; dopo l'aggiornamento assegnare le destinazioni dalla pagina, finché non c'è nulla le utenze tengono il capitolo attuale)

- [ ] **Step 1:** `node scripts/check-guida.mjs` nel container frontend → ok.
- [ ] **Step 2:** Commit, PR.

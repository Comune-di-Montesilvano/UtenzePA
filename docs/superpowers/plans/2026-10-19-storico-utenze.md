# Storico di attivazione e intestazione delle utenze — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** storico unico per utenza di attivazioni, cessazioni, volture e reintestazioni, con cambiamenti in sospeso, decisione per utenza sui contratti immobiliari e stato «A carico di» ricavato dallo storico.

**Architecture:** due tabelle nuove (`utility_supply_events`, `utilizer_grant_utility_decisions`) in un modulo `apis/utility-supply/`. La logica sta in funzioni pure (`supply-state.ts`: stato in un giorno; `supply-reconcile.ts`: cosa creare/annullare dato contratti, decisioni ed eventi) chiamate da un solo `SupplyReconcileService.reconcile(utilityId)`, che scrive le righe automatiche e **ricalcola le colonne di stato salvate su `utilities`** (`supply_active`, `activated_on`, `ceased_on`, `transferred_to_third_party_id`, `transferred_on`, nuova `cost_status`, nuova `pending_since`). Così le ~20 query esistenti su `u.supply_active` non cambiano e `costStatusSql` diventa un confronto sulla colonna. Il ricalcolo gira a ogni modifica (evento, decisione, contratto immobiliare, immobili dell'utenza), all'avvio e ogni notte.

**Tech Stack:** NestJS 11, TypeORM (MySQL 8), jest; Angular 22 + Material standalone.

**Spec:** `docs/superpowers/specs/2026-10-19-storico-utenze-design.md`

## Global Constraints

- Branch `feat/storico-utenze` da `main`; un solo PR; release **minor v1.33.0** (`publiccode.yml` `softwareVersion`/`releaseDate`) perché c'è una migration.
- Sorgenti con CRLF: modifiche via script Python che preserva `\r\n` (CLAUDE.md, docker-windows.md). File nuovi: CRLF come i vicini.
- jest sempre `--maxWorkers=2`, solo i file toccati: `MSYS_NO_PATHCONV=1 docker exec utenzepa-api-1 pnpm exec jest <path> --maxWorkers=2` (container `utenzepa-api-1`, cwd `/usr/src/app`). Suite intera = CI.
- Migration scritta in scratch path e spostata in `backend/src/database/migrations/` solo a contenuto finale; poi verifica riga in `migrations`, altrimenti `docker restart utenzepa-api-1`. `schema:log` senza statement sulle tabelle toccate.
- Colonne stringa nullable: `type: 'varchar'` esplicito. Mai `undefined` in where object-criteria (`invalidWhereValuesBehavior: 'throw'`).
- Date `'AAAA-MM-GG'`: backend `@DateOnly()` nei DTO; frontend `toIsoDate`/`new Date(y, m-1, d)`, mai `toISOString()`.
- Errori di validazione: **400** con messaggio per la UI (mai 409).
- Scritture di sistema (ricalcolo colonne di stato): `utilityRepo.update(..., { update_date: () => '`update_date`' })`, niente audit (come `ConsumptionRecalcService`).
- Nuove query di anomalia **in fondo** a `getAnomalies()` (lo spec usa mock posizionali).
- Tolleranza fatture fuori periodo: **30 giorni** dopo ogni cessazione e prima di ogni attivazione. Finestra anomalie fatture: **ultimi 12 mesi**.
- Testi utente in italiano; nessun dato personale reale in test, commit, doc.
- Guida operatori `frontend/public/guida/guida.md` aggiornata nella stessa PR, data in testa; `pnpm run build` esegue `scripts/check-guida.mjs`.
- Mai `git add .`/`-A`: file elencati.

## Review Focus

1. Utenza con evento effettivo **retrodatato** prima di uno esistente (inserimento storico a mano): lo stato di oggi e `activated_on`/`ceased_on` seguono l'ordine per data effettiva, non per inserimento → test in Task 2 (`stateAt` con righe fuori ordine).
2. Contratto «In corso» con `end_date` passata e **rinnovo tacito**: resta attivo (nessun `RETURN`) → test in Task 3 (`isGrantActive` con `tacit_renewal`).
3. Riconciliazione **idempotente**: chiamarla due volte non duplica `TRANSFER`/`RETURN` in sospeso né decisioni → test in Task 3 (`planReconcile` su stato già allineato = nessuna azione) e Task 4 (due `reconcile` di fila).
4. Riga fattura **senza periodo** su utenza cessata «data non nota»: nessuna anomalia → test in Task 7.
5. Utente che salva la scheda utenza dopo la migration con il form vecchio in cache: il PATCH non deve più contenere `supply_active`/`transfer_required` (con `forbidNonWhitelisted` darebbe 400) → `@Exclude({toPlainOnly: true})` sui campi in sola lettura del frontend, verificato in Task 9 (spec del payload).

---

### Task 1: Entity, enum e migration

**Files:**
- Create: `backend/src/apis/utility-supply/entity/utility-supply-event.entity.ts`
- Create: `backend/src/apis/utility-supply/entity/grant-utility-decision.entity.ts`
- Create: `backend/src/apis/utility-supply/enum/supply-event-type.enum.ts`
- Modify: `backend/src/apis/utility/entity/utility.entity.ts` (aggiunge `cost_status`, `pending_since`; rimuove `transfer_required`)
- Modify: `backend/src/apis/utility/cost-status.ts` (enum `CostStatus` + `TO_DECIDE`)
- Create: `backend/src/database/migrations/1794700000000-UtilitySupplyHistory.ts`
- Create: `backend/src/database/migrations-tests/utility-supply-history.migration.spec.ts` (fuori da `migrations/`, QueryRunner simulato)
- Commit anche: `docs/superpowers/specs/2026-10-19-storico-utenze-design.md`, questo piano

**Interfaces:**
- Produces:
  - `enum SupplyEventType { ACTIVATION='ACTIVATION', CESSATION='CESSATION', TRANSFER='TRANSFER', RETURN='RETURN' }`
  - `enum GrantUtilityDecisionValue { FOLLOWS='FOLLOWS', STAYS='STAYS' }`
  - `UtilitySupplyEvent` (`utility_supply_events`): `id`, `utility_id_fk: number`, `type: SupplyEventType`, `third_party_id_fk: number | null` (solo TRANSFER), `requested_on: string | null` (date), `effective_on: string | null` (date), `date_unknown: boolean` (default false), `cancelled_on: string | null` (date), `utilizer_grant_id_fk: number | null`, `notes: string | null` (text), `create_date`, `update_date`, `created_by_user_id`, `updated_by_user_id`, `deleted`; relazioni `utility`, `thirdParty`, `grant`, `created_by`, `updated_by` con `foreignKeyConstraintName` espliciti (`FK_supply_events_*`); indice `IDX_supply_events_utility (utility_id_fk, deleted)`.
  - `GrantUtilityDecision` (`utilizer_grant_utility_decisions`): `id`, `utilizer_grant_id_fk`, `utility_id_fk`, `decision: GrantUtilityDecisionValue | null` (null = da decidere), `third_party_id_fk: number | null` (parte scelta se FOLLOWS), `create_date`, `update_date`, `updated_by_user_id: number | null`; UNIQUE `(utilizer_grant_id_fk, utility_id_fk)`.
  - `Utility.cost_status: CostStatus` (varchar(20), default `'COMUNE'`), `Utility.pending_since: string | null` (date).
  - `CostStatus.TO_DECIDE = 'TO_DECIDE'`.

- [ ] **Step 1: Branch e commit di spec + piano**

```bash
git checkout main && git pull && git checkout -b feat/storico-utenze
git add docs/superpowers/specs/2026-10-19-storico-utenze-design.md docs/superpowers/plans/2026-10-19-storico-utenze.md
git commit -m "docs: spec e piano storico utenze (roadmap voce 22)"
```

- [ ] **Step 2: Entity ed enum** come da Interfaces, sul modello di `budget-commitments/entity/budget-commitment.entity.ts`. Registrare le entity: il glob `src/apis/**/*.entity.ts` le prende da solo.

- [ ] **Step 3: Test della migration (QueryRunner simulato)** in `migrations-tests/utility-supply-history.migration.spec.ts`:
  - `up` su utenza `supply_active=1, activated_on='2025-03-01'` → INSERT `ACTIVATION effective_on='2025-03-01' date_unknown=0`.
  - `supply_active=1, activated_on=NULL` → `ACTIVATION date_unknown=1`.
  - `supply_active=0, ceased_on=NULL` → `ACTIVATION date_unknown=1` + `CESSATION date_unknown=1`.
  - `supply_active=0, ceased_on='2025-07-07', activated_on=NULL` → `ACTIVATION date_unknown=1` + `CESSATION effective_on='2025-07-07'`.
  - `transferred_to_third_party_id=5, transferred_on='2024-01-10'` → `TRANSFER third_party_id_fk=5 effective_on='2024-01-10'` (`transferred_on` NULL → `date_unknown=1`).
  - contratto attivo `direction='ACTIVE'` con `utilities_to_be_taken_over=1` → decisione `NULL` per ogni utenza dei suoi immobili; senza flag → `STAYS`. Attivo = `status='ACTIVE'` e `effectiveEndDate(...) >= oggi` (o null).
  - Prima delle DDL la migration fa SELECT di controllo: utenze con `ceased_on < activated_on` → `throw` con l'elenco degli id.

- [ ] **Step 4: Run** `MSYS_NO_PATHCONV=1 docker exec utenzepa-api-1 pnpm exec jest src/database/migrations-tests/utility-supply-history.migration.spec.ts --maxWorkers=2` → FAIL (migration inesistente).

- [ ] **Step 5: Scrivere la migration** in scratch path (`$TEMP/1794700000000-UtilitySupplyHistory.ts`): CREATE delle due tabelle con FK/indici nominati, `ALTER utilities ADD cost_status varchar(20) NOT NULL DEFAULT 'COMUNE', ADD pending_since date NULL`, conversione dati (Step 3), `DROP COLUMN transfer_required`. `down()`: ripristina `transfer_required` (NULL), drop colonne e tabelle. Statement generati con `migration:generate` (comando in `docs/claude/backend.md`), tenuti solo quelli della feature.

- [ ] **Step 6: Run test** → PASS. Spostare la migration in `backend/src/database/migrations/`, verificare la riga in `migrations` (`docker exec utenzepa-mysql-1 ...`), `schema:log` senza statement su `utilities`, `utility_supply_events`, `utilizer_grant_utility_decisions`. Ciclo up → down → up sul DB locale confrontando `COUNT(*)` per `type` e `supply_active`.

- [ ] **Step 7: Commit** (entity, enum, migration, spec migration, `cost-status.ts`, `utility.entity.ts`): `feat(utility-supply): tabelle storico e decisioni, migration dati`.

---

### Task 2: Stato in un giorno (funzioni pure)

**Files:**
- Create: `backend/src/apis/utility-supply/supply-state.ts`
- Test: `backend/src/apis/utility-supply/supply-state.spec.ts`

**Interfaces:**
- Consumes: `SupplyEventType` (Task 1).
- Produces:
  - `interface SupplyEventLike { id: number; type: SupplyEventType; third_party_id_fk: number | null; requested_on: string | null; effective_on: string | null; date_unknown: boolean; cancelled_on: string | null; deleted: boolean; utilizer_grant_id_fk: number | null; create_date: string }`
  - `stateAt(events: SupplyEventLike[], day: string): { active: boolean; holderId: number | null }`
  - `currentSnapshot(events, today): { supply_active: boolean; activated_on: string | null; ceased_on: string | null; transferred_to_third_party_id: number | null; transferred_on: string | null }`
  - `activeIntervals(events): { start: string | null; end: string | null }[]` (start null = da prima; end null = in corso)
  - `pending(events): SupplyEventLike[]` (non effettivi, non annullati, non cancellati)
  - `validateEvent(candidate, others, today): string | null` (messaggio d'errore o null)
  - `sequenceWarnings(events): string[]` — avvisi non bloccanti, restituiti da `GET .../events` come `{ events, warnings }`: due attivazioni (o cessazioni) effettive di fila → `"Due attivazioni di fila: manca una cessazione?"` (o cessazioni/attivazione); voltura effettiva mentre l'utenza era cessata → `"Voltura registrata su un'utenza cessata."`

- [ ] **Step 1: Test** (`supply-state.spec.ts`):
  - righe `date_unknown` valgono prima di ogni data: `[ACTIVATION unknown]` → `stateAt(...,'1990-01-01').active === true`.
  - nessuna riga effettiva → `active === false`; `ACTIVATION` solo in sospeso → `false`.
  - ordine per `effective_on`, non per `id`: `[CESSATION 2025-07-07 (id 1), ACTIVATION 2025-01-01 (id 2)]` → attiva il `2025-03-01`, non attiva il `2025-08-01`.
  - holder: `[TRANSFER tp=5 2024-01-10, RETURN 2025-02-01]` → `holderId` 5 il `2024-06-01`, `null` il `2025-03-01`.
  - righe con `cancelled_on` o `deleted` ignorate.
  - `currentSnapshot`: `activated_on`/`ceased_on` = date dell'ultimo ACTIVATION/CESSATION effettivo, `null` se `date_unknown`.
  - `activeIntervals([ACTIVATION unknown, CESSATION 2025-07-07, ACTIVATION 2026-01-10])` → `[{start:null,end:'2025-07-07'},{start:'2026-01-10',end:null}]`.
  - `validateEvent`: secondo pending dello stesso tipo → `"C'è già una richiesta in sospeso di questo tipo."`; TRANSFER verso l'holder attuale → `"L'utenza è già intestata a questo soggetto."`; RETURN con holder null → `"L'utenza è già intestata al Comune."`; `effective_on` > oggi → `"La data effettiva non può essere nel futuro."`; `effective_on < requested_on` → `"La data effettiva non può precedere la richiesta."`; TRANSFER senza `third_party_id_fk` → `"Indicare a chi va volturata l'utenza."`. Due ACTIVATION effettive di fila → `null` (accettato) e `sequenceWarnings` contiene `"Due attivazioni di fila: manca una cessazione?"`.

- [ ] **Step 2: Run** jest su `supply-state.spec.ts` → FAIL.
- [ ] **Step 3: Implementare** `supply-state.ts`. Ordinamento: `date_unknown` prima, poi `effective_on`, a parità `id`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(utility-supply): stato dell'utenza in un giorno dallo storico`.

---

### Task 3: Riconciliazione con i contratti (funzione pura)

**Files:**
- Create: `backend/src/apis/utility-supply/supply-reconcile.ts`
- Test: `backend/src/apis/utility-supply/supply-reconcile.spec.ts`

**Interfaces:**
- Consumes: `SupplyEventLike`, `stateAt`, `pending` (Task 2); `effectiveEndDate`, `CalcInput` (`utilizer-grant/real-estate-contract.calc.ts`); `CostStatus` (Task 1).
- Produces:
  - `interface GrantLike extends CalcInput { id: number; start_date: string | null; direction: ContractDirection; utilities_to_be_taken_over: boolean; party_ids: number[]; status_changed_on: string | null }` (`status_changed_on` = `update_date` se lo stato non è `ACTIVE`)
  - `isGrantActive(g: GrantLike, today: string): boolean` = `direction === ACTIVE && status === ACTIVE && (effectiveEndDate(g, today) ?? '9999') >= today`
  - `interface DecisionLike { grant_id: number; decision: GrantUtilityDecisionValue | null; third_party_id: number | null; create_date: string }`
  - `planReconcile(input: { today: string; utilityActive: boolean; grants: GrantLike[]; decisions: DecisionLike[]; events: SupplyEventLike[] }): ReconcilePlan`
  - `interface ReconcilePlan { createDecisions: { grant_id: number; decision: GrantUtilityDecisionValue | null; third_party_id: number | null }[]; createEvents: { type: 'TRANSFER' | 'RETURN'; third_party_id: number | null; grant_id: number }[]; cancelEvents: { id: number; reason: string }[]; costStatus: CostStatus; pendingSince: string | null }`

Regole (dallo spec, sezione «Contratti immobiliari»):
- contratto attivo senza riga decisione → `createDecisions`: copia `FOLLOWS` + parte se l'utenza è intestata a una parte del contratto (rinnovo con la stessa parte), altrimenti `decision: null`.
- obiettivo = parte del contratto attivo `FOLLOWS` con `start_date` più recente (`third_party_id` della decisione, o l'unica parte); nessuno → Comune.
- obiettivo ≠ holder attuale e obiettivo terzo → TRANSFER in sospeso verso l'obiettivo (se non esiste già); annulla gli altri TRANSFER automatici in sospeso (`utilizer_grant_id_fk` non null) e il RETURN automatico.
- obiettivo Comune e holder terzo → RETURN in sospeso collegato al contratto finito o alla decisione `STAYS` (se non esiste); annulla TRANSFER automatici in sospeso con motivo `"Contratto immobiliare non più attivo"` o `"Decisione: resta al Comune"`.
- obiettivo = holder → annulla TRANSFER/RETURN automatici in sospeso.
- utenza non attiva (`utilityActive=false`) → nessuna decisione né evento creato; annulla quelli automatici in sospeso.
- pending manuali (senza contratto) mai toccati.
- `costStatus`: `TO_DECIDE` se una decisione dei contratti attivi è null; poi `TO_TRANSFER` (TRANSFER in sospeso), `TO_RECOVER` (RETURN in sospeso), `TRANSFERRED` (holder terzo), `COMUNE`.
- `pendingSince` = data evento più vecchia tra decisioni null e pending: `max(start_date o end_date o status_changed_on o requested_on, data di creazione della riga)`.

- [ ] **Step 1: Test** (uno per scenario dello spec, nomi in italiano): contratto nuovo → decisione null e `TO_DECIDE`; `FOLLOWS` una parte → TRANSFER in sospeso, `TO_TRANSFER`; rinnovo stessa parte → copia FOLLOWS, nessun evento; controparte diversa → TRANSFER verso la nuova, holder resta la vecchia; fine contratto con utenza volturata → RETURN in sospeso; contratto chiuso con TRANSFER in sospeso → cancel con motivo; `FOLLOWS`→`STAYS` già volturata → RETURN; due contratti FOLLOWS → vince `start_date` più recente; utenza cessata → nessuna azione; `isGrantActive` con `end_date` passata e `tacit_renewal=true, renewal_months=12` → true; **piano su stato già allineato → nessuna azione** (idempotenza); `pendingSince` di una decisione creata oggi su contratto del 2019 = oggi.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implementare.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(utility-supply): regole di riconciliazione con i contratti immobiliari`.

---

### Task 4: Servizio di riconciliazione, CRUD eventi, decisioni, job

**Files:**
- Create: `backend/src/apis/utility-supply/supply-reconcile.service.ts` (+ `.spec.ts`)
- Create: `backend/src/apis/utility-supply/supply-events.service.ts` (+ `.spec.ts`)
- Create: `backend/src/apis/utility-supply/utility-supply.controller.ts`
- Create: `backend/src/apis/utility-supply/dto/create-supply-event.dto.ts`, `update-supply-event.dto.ts`, `set-decision.dto.ts`
- Create: `backend/src/apis/utility-supply/utility-supply.module.ts`
- Modify: `backend/src/app.module.ts` (registra il modulo)

**Interfaces:**
- Consumes: Task 1–3.
- Produces:
  - `SupplyReconcileService.reconcile(utilityId: number, userId?: number): Promise<void>` — legge contratti (SQL su `utility_assets`/`utilizer_grant_assets`/`utilizer_grant`/`utilizer_grant_parties`, immobili non cancellati), decisioni ed eventi; applica `planReconcile` in transazione; scrive su `utilities` le colonne di `currentSnapshot` + `cost_status` + `pending_since` senza toccare `update_date`.
  - `SupplyReconcileService.reconcileMany(utilityIds: number[]): Promise<void>`; `reconcileAll(): Promise<void>` (log del numero di utenze cambiate).
  - `SupplyReconcileService.utilityIdsOfGrant(grantId: number): Promise<number[]>`.
  - `SupplyEventsService` (estende `BaseService`, audit `utility_supply_events`): `listByUtility(utilityId)`, `create(dto, userId)`, `update(id, dto, userId)`, `cancel(id, userId)`, `remove(id, userId)`; ognuna valida con `validateEvent` (400) e chiama `reconcile`.
  - `SupplyEventsService.createInitial(utilityId: number, init: { active: boolean; effective_on?: string | null; requested_on?: string | null }, userId)` — usato da Task 5.
  - Endpoint (JWT, scrittura `@Roles('Admin','Operatore')`):
    - `GET /utility-supply/utilities/:utilityId/events` → `{ events: SupplyEvent[]; warnings: string[] }`
    - `POST /utility-supply/events`, `PATCH /utility-supply/events/:id`, `POST /utility-supply/events/:id/cancel`, `DELETE /utility-supply/events/:id`
    - `GET /utility-supply/grants/:grantId/decisions` → `{ utility_id, decision, third_party_id, proposal: GrantUtilityDecisionValue | null }[]` (`proposal` = FOLLOWS se il contratto ha la spunta)
    - `PUT /utility-supply/grants/:grantId/decisions/:utilityId` body `{ decision, third_party_id? }` (FOLLOWS con più parti senza `third_party_id` → 400 `"Indicare a quale parte va volturata l'utenza."`)
    - `POST /utility-supply/grants/:grantId/decisions/apply-proposal` (decisioni null → proposta)
  - Cron `utility-supply-reconcile` alle `30 3 * * *` Europe/Rome (stesso pattern di `utility-consumptions.module.ts`) + `reconcileAll()` in `onApplicationBootstrap` (copre la migration).

- [ ] **Step 1: Test** `supply-reconcile.service.spec.ts` con repository/`dataSource.query` mockati: applica il piano (insert decisione, insert TRANSFER con `utilizer_grant_id_fk`, update `cancelled_on` + nota con motivo), scrive `utilities` con `update_date: () => '`update_date`'`; **due `reconcile` di fila → al secondo nessun insert**. `supply-events.service.spec.ts`: 400 dai messaggi di `validateEvent`; `create` chiama `reconcile(utility_id)`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implementare** servizi, DTO (`@DateOnly()` su date, `@IsEnum`), controller, modulo (`TypeOrmModule.forFeature([UtilitySupplyEvent, GrantUtilityDecision, Utility])`, `exports: [SupplyReconcileService, SupplyEventsService]`; nessun import di `UtilityModule`/`UtilizerGrantModule`).
- [ ] **Step 4: Run** → PASS. Avvio del container: log di `reconcileAll` senza errori; `SELECT supply_active, COUNT(*) FROM utilities WHERE deleted=0 GROUP BY 1` uguale a prima della migration (493/179 sul DB locale).
- [ ] **Step 5: Commit** `feat(utility-supply): servizio di riconciliazione, API storico e decisioni`.

---

### Task 5: Utenza e contratto immobiliare chiamano la riconciliazione

**Files:**
- Modify: `backend/src/apis/utility/utility.service.ts` (create/update; rimuove `assertTransfer`, `assertLifeDates`, gestione `transferred_*`/`activated_on`/`ceased_on`/`supply_active`)
- Modify: `backend/src/apis/utility/dto/create-utility.dto.ts`, `update-utility.dto.ts` (rimuove `supply_active`, `activated_on`, `ceased_on`, `transferred_to_third_party_id`, `transferred_on`, `transfer_required`; create aggiunge `initial_supply`)
- Modify: `backend/src/apis/utility/utility.module.ts`, `utilizer-grant/utilizer-grant.module.ts` (import `UtilitySupplyModule`)
- Modify: `backend/src/apis/utilizer-grant/utilizer-grant.service.ts` (create/update/remove)
- Test: `utility.service.spec.ts`, `utilizer-grant.service.spec.ts`, `dto/connectivity.dto.spec.ts` (togliere i casi sui campi rimossi)

**Interfaces:**
- Consumes: `SupplyEventsService.createInitial`, `SupplyReconcileService.reconcile`/`reconcileMany`/`utilityIdsOfGrant` (Task 4).
- Produces: `CreateUtilityDto.initial_supply?: { active: boolean; effective_on?: string | null; requested_on?: string | null }` (assente = `{active: true}`, «data non nota»).

- [ ] **Step 1: Test**: `create` chiama `createInitial(id, {active:true})` senza `initial_supply`; con `{active:false, requested_on:'2026-10-01'}` passa il valore; `update` con `asset_ids` cambiati chiama `reconcile(id)`; senza no. Contratto: `update` chiama `reconcileMany` sull'unione delle utenze **prima e dopo** il salvataggio (immobili tolti inclusi); `remove` idem. DTO: `supply_active` nel PATCH → errore di validazione (campo non ammesso).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implementare.** **Step 4: Run** i tre spec → PASS.
- [ ] **Step 5: Commit** `feat(utility-supply): utenze e contratti immobiliari riallineano lo storico`.

---

### Task 6: «A carico di» dalla colonna salvata

**Files:**
- Modify: `backend/src/apis/utility/cost-status.ts` (+ `cost-status.spec.ts`)
- Modify: `backend/src/apis/utility/utility.service.ts` (join per `cost_info`)

**Interfaces:**
- Consumes: `Utility.cost_status`, `pending_since` (Task 1); `GrantUtilityDecision` (Task 1).
- Produces:
  - `costStatusSql(status: CostStatus, alias = 'Utility'): string` = `` `${alias}.cost_status = '${status}'` ``
  - `CostInfo` diventa `{ status: CostStatus; holder: { id: number; name: string } | null; holder_since: string | null; pending: { type: SupplyEventType | 'DECISION'; since: string; days: number } | null; grants: { grant_id: number; name: string; decision: GrantUtilityDecisionValue | null }[] }`
  - `costInfo(utility: CostInput, today: string): CostInfo` dove `CostInput` porta `cost_status`, `pending_since`, `transferred_to_third_party_id`, `transferredTo`, `transferred_on` e i contratti attivi con la decisione.

- [ ] **Step 1: Test** riscritti in `cost-status.spec.ts`: `costStatusSql(TO_DECIDE,'u') === "u.cost_status = 'TO_DECIDE'"`; `costInfo` con `pending_since='2026-09-15'`, oggi `2026-10-19` → `pending.days === 34`; holder dal `transferredTo`.
- [ ] **Step 2–4:** FAIL → implementare (togliere la logica di `transfer_required`/`utilities_to_be_taken_over` da `cost-status.ts`) → PASS insieme a `utility.service.spec.ts`.
- [ ] **Step 5: Commit** `refactor(utility): stato «A carico di» dallo storico`.

---

### Task 7: Anomalie e consumi

**Files:**
- Create: `backend/src/apis/utility-supply/out-of-period.ts` (+ `.spec.ts`)
- Modify: `backend/src/apis/anomalies/anomalies.service.ts` (+ `.spec.ts`)
- Modify: `backend/src/apis/utility-consumptions/consumption-calculator.ts` (`dataGaps`), `utility-consumptions.service.ts:119` (+ spec)

**Interfaces:**
- Consumes: `activeIntervals` (Task 2), `costStatusSql` (Task 6).
- Produces:
  - `outOfPeriod(line: { period_start: string | null; period_end: string | null; invoice_date: string }, events: SupplyEventLike[], toleranceDays = 30): boolean` — periodo della riga (senza periodo: `invoice_date`–`invoice_date`) confrontato con `activeIntervals(events)` allargati di `toleranceDays` dopo ogni fine e prima di ogni inizio datati. Se l'ultimo cambiamento di attività effettivo prima del periodo è una CESSATION «data non nota» → **false** (lo stato non è determinabile, spec: nessuna anomalia).
  - `dataGaps(daily, today, intervals?: { start: string | null; end: string | null }[])`: senza `intervals` invariata; con, i giorni fuori dai periodi attivi non sono buchi.
  - Chiavi anomalie: `invoices_on_ceased_utilities` → **`invoices_outside_supply_periods`** (stessi campi + `period: string | null`); `utilities_to_transfer`, `utilities_to_recover` riscritte su `costStatusSql` con `pending_days: number` nell'item; nuove in fondo: `utilities_to_decide`, `pending_activations`, `pending_cessations` (`UtilityAnomaly` + `pending_days`).

- [ ] **Step 1: Test** `out-of-period.spec.ts` (eventi: ACTIVATION «data non nota» + CESSATION `2025-07-07`): periodo `2025-07-20..2025-08-05` → false (entro 30 giorni); `2025-09-01..2025-09-16` → true (caso 2526); riga senza periodo con `invoice_date` `2025-12-01` → true. Eventi ACTIVATION + CESSATION entrambe «data non nota», riga senza periodo → **false**. Eventi CESSATION `2025-07-07` + ACTIVATION `2026-01-10`, periodo `2025-12-20..2026-01-09` → false (tolleranza prima dell'attivazione); periodo `2025-10-01..2025-10-31` → true. `consumption-calculator.spec.ts`: buco tra due periodi attivi separati da una cessazione non è segnalato. `anomalies.service.spec.ts`: mock posizionali delle nuove query in fondo.
- [ ] **Step 2–4:** FAIL → implementare (fatture: carica righe degli ultimi 12 mesi con utenza ed eventi delle utenze coinvolte, filtra in TS con `outOfPeriod`) → PASS.
- [ ] **Step 5: Commit** `feat(anomalies): fatture fuori dai periodi di attività e pratiche in sospeso`.

---

### Task 8: Frontend — modello, servizio, segnalazioni

**Files:**
- Create: `frontend/src/app/pages/utilities/supply/supply.model.ts`, `supply.service.ts`
- Modify: `frontend/src/app/pages/utilities/entity/utility.entity.ts`, `utility.interface.ts`
- Modify: `frontend/src/app/core/helpers/entity-status.ts` (badge `TO_DECIDE`: tone `warning`, «Da decidere», icona `help`; `TO_RECOVER` → «Da reintestare»)
- Modify: `frontend/src/app/pages/utilities/utilities-filters.ts` (opzione `TO_DECIDE` in `cost_status`; `UTILITY_SIGNALS`: `utilities_to_decide` «Da decidere», `utilities_to_recover` «Da reintestare», `pending_activations` «Attivazioni in sospeso», `pending_cessations` «Cessazioni in sospeso»)
- Modify: `frontend/src/app/pages/invoices/invoices-filters.ts`, `frontend/src/app/core/services/anomalies.service.ts`, `frontend/src/app/pages/dashboard/anomalies-card.component.ts` (chiave e titolo «Fatture fuori dai periodi di attività (ultimi 12 mesi)», nuovi pannelli con «da N giorni»)

**Interfaces:**
- Consumes: endpoint e tipi di Task 4, 6, 7.
- Produces:
  - `SupplyEvent` (`supply.model.ts`): campi di `UtilitySupplyEvent` + `third_party_name: string | null`, `grant_label: string | null`; `SUPPLY_EVENT_LABEL: Record<SupplyEventType, string>` = Attivazione / Cessazione / Voltura / Reintestazione al Comune.
  - `SupplyService` (Authorization a mano, non estende `AbstractService`): `events(utilityId)`, `create(payload)`, `update(id, payload)`, `cancel(id)`, `remove(id)`, `decisions(grantId)`, `setDecision(grantId, utilityId, body)`, `applyProposal(grantId)`.
  - `Utility`: `supply_active`, `activated_on`, `ceased_on`, `transferred_to_third_party_id`, `transferred_on`, `cost_status`, `pending_since` con `@Exclude({toPlainOnly: true})`; `transfer_required` rimosso; `CostInfo` allineato a Task 6.

- [ ] **Step 1:** implementare. **Step 2:** `docker exec utenzepa-frontend-1 pnpm run build` (o log di `ng serve`) senza errori. **Step 3: Commit** `feat(frontend): modello storico utenze, badge e segnalazioni`.

---

### Task 9: Frontend — scheda utenza

**Files:**
- Create: `frontend/src/app/pages/utilities/supply/utility-supply-tab.component.ts`
- Create: `frontend/src/app/pages/utilities/supply/supply-event-dialog.component.ts`
- Modify: `frontend/src/app/pages/utilities/utility-edit-dialog.component.html`, `.ts`

**Interfaces:**
- Consumes: `SupplyService`, `SupplyEvent`, `SUPPLY_EVENT_LABEL` (Task 8).
- Produces: `<app-utility-supply-tab [utilityId] [canEdit] (changed)>` — emette dopo ogni modifica, la scheda ricarica l'utenza (`getById`) e riallinea i controlli `pristine`.

- [ ] **Step 1: Tab «Attivazioni e volture»** (`aria-label="Attivazioni e volture"`, `app-tab-label` icona `swap_horiz`, badge con il numero di pendenti), prima del tab «Storico» (log modifiche): `table.sheet-table` come `utility-invoices-tab` con Tipo, Intestatario, Richiesta, Effettiva («data non nota» se `date_unknown`), Note, Contratto (link `EntityNavigatorService.openGrant`); righe in sospeso con classe di evidenza, annullate barrate con «annullato il …»; sopra la tabella gli eventuali `warnings` (icona `warning`, tono `--tone-*` warning). Azioni (solo `canEdit`): «Nuovo cambiamento», modifica riga, «Annulla» (conferma `ConfirmDialogComponent`), «Elimina» (conferma).
- [ ] **Step 2: Dialog** `SupplyEventDialogComponent` (`MatDialog` 560px, `maxWidth`): tipo (select), intestatario (`app-filterable-select` soggetti terzi, solo voltura), data richiesta, data effettiva, «data non nota» (checkbox, solo attivazione/cessazione), note. Errori 400 mostrati con `ToastService`.
- [ ] **Step 3: Riepilogo**: il riquadro «A carico di» mostra `app-status-badge` + «Attiva» / «Cessata il …», «Intestata a …» (o Comune), «<tipo> in sospeso da N giorni»; tolti select «Voltura», «Volturata a/il», pulsanti «Segna volturata oggi» / «Ripresa dal Comune». Tab «Tecnici e stato»: tolti «Fornitura attiva», «Data attivazione», «Data cessazione» (e `ceasedButActive`).
- [ ] **Step 4: Creazione** (`isNew`): sezione «Fornitura» con «Già attiva» (sì/no, default sì) + «Attiva dal» (facoltativa) oppure «Richiesta il»; inviati come `initial_supply`.
- [ ] **Step 5: Verifica**: build frontend; E2E Playwright dall'host con utente temporaneo (`docs/claude/testing-e2e.md`) su `/utilities?selectedId=2526`: il tab mostra ACTIVATION «data non nota» + CESSATION 07/07/2025; nuova voltura salvata compare in sospeso e il Riepilogo dice «Voltura in sospeso da 0 giorni»; salvataggio della scheda (Note) senza 400 (Review Focus 5). Screenshot in `.playwright-mcp/`. Utente temporaneo eliminato.
- [ ] **Step 6: Commit** `feat(frontend): tab Attivazioni e volture nella scheda utenza`.

---

### Task 10: Frontend — decisioni nel contratto immobiliare

**Files:**
- Modify: `frontend/src/app/pages/utilizer-grant/utilizer-grant-edit-dialog.component.html`, `.ts`

**Interfaces:**
- Consumes: `SupplyService.decisions/setDecision/applyProposal` (Task 8).

- [ ] **Step 1:** tab «Utenze»: colonna «Voltura» con stato (Da decidere / Segue il contratto → <parte> / Resta al Comune) e, se `canEdit` e contratto attivo, select per riga (`[ngModelOptions]="{standalone: true}"`); con più parti, scelta della parte. Pulsante «Conferma la proposta per tutte» se ci sono decisioni null e la spunta è attiva. Righe di `app-linked-table` come campi cache (non getter). Testo `sheet-hint` aggiornato: «Per ogni utenza scegli se segue il contratto (voltura alla controparte) o resta al Comune.» La checkbox «Utenze da volturare» diventa «Proponi la voltura delle utenze».
- [ ] **Step 2: Verifica** E2E su un contratto con la spunta (DB locale): utenze «Da decidere», «Conferma la proposta» → voltura in sospeso visibile nella scheda utenza; segnalazione «Da decidere» si svuota.
- [ ] **Step 3: Commit** `feat(frontend): decisione di voltura per utenza nel contratto immobiliare`.

---

### Task 11: Guida, roadmap, release

**Files:**
- Modify: `frontend/public/guida/guida.md` (data `2026-10-19` o del giorno; sezione nuova «Attivazioni, cessazioni e volture di un'utenza» in Operazioni frequenti; «Eliminare e ripristinare» invariata; Problemi frequenti: «Una fattura risulta fuori dai periodi di attività» con Causa/Soluzione/Apri un ticket se); verificare con `scripts/check-guida.mjs` che le ancore citate esistano
- Modify: `docs/roadmap-patrimonio.md` (voce 22 → fatto v1.33.0; voce 12 aggiornata)
- Modify: `CLAUDE.md` (Dominio → Utenze: «A carico di» ora da `utility_supply_events` + decisioni, colonne di stato ricalcolate da `SupplyReconcileService`, mai scritte dal form; togliere `transfer_required`, `cost-status.ts` gemella SQL)
- Modify: `publiccode.yml` (`v1.33.0`, data)

- [ ] **Step 1:** scrivere. **Step 2:** `pnpm run build` nel frontend (esegue `check-guida.mjs`) → OK. **Step 3: Commit** `docs: guida e roadmap storico utenze (v1.33.0)`.
- [ ] **Step 4:** PR con note di rilascio: migration con dati; dopo il deploy controllare i log di `reconcileAll` e `SELECT cost_status, COUNT(*) FROM utilities WHERE deleted=0 GROUP BY 1`.

---

### Task 12 (dati, DB locale, con conferma dell'utente)

Non è codice. Dopo il merge, sul DB locale: per le cessate 2559, 2581, 2733 proporre all'utente la data effettiva = fine dell'ultimo periodo fatturato (2025-03-17, 2025-03-17, 2024-05-07), e solo dopo conferma impostarla dalla UI (tab «Attivazioni e volture», modifica della CESSATION: togliere «data non nota», nota **«Data stimata dall'ultima fattura»**). Produzione via export + import.

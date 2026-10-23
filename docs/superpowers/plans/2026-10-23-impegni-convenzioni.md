# Impegni contabili veri e scheda convenzione — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Impegni con numero contabile, N-N con i contratti, consumati dalle righe di fattura in ordine di numero sulla competenza effettiva, con rimanenza, maschera e scheda propria; scheda convenzione come le altre; poi import una tantum di impegni e capitoli 2026 sul DB locale.

**Architecture:** Backend NestJS/TypeORM: una migration porta `budget_commitments.contract_id_fk` in una tabella N-N e aggiunge numero strutturato, fornitore, note capitolo e `invoice_lines.commitment_auto`. Il consumo è una funzione pura (`commitment-allocation.ts`) richiamata da un servizio di riconciliazione che riscrive solo le righe automatiche. Frontend Angular: elenco + scheda impegno e scheda convenzione sulla shell `entity-sheet`.

**Tech Stack:** NestJS 11, TypeORM (MySQL 8), Jest; Angular 22 + Material 22 standalone.

**Spec:** `docs/superpowers/specs/2026-10-23-impegni-convenzioni-design.md`

## Global Constraints

- Leggere `CLAUDE.md` e `docs/claude/backend.md`/`frontend.md` prima di iniziare; valgono tutte le regole lì (migration in scratch path, `--maxWorkers=2`, CRLF, `git add` file per file, niente 409, `NOT_REJECTED_SQL` in ogni query su `invoices`, `invalidWhereValuesBehavior='throw'`, date `'AAAA-MM-GG'` locali).
- Lavoro nel worktree `C:\Users\mirko.daddiego\Documents\utenzepa-impegni`, branch `feat/impegni-convenzioni`; lo stack Docker dev va rilanciato da questo worktree (`docker compose up -d`) prima dei test nel container.
- Versione: **v1.47.0** (`publiccode.yml`), migration con timestamp > `1795700000000`.
- Nessun codice di import nel repo: il Task 13 lavora solo nello scratchpad.
- Nessun dato personale in test/doc: nomi fittizi.
- Esercizio di una riga = competenza effettiva (periodo della riga), anno con più giorni, parità = anno di fine; senza periodo = anno della data fattura.
- Consumo: in ordine `commitment_year, commitment_num, commitment_sub` (senza numero dopo, per id); riga intera, mai spezzata; tutti esauriti → ultimo impegno.
- Etichetta numero: `anno/num/sub` sempre con sub (es. `2026/514/1`), `—` se senza numero.
- Testi UI e messaggi d'errore in italiano.

## Review Focus

1. Impegno collegato a 3 contratti → nel capitolo × anno l'impegnato conta l'importo **una volta** (test in Task 6).
2. Riga 15/12/2025–15/01/2026 → esercizio 2025 (17 giorni contro 15); riga senza periodo con fattura del 10/01/2026 → 2026; riga con solo `period_end` → anno di quella data (test in Task 2).
3. Riga scelta a mano non si sposta mai con la riconciliazione, e un impegno con righe manuali non si elimina (test in Task 4 e Task 5).
4. Fatture cancellate o rifiutate SDI non consumano rimanenza (test in Task 4).
5. Impegno con importo `null` = capienza illimitata: le righe ci restano finché esiste, senza passare ai successivi (test in Task 3).

---

### Task 1: Migration e entity

**Files:**
- Create: `backend/src/database/migrations/1795800000000-RealCommitments.ts` (scritta prima in scratch path, vedi `docs/claude/backend.md`)
- Create: `backend/src/apis/budget-commitments/entity/budget-commitment-contract.entity.ts`
- Modify: `backend/src/apis/budget-commitments/entity/budget-commitment.entity.ts`
- Modify: `backend/src/apis/budget-chapters/entity/budgetChapter.entity.ts`
- Modify: `backend/src/apis/invoices/entity/invoice-line.entity.ts`
- Modify: `backend/src/apis/attachments/enum/attachment-entity-type.enum.ts`, `backend/src/apis/attachments/attachments.service.ts` (`OWNERS`)
- Test: `backend/src/database/real-commitments.migration.spec.ts` (fuori da `migrations/`, `QueryRunner` simulato)

**Interfaces:**
- Produces:
  - `budget_commitments`: + `commitment_year INT NULL`, `commitment_num INT NULL`, `commitment_sub INT NULL`, `supplier_id_fk INT NULL` (FK `third_parties`); − `contract_id_fk`, − `commitment_number` (valori non nulli → in testa a `notes` come `"Numero: <valore>"`), − indice `IDX_budget_commitments_contract`; + indice `(commitment_year, commitment_num, commitment_sub)`.
  - `budget_commitment_contracts (commitment_id INT, contract_id INT)`, PK composta, FK verso entrambe, indice su `contract_id`. Entity `BudgetCommitmentContract`; su `BudgetCommitment` relazione `@ManyToMany(() => Contract) @JoinTable({name:'budget_commitment_contracts', joinColumn:{name:'commitment_id'}, inverseJoinColumn:{name:'contract_id'}}) contracts: Contract[]`.
  - `budget_chapters.notes TEXT NULL`.
  - `invoice_lines.commitment_auto TINYINT NOT NULL DEFAULT 1`.
  - `attachments.entity_type` enum + `'consip_agreement'`, `'budget_commitment'`; `AttachmentEntityType.CONSIP_AGREEMENT`, `.BUDGET_COMMITMENT`; `OWNERS`: `{table:'consip_agreement', audit:'consip_agreement', label:'Convenzione'}`, `{table:'budget_commitments', audit:'budget_commitments', label:'Impegno'}`.
- Data move in `up`: SELECT di controllo, `INSERT INTO budget_commitment_contracts SELECT id, contract_id_fk FROM budget_commitments`, poi DDL. `down`: ripristina `contract_id_fk` dal `MIN(contract_id)` di ogni impegno (impegni senza contratti: eliminati nel down, documentarlo nel commento), `commitment_number` da `anno/num/sub`.

- [ ] **Step 1:** test `real-commitments.migration.spec.ts`: `up` esegue l'INSERT nella N-N **prima** del `DROP COLUMN contract_id_fk`; `down` rimette `contract_id_fk` con `MIN(contract_id)`. Assert sull'ordine delle query registrate dal `QueryRunner` finto.
- [ ] **Step 2:** `pnpm exec jest src/database/real-commitments.migration.spec.ts --maxWorkers=2` → FAIL (file assente).
- [ ] **Step 3:** entity + `migration:generate` nel container, tenere solo gli statement della feature, aggiungere il data move a mano; scrivere in scratch path.
- [ ] **Step 4:** test → PASS; spostare in `src/database/migrations/`, verificare la riga in `migrations` (altrimenti `docker restart utenzepa-api-1`); `schema:log` senza statement sulle tabelle toccate; ciclo up → down → up sul DB locale con i 13 impegni attuali (`SELECT COUNT(*) FROM budget_commitment_contracts` = 13 dopo up).
- [ ] **Step 5:** commit `feat: commitments many-to-many with contracts (migration)`.

### Task 2: Esercizio di competenza della riga

**Files:**
- Create: `backend/src/apis/spending/line-year.ts`
- Test: `backend/src/apis/spending/line-year.spec.ts`

**Interfaces:**
- Produces: `lineFiscalYear(periodStart: string | null, periodEnd: string | null, invoiceDate: string): number`; `lineYearSql(alias: { line: string; invoice: string }): string` gemella SQL (stesso risultato; periodi su 3+ anni: confronto solo tra anno di inizio e anno di fine).

- [ ] **Step 1:** test con tabella di casi per `lineFiscalYear`:
  - `('2025-12-15','2026-01-15','2026-02-01')` → `2025`
  - `('2025-12-17','2026-01-15','2026-02-01')` → `2026` (15 contro 15: parità → fine)
  - `(null,null,'2026-01-10')` → `2026`
  - `(null,'2025-12-31','2026-01-20')` → `2025`
  - `('2026-03-01',null,'2026-04-02')` → `2026`
  - per `lineYearSql`: l'espressione usa gli alias passati (`il.period_start`, `il.period_end`, `i.invoice_date`); l'equivalenza con la TS si verifica sul DB nello Step 4.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implementare; SQL: giorni nell'anno di inizio = `DATEDIFF(MAKEDATE(YEAR(s)+1,1), s)`, giorni nell'anno di fine = `DATEDIFF(e, MAKEDATE(YEAR(e),1)) + 1`; inizio se strettamente maggiore.
- [ ] **Step 4:** run → PASS. Verifica a mano sul DB locale: `SELECT <espressione>` con i 5 casi dà gli stessi anni.
- [ ] **Step 5:** commit.

### Task 3: Algoritmo di consumo

**Files:**
- Create: `backend/src/apis/budget-commitments/commitment-allocation.ts`
- Test: `backend/src/apis/budget-commitments/commitment-allocation.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface AllocCommitment { id: number; year: number | null; num: number | null; sub: number | null; amount: number | null }
  export interface AllocLine { id: number; amount: number; date: string; auto: boolean; commitment_id: number | null }
  // Ritorna id riga → id impegno per le sole righe auto (null = nessun impegno nel gruppo).
  export function allocate(commitments: AllocCommitment[], lines: AllocLine[]): Map<number, number | null>
  ```
  Un gruppo = stesso contratto + capitolo + esercizio (lo costruisce il chiamante).

- [ ] **Step 1:** test:
  - impegni A(2026/521/1, 100) e B(2026/1886/1, 50), righe auto da 60, 60, 60 in date crescenti → `[A, A, B]` (la seconda va su A perché A ha ancora 40 > 0; A finisce a −20);
  - tutti esauriti → ultimo impegno (`B`);
  - riga manuale da 90 su A conta: righe auto 20, 20 → A ha rimanenza 10 → 20→A, 20→B;
  - ordine per numero indipendente dall'ordine dell'array e dal campo `id`; impegno senza numero dopo quelli numerati;
  - impegno con `amount: null` prima nell'ordine → tutte le righe auto su di lui;
  - nessun impegno → tutte `null`;
  - righe ordinate per `date` poi `id`.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implementare (pura, nessun I/O).
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5:** commit.

### Task 4: Servizio di riconciliazione

**Files:**
- Create: `backend/src/apis/budget-commitments/commitment-reconcile.service.ts`
- Modify: `backend/src/apis/budget-commitments/budget-commitments.module.ts`
- Test: `backend/src/apis/budget-commitments/commitment-reconcile.service.spec.ts`

**Interfaces:**
- Consumes: `allocate` (Task 3), `lineYearSql` (Task 2).
- Produces: `CommitmentReconcileService` con
  - `reconcileContracts(contractIds: number[]): Promise<void>` — tutti i gruppi di quei contratti;
  - `reconcileAll(): Promise<void>` — a `onApplicationBootstrap` e dopo l'import PEC;
  - `reconcileSafe(contractIds: number[]): Promise<void>` — non lancia, logga (per i chiamanti dopo un salvataggio).
  Serializzato con un flag `running` + coda di id come `SupplyReconcileService`.
- Righe candidate: `invoice_lines` di fatture `deleted = 0` e `NOT_REJECTED_SQL`, con `invoices.contract_id_fk` nei contratti; capitolo = `COALESCE(impegno manuale.chapter, utilities.budget_chapter_code_fk)`; esercizio = `lineYearSql`. Righe senza utenza: gruppo contratto + esercizio su tutti i capitoli; se gli impegni del contratto nell'esercizio hanno più di un capitolo → `null`.
- Scrittura: `UPDATE invoice_lines SET commitment_id_fk = ? WHERE id IN (?) AND commitment_auto = 1` solo dove cambia; nessun tocco a `invoices.update_date`.

- [ ] **Step 1:** test con `dataSource.query` mockato: (a) righe auto riassegnate secondo `allocate`; (b) una riga `commitment_auto = 0` non compare mai negli `UPDATE`; (c) la query delle righe contiene `deleted = 0` e il frammento di `NOT_REJECTED_SQL`; (d) due chiamate concorrenti → la seconda accodata, nessun doppio giro sugli stessi id; (e) contratti senza impegni → `commitment_id_fk = NULL` sulle auto.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implementare.
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5:** commit.

### Task 5: API impegni

**Files:**
- Modify: `backend/src/apis/budget-commitments/budget-commitments.service.ts`, `.controller.ts`, `dto/create-budget-commitment.dto.ts`, `dto/update-budget-commitment.dto.ts`
- Create: `backend/src/apis/budget-commitments/dto/search-budget-commitment.dto.ts`, `backend/src/apis/budget-commitments/commitment-label.ts`
- Test: `backend/src/apis/budget-commitments/budget-commitments.service.spec.ts`

**Interfaces:**
- Consumes: `CommitmentReconcileService.reconcileSafe` (Task 4).
- Produces (REST, ruoli come oggi: scrittura Admin/Operatore, lettura tutti):
  - `GET /commitments?fiscal_year&budget_chapter_id&supplier_id&contract_id&consip_agreement_id&deleted` → `CommitmentRow[]`
  - `GET /commitments/:id` → `CommitmentRow & { contracts: {id, cig_contract, consip_order, supplier}[] }`
  - `POST /commitments`, `PATCH /commitments/:id`, `DELETE /commitments/:id`
  - `GET /commitments/:id/lines` → `{ line_id, invoice_id, invoice_number, invoice_date, period_start, period_end, utility_id, utility_code, amount, auto, progressive }[]` (ordine di consumo)
  - `GET /contracts/:contractId/commitments` resta (stesso `CommitmentRow[]`), `POST /contracts/:contractId/commitments` resta come scorciatoia (crea con `contract_ids: [contractId]`).
  - `CommitmentRow = { id, commitment_year, commitment_num, commitment_sub, label, budget_chapter_id_fk, chapter_label, fiscal_year, amount, spent, remaining, supplier_id_fk, supplier_name, contract_ids: number[], notes }`.
  - DTO: `commitment_year?`, `commitment_num?`, `commitment_sub?` (default 1 se c'è `num`), `budget_chapter_id_fk`, `fiscal_year`, `amount?`, `supplier_id_fk?`, `contract_ids?: number[]`, `notes?`. `commitment_number` rimosso.
  - `commitmentLabel(year, num, sub): string` in `commitment-label.ts` (gemella frontend nel Task 8).
- Regole: numero unico tra non cancellati → 400 `"Impegno 2026/514/1 già presente"`; anno e num entrambi presenti o entrambi assenti → 400; contratti inesistenti/cancellati → 400; DELETE con righe `commitment_auto = 0` su fatture non cancellate → 400 `"Impegno scelto a mano su N righe fattura"`; dopo ogni scrittura `reconcileSafe(contratti vecchi ∪ nuovi)`; audit come oggi più `contract_ids`.

- [ ] **Step 1:** test service: duplicato numero → BadRequest; delete con righe manuali → BadRequest, con sole righe auto → ok e `reconcileSafe` chiamato; update che cambia `contract_ids` → `reconcileSafe` con l'unione; `spent`/`remaining` calcolati (amount 100, righe 30+20 → 50/50; amount null → remaining null); `commitmentLabel(2026,514,1) === '2026/514/1'`, `commitmentLabel(null,null,null) === '—'`.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implementare (spent da righe con `NOT_REJECTED_SQL`, fatture `deleted = 0`).
- [ ] **Step 4:** run → PASS; `pnpm run type-check`.
- [ ] **Step 5:** commit.

### Task 6: Fatture, import PEC, spesa e anomalie sulla N-N

**Files:**
- Modify: `backend/src/apis/invoices/invoice.service.ts` (validazione righe ~279-300, `toRows`, filtro capitoli ~119), `backend/src/apis/invoices/dto/invoice-line.dto.ts`
- Modify: `backend/src/apis/invoice-import/invoice-matcher.service.ts` (`CONTRACT_COMMITMENT_SQL`, `COMMITMENT_SQL`, ~225-272), `invoice-applier.service.ts`, `invoice-import.service` (o dove finisce il giro: chiamare `reconcileAll`)
- Modify: `backend/src/apis/spending/chapter-year.ts`, `backend/src/apis/spending/spending.service.ts` (`YEAR` ~67, query ~90-111, `budgetCheck` ~150-200, ~266-278)
- Modify: `backend/src/apis/anomalies/anomalies.service.ts` (~390-391, ~433, ~720; nuove liste in fondo a `getAnomalies()`)
- Test: spec esistenti di questi file (aggiornare i mock posizionali delle anomalie: query nuove in fondo)

**Interfaces:**
- Consumes: Task 1-5.
- Produces:
  - `InvoiceLineDto.commitment_auto?: boolean` (assente = `true` se `commitment_id_fk` vuoto, `false` se valorizzato dal client); una riga manuale deve avere un impegno che include `invoices.contract_id_fk` (`budget_commitment_contracts`), altrimenti 400 come oggi. Dopo create/update/delete fattura: `reconcileSafe([contract_id_fk])` (anche il vecchio contratto se cambia).
  - Matcher: non sceglie più l'impegno (righe `commitment_id_fk = null`, `auto`); `MISSING_COMMITMENT` solo se **nessun** impegno lega contratto + capitolo + esercizio (`lineFiscalYear` sul periodo estratto); messaggio "più impegni" eliminato.
  - `LINE_YEAR` = `COALESCE(bcm.fiscal_year, <lineYearSql>)`; stessa cosa per `YEAR` in `spending.service.ts` e per `budgetCheck` (`lineFiscalYear`).
  - `COMMITMENTS` senza join al singolo contratto: impegni `deleted = 0`, contati una volta.
  - `ChapterYear` + `remaining: number | null` (somma rimanenze degli impegni con importo).
  - Anomalie nuove (chiavi anche in `frontend/src/app/core/services/anomalies.service.ts`): `commitments_overspent` (rimanenza < 0, esercizio in corso), `commitments_without_contract`, `commitments_without_amount`; ognuna `AnomalyList<{ id, label, chapter, fiscal_year, amount, remaining }>`.
  - Anomalia "Utenze con capitolo non impegnato sul contratto" riscritta su `budget_commitment_contracts`.

- [ ] **Step 1:** test: (a) `chaptersYearSummary` con un impegno da 1000 su 3 contratti → `committed = 1000`; (b) matcher: riga con periodo 2025-12-15/2026-01-15 cerca impegni con `fiscal_year = 2025`; (c) invoice update con riga manuale su impegno non legato al contratto → BadRequest; (d) anomalie: nuove liste presenti e query in coda ai mock.
- [ ] **Step 2:** run degli spec toccati → FAIL.
- [ ] **Step 3:** implementare.
- [ ] **Step 4:** run → PASS (solo i file rilevanti, `--maxWorkers=2`); `pnpm run type-check`; `pnpm run lint` e ripulire il rumore CRLF.
- [ ] **Step 5:** commit.

### Task 7: Convenzione e capitolo, backend

**Files:**
- Modify: `backend/src/apis/consip-agreement/consip-agreement.service.ts`, `.controller.ts`, `dto/*`
- Modify: `backend/src/apis/budget-chapters/` DTO + service (campo `notes`)
- Test: `consip-agreement.service.spec.ts`, `budget-chapters.service.spec.ts`

**Interfaces:**
- Produces:
  - `GET /consip-agreement/:id` → + `contracts: {id, cig_contract, consip_order, supply_start_date, supply_expiry_date, closed}[]`
  - `GET /consip-agreement/:id/commitments` → `CommitmentRow[]` degli impegni legati ad almeno un contratto della convenzione (ciascuno una volta) + `totals: {amount, spent, remaining}`
  - `POST /consip-agreement/:id/contracts/:contractId` e `DELETE …/contracts/:contractId` → imposta/azzera `contracts.consip_agreement_id`, audit sul contratto; contratto di un altro fornitore → 400.
  - `cig_master`: resta `length: 10`, accetta `MANCANTE` come oggi.
  - `budget_chapters.notes` in create/update/find.

- [ ] **Step 1:** test: collega contratto di altro fornitore → BadRequest; `commitments` della convenzione non duplica un impegno legato a 2 suoi contratti; `notes` salvato e restituito.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implementare.
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5:** commit.

### Task 8: Frontend — modello, servizio, elenco impegni

**Files:**
- Create: `frontend/src/app/pages/commitments/commitment.model.ts` (sposta e sostituisce `pages/contracts/commitments/commitment.model.ts`), `commitment.service.ts`, `commitment-label.ts`, `commitments-filters.ts`, `commitments.component.{ts,html}`, `data-table-commitments.component.{ts,html}`
- Modify: `frontend/src/app/app.routes.ts` (`{path: 'commitments', component: CommitmentsComponent}`), `frontend/src/app/comp/sidebar/sidebar.component.ts` (voce "Impegni" accanto a Capitoli/Fatture), `frontend/src/app/core/services/anomalies.service.ts`, `frontend/src/app/pages/guida/guida.ts` (`GUIDA_PER_PAGINA`)
- Test: nessun Karma eseguibile; verifica = `ng build` + Playwright (Task 13)

**Interfaces:**
- Consumes: API del Task 5.
- Produces: `CommitmentService` (estende `AbstractService`): `list(search)`, `getById(id)`, `create`, `update`, `remove`, `lines(id)`, `byContract(contractId)`; `Commitment.toPayload(c)`; `commitmentLabel()` gemella del backend; `COMMITMENT_FILTERS: FilterDef[]` (anno di competenza, capitolo, fornitore, convenzione, contratto, cancellati) e `COMMITMENT_SIGNALS` (`commitments_overspent` "Sforati", `commitments_without_contract` "Senza contratto", `commitments_without_amount` "Senza importo").
- Colonne: numero, capitolo, competenza, fornitore, contratti (conteggio), importo, speso, rimanenza (rossa se < 0 con token `--tone-*`), righe per pagina 25/50/100. `?selectedId=<id>` apre la scheda (Task 9).

- [ ] **Step 1:** implementare; `docker exec utenzepa-frontend-1 sh -c "pnpm exec ng build --configuration production"` → nessun errore.
- [ ] **Step 2:** commit.

### Task 9: Frontend — scheda impegno

**Files:**
- Create: `frontend/src/app/pages/commitments/commitment-sheet.component.{ts,html}`, `commitment-lines-tab.component.ts`
- Modify: `frontend/src/app/core/services/entity-navigator.service.ts` (`openCommitment(id)`, `createCommitment(prefill)`; quello attuale con `contractId` diventa `createCommitment({contract_ids:[contractId]})`), `frontend/src/app/pages/attachments/attachment.model.ts` (`'consip_agreement' | 'budget_commitment'`)
- Delete: `frontend/src/app/pages/contracts/commitments/commitment-edit-dialog.component.ts` (sostituito)
- Modify: `pages/contracts/commitments/contract-commitments-tab.component.ts` (→ `app-linked-table` che apre la scheda), `pages/budget-chapters/spending/budget-chapter-years-tab.component.ts` (impegni dell'anno con rimanenza, apertura scheda), `pages/invoices/invoice-lines-tab.component.ts` + `entity/invoice-line.model.ts` (`commitment_auto`; opzione "Automatico" in testa alla select: sceglie `commitment_auto = true`, `commitment_id_fk = null`; scegliere un impegno → `false`; icona/tooltip "assegnato automaticamente")

**Interfaces:**
- Consumes: Task 8.
- Produces: scheda con tab **Dati** (numero anno/num/sub, capitolo `app-filterable-select` con creazione al volo, competenza, importo, fornitore "solo fornitori", note), **Contratti** (`app-linked-table`, "Scollega" con conferma, crea al volo, opzioni filtrate sul fornitore se valorizzato + id già collegati), **Fatture** (righe in ordine di consumo con speso progressivo e badge auto/manuale), **Documenti** (`app-entity-documents`, `budget_commitment`). Badge header: "Sforato" se rimanenza < 0. Regole CLAUDE.md "Schede entità" (aria-label, `markAllAsTouched` + pallino rosso, campi cache).

- [ ] **Step 1:** implementare; `ng build` → ok.
- [ ] **Step 2:** commit.

### Task 10: Frontend — scheda convenzione e note capitolo

**Files:**
- Create: `frontend/src/app/pages/consip-agreement/consip-agreement-sheet.component.{ts,html}`
- Delete: `frontend/src/app/pages/consip-agreement/consip-agreement-edit-dialog.component.{ts,html}`
- Modify: `consip-agreement.component.ts`, `data-table-consip-agreement.component.ts`, `consip-agreement.service.ts`, `entity/*`; `entity-navigator.service.ts` (`openConsipAgreement(id)`, `createConsipAgreement(prefill)`); `pages/budget-chapters/budget-chapter-edit-dialog.component.{ts,html}` + entity (campo note)

**Interfaces:**
- Consumes: API Task 7.
- Produces: scheda convenzione con tab **Dati** (nome, descrizione, CIG master, fornitore, scadenza, salvaguardia), **Contratti** (`app-linked-table`: numero ordine, CIG derivato, periodo, stato; apri con `openSupplyContract`, collega/scollega con conferma, crea al volo con `createSupplyContract` prefill fornitore + convenzione), **Impegni** (righe `CommitmentRow` + totali, apertura `openCommitment`), **Documenti** (`consip_agreement`). Il campo convenzione nel form contratto apre la scheda (link).

- [ ] **Step 1:** implementare; `ng build` → ok.
- [ ] **Step 2:** commit.

### Task 11: Guida, documentazione, versione

**Files:**
- Modify: `frontend/public/guida/guida.md` (data in testa; sezioni: Impegni — numero, competenza, consumo in ordine di numero, scelta manuale/"Automatico", rimanenza, sforati; Convenzioni — scheda e tab), `frontend/src/app/pages/guida/guida.ts` (ancore delle nuove pagine), `CLAUDE.md` (Dominio: riscrivere il punto impegni su "Fatture" e "Capitoli di spesa"; frontend schede), `docs/roadmap-patrimonio.md` (voce 17 aggiornata; progetto 2 "stima e previsione" come voce nuova), `publiccode.yml` (v1.47.0, data)

- [ ] **Step 1:** scrivere; `docker exec utenzepa-frontend-1 sh -c "node scripts/check-guida.mjs"` → ok.
- [ ] **Step 2:** commit.

### Task 12: Verifica end-to-end e PR

- [ ] **Step 1:** `docker compose up -d` dal worktree; log API senza errori di migration; spec backend toccati verdi (`--maxWorkers=2`, file per file).
- [ ] **Step 2:** utente temporaneo (`docs/claude/testing-e2e.md`), Playwright 1500×950: crea impegno 2026/9001/1 da 100 € su un contratto con fatture del capitolo → rimanenza scende; secondo impegno 2026/9002/1 → le righe in eccesso passano sul secondo; una riga impostata a mano non si sposta dopo modifica importo; scheda convenzione mostra contratti e impegni; elenco impegni con segnalazioni. Screenshot in `.playwright-mcp/`. Pulizia: impegni di test, utente temporaneo, righe `audit_logs` di accesso.
- [ ] **Step 3:** push, PR `feat: real budget commitments, commitment and Consip agreement sheets (v1.47.0)` con note di rilascio (migration che sposta gli impegni esistenti nella N-N). Merge, tag e release solo su ok dell'utente.

### Task 13: Import una tantum sul DB locale (fuori repo)

Sequenza decisa dall'utente: merge e release v1.47.0 → l'utente aggiorna la produzione → esporta un backup di produzione → lo ripristina in locale → solo allora questo task, sul DB che arriva da produzione (poi produzione = export + import come sempre). Rifare le estrazioni di contratti/capitoli/impegni dal DB ripristinato prima di abbinare. Script Python nello scratchpad, `python -I`, letture cp1252 `;`, regole della spec ("Import una tantum"). Nessun file nel repo.

- [ ] **Step 1:** script `capitoli` → report (`capitoli_report.tsv` nello scratchpad): descrizioni da sostituire (vecchia → note), PdC riempiti, capitoli nuovi con tipi utenza proposti, stanziamento/assestato 2026. Mostrare all'utente, attendere ok.
- [ ] **Step 2:** applicare via API (Python `urllib`, utente temporaneo; autore poi riportato a `-1`) o SQL monoriga; verificare in UI la scheda capitolo 2026.
- [ ] **Step 3:** script `impegni` → report: per ogni impegno chiave, capitolo, competenza, importo, fornitore, contratti candidati e passo di abbinamento (1 CIG contratto, 2 CIG convenzione, 3 fornitore + capitolo, 4 nessuno); CIG master proposti per le convenzioni. Mostrare all'utente, attendere ok.
- [ ] **Step 4:** cancellare gli impegni di prova presenti nel DB ripristinato (oggi in locale: 13, contratto 1 e `PROVA-1`; verificare quali ci sono in produzione) (le righe che li usano tornano `auto`), inserire gli impegni, compilare `consip_agreement.cig_master`, `POST /commitments` o SQL + `reconcileAll` (riavvio API).
- [ ] **Step 5:** report di plausibilità per capitolo: speso UtenzePA contro `Importo Defin. − Disponibilità` della contabilità; righe in `docs/claude/data.md` ("Interventi già fatti", 2026-10-xx, senza nominativi).

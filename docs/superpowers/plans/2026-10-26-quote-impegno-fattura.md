# Quote d'impegno della fattura — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** l'impegno passa dalla riga di fattura alla fattura: una quota automatica per tutto l'importo, più quote solo con la divisione a mano (e, dalla fase 3, con l'import della ragioneria).

**Architecture:** nuova tabella `invoice_commitment_shares` (fattura, impegno, annualità, importo, `source`). `CommitmentReconcileService` alloca fatture intere invece di righe; spesa per capitolo, rimanenze e anomalie leggono le quote, con le righe per capitolo dell'utenza solo per le fatture senza quote. Le colonne d'impegno di `invoice_lines` si eliminano con una seconda migration alla fine del backend.

**Tech Stack:** NestJS 11 + TypeORM (MySQL 8), Angular 22 + Material, Jest.

**Spec:** `docs/superpowers/specs/2026-10-25-import-contabilita-design.md`, sezione 3 (fase 2).

## Global Constraints

- Release **v1.49.0** (minor: feature con migration); `publiccode.yml` `softwareVersion`/`releaseDate` nella PR.
- `source` = `AUTO` | `MANUAL` | `ACCOUNTING`; `ACCOUNTING` esiste nell'enum ma in questa fase non lo scrive nessuno.
- Mai quote miste: una fattura ha solo quote `AUTO` (al massimo una) oppure solo `MANUAL`.
- Quota automatica: importo = `COALESCE(invoices.total_amount, SUM(invoice_lines.amount))`.
- Competenza della fattura = `lineFiscalYear(MIN(period_start), MAX(period_end), invoice_date)` sulle righe (`spending/line-year.ts`).
- Fatture rifiutate e cancellate fuori da ogni somma (`NOT_REJECTED_SQL`).
- Scritture del ricalcolo: nessun audit, `update_date` della fattura invariata (si scrive solo `invoice_commitment_shares`).
- Conflitti di validazione = 400 con messaggio italiano (mai 409).
- Migration: scratch path → `src/database/migrations/` a contenuto finale; `schema:log` pulito sulle tabelle toccate; ciclo up → down → up sui dati locali.
- Jest sempre con `--maxWorkers=2`, solo i file toccati; la CI fa da gate.
- Guida aggiornata nella stessa PR con la data in testa; `check-guida.mjs` verde.

## Review Focus

- **Nota di credito (totale negativo) con contratto**: quota automatica negativa sull'impegno della fattura originaria per competenza, la rimanenza sale. Test in Task 1.
- **Fattura senza righe e senza totale** (`total_amount` null, nessuna riga): nessuna quota (importo 0 non ha senso). Test in Task 3.
- **Contratto cambiato in testata** su una fattura con quote a mano di un impegno dell'altro contratto: 400 al salvataggio se le quote restano, il frontend le svuota con avviso. Test in Task 5 (backend) e verifica E2E in Task 8.
- **Annualità inesistente nella quota a mano** (`fiscal_year` non tra le annualità dell'impegno): 400; se omessa = `annualityFor(anni, competenza fattura)`. Test in Task 5.
- **Re-import PEC di una fattura con quote a mano**: le righe si sostituiscono, le quote restano. Test in Task 5.

---

### Task 1: allocazione per fattura (funzione pura)

**Files:**
- Modify: `backend/src/apis/budget-commitments/commitment-allocation.ts` (riscrittura)
- Test: `backend/src/apis/budget-commitments/commitment-allocation.spec.ts` (riscrittura)

**Interfaces:**
- Produces:
  ```ts
  export interface AllocCommitment { id: number; year: number | null; num: number | null; sub: number | null;
    amount: number | null; contract_ids?: number[]; chapter?: number; fiscal_year?: number }   // invariata
  export interface AllocShare { commitment_id: number; fiscal_year: number; amount: number }
  export interface AllocInvoice {
    id: number; date: string; amount: number; contract_id?: number;
    // capitolo unico delle utenze delle righe; 0 = utenza senza capitolo; null = nessuna utenza o capitoli diversi
    chapter?: number | null; year?: number;
    fixed: AllocShare[];          // quote MANUAL/ACCOUNTING: non si spostano, consumano la rimanenza
  }
  export interface AllocTarget { id: number; fiscal_year: number | null }
  export function allocate(commitments: AllocCommitment[], invoices: AllocInvoice[]): Map<number, AllocTarget | null>
  ```
  Ritorna solo le fatture senza `fixed` (id fattura → annualità, null = nessuna quota).

- [ ] **Step 1: test che falliscono** — casi (importi in €):
  - un candidato → `{id, fiscal_year}`;
  - due candidati stesso contratto/capitolo/anno, primo da 100: fatture 60, 60, 60 → primo, primo, secondo (la seconda sfora il primo: va intera);
  - tutti esauriti → l'ultimo;
  - `fixed` su un'annualità ne consuma la rimanenza e la fattura non compare nel risultato;
  - `chapter: null` con candidati su capitoli diversi → null; tutti dello stesso capitolo → il primo;
  - `chapter: 0` → null;
  - candidato di un altro anno o di un altro contratto → escluso;
  - ordine per data poi id, indipendente dall'ordine in input;
  - annualità senza importo non si esaurisce;
  - nota di credito: fattura −50 dopo una da 100 su impegno da 100 → stesso impegno, e la successiva da 40 ci sta.
- [ ] **Step 2:** `docker exec utenzepa-api-1 sh -c "cd /usr/src/app && pnpm exec jest src/apis/budget-commitments/commitment-allocation.spec.ts --maxWorkers=2"` → FAIL.
- [ ] **Step 3:** riscrivere `allocate` sulle fatture: stessa `candidates`/`byNumber`/`unitKey` di oggi, `fixed` sottratte prima, poi fatture senza `fixed` per data e id, target = primo candidato con rimanenza > 0, altrimenti l'ultimo; rimanenza −= `amount`. Commento in testa aggiornato.
- [ ] **Step 4:** stesso comando → PASS.
- [ ] **Step 5:** commit `feat(commitments): allocate whole invoices to commitment annualities`.

### Task 2: tabella delle quote + copia dei dati

**Files:**
- Create: `backend/src/apis/invoices/entity/invoice-commitment-share.entity.ts`
- Create: `backend/src/apis/invoices/entity/commitment-share-source.enum.ts`
- Create: `backend/src/database/migrations/1796000000000-InvoiceCommitmentShares.ts`
- Modify: `backend/src/apis/invoices/entity/invoice.entity.ts` (relazione `commitmentShares`)
- Modify: `backend/src/apis/invoices/invoie.module.ts` (`forFeature`)
- Test: `backend/src/database/commitment-shares.migration.spec.ts` (fuori da `migrations/`, `QueryRunner` simulato come per `CommitmentYears`)

**Interfaces:**
- Produces: entity `InvoiceCommitmentShare` { `id`, `invoice_id_fk`, `commitment_id_fk`, `fiscal_year` (int), `amount` (decimal 12,2, transformer numerico come `InvoiceLine.amount`), `source` (`CommitmentShareSource`), relazioni `invoice` (ManyToOne, `onDelete: CASCADE`) e `commitment` (ManyToOne → `BudgetCommitment`, `RESTRICT`) }; `Invoice.commitmentShares: InvoiceCommitmentShare[]`; `enum CommitmentShareSource { AUTO = 'AUTO', MANUAL = 'MANUAL', ACCOUNTING = 'ACCOUNTING' }`.
- Indice: `(invoice_id_fk)`, `(commitment_id_fk, fiscal_year)`. Nessun unique (più liquidazioni sullo stesso impegno in fase 3).

- [ ] **Step 1: test della migration che fallisce** — `up` esegue, nell'ordine: SELECT di controllo (fatture con righe su più coppie impegno+annualità o miste auto/manuali: se > 0 la migration si ferma con errore che le elenca), `CREATE TABLE`, `INSERT ... SELECT invoice_id_fk, commitment_id_fk, commitment_fiscal_year, IF(MIN(commitment_auto) = 0, 'MANUAL', 'AUTO'), SUM(amount) FROM invoice_lines WHERE commitment_id_fk IS NOT NULL GROUP BY invoice_id_fk, commitment_id_fk, commitment_fiscal_year`; `down` = `DROP TABLE`. Assert sugli SQL in ordine.
- [ ] **Step 2:** jest sul file → FAIL.
- [ ] **Step 3:** entity, enum, relazione, `forFeature`; migration scritta in scratch path con DDL da `migration:generate` (solo gli statement della tabella nuova) + la copia, poi spostata.
- [ ] **Step 4:** jest → PASS; `docker restart utenzepa-api-1`; riga in `migrations` presente; `SELECT source, COUNT(*), SUM(amount) FROM invoice_commitment_shares GROUP BY source` = 4.422 quote in tutto (dati 2026-10-26); `schema:log` senza statement su `invoice_commitment_shares`.
- [ ] **Step 5:** commit `feat(invoices): invoice commitment shares table`.

### Task 3: ricalcolo sulle quote

**Files:**
- Modify: `backend/src/apis/budget-commitments/commitment-reconcile.service.ts`
- Test: `backend/src/apis/budget-commitments/commitment-reconcile.service.spec.ts`

**Interfaces:**
- Consumes: `allocate`, `AllocInvoice` (Task 1); `InvoiceCommitmentShare`, `CommitmentShareSource` (Task 2).
- Produces: API pubblica invariata (`reconcileContracts`, `reconcileSafe`, `reconcileUtilities`, `reconcileAll`).

- [ ] **Step 1: test che falliscono** (mock `dataSource.query` per commento SQL come oggi):
  - `r_invoices` legge per fattura: data, `COALESCE(total_amount, SUM righe)`, contratto, `MIN(period_start)`/`MAX(period_end)`, capitoli distinti delle utenze delle righe, quote fisse (JSON delle `MANUAL`/`ACCOUNTING`), quota `AUTO` attuale;
  - quota automatica cambiata → `r_auto_delete` + `r_auto_insert` solo per quella fattura; invariata → nessuna scrittura;
  - fattura con quote fisse → nessuna scrittura su di lei;
  - fattura senza righe e senza totale → nessuna quota;
  - `r_orphans` cancella le quote `AUTO` delle fatture senza contratto;
  - le quote `MANUAL` di fatture di contratti scollegati contano (come oggi le righe manuali).
- [ ] **Step 2:** jest sul file → FAIL.
- [ ] **Step 3:** sostituire `LINES_SQL`/`WRITE_SQL`/`MANUAL_YEAR_SQL`/`YEARS_SQL`/`ORPHANS_SQL` con le query sulle quote; competenza con `lineFiscalYear`; `chapter` = unico capitolo (0 se null), null se nessuna utenza o più capitoli. `UTILITY_CONTRACTS_SQL` e `CLOSURE_SQL` invariati. Niente più `annualityFor` qui.
- [ ] **Step 4:** jest → PASS; `docker restart utenzepa-api-1`, log senza errori del giro all'avvio; `SELECT COUNT(*) FROM invoice_commitment_shares WHERE source='AUTO'` cresce delle fatture con contratto senza righe (306 attese).
- [ ] **Step 5:** commit `feat(commitments): reconcile invoice shares instead of lines`.

### Task 4: spesa, impegni e anomalie dalle quote

**Files:**
- Modify: `backend/src/apis/spending/chapter-year.ts`, `spending/spending.service.ts`, `spending/dto/budget-check.dto.ts`
- Modify: `backend/src/apis/budget-commitments/budget-commitments.service.ts`, `budget-commitments.controller.ts`
- Modify: `backend/src/apis/anomalies/anomalies.service.ts`
- Test: `chapter-year.spec.ts`, `spending.service.spec.ts`, `budget-commitments.service.spec.ts`, `anomalies.service.spec.ts`

**Interfaces:**
- Produces:
  - `chapter-year.ts`: `CHAPTER_ITEMS` (sostituisce `CHAPTER_LINES`, `LINE_YEAR`, `LINE_CHAPTER`): derivata `ci` con `invoice_id`, `line_id` (null per le quote), `utility_id`, `chapter_id`, `year`, `amount` = quote (capitolo dell'impegno, `fiscal_year`) `UNION ALL` righe delle fatture senza quote (capitolo dell'utenza, `lineYearSql`), già in join con `invoices i` valide. `COMMITMENT_SPENT` = somma delle quote dell'annualità.
  - `ChapterInvoiceLine` diventa `{ id: number; kind: 'share' | 'line'; invoice_id; number; invoice_date; supplier; utility_id; utility_code; year; amount }`.
  - Spesa per utenza/immobile (`spending.service.ts` `YEAR`): solo `lineYearSql`, niente join su impegni.
  - `GET /commitments/:id/invoices` (al posto di `/lines`) → `CommitmentInvoice[]` = `{ share_id, invoice_id, invoice_number, invoice_date, amount, fiscal_year, source: CommitmentShareSource, progressive }`.
  - `BudgetCheckDto`: righe senza `commitment_id_fk`; nuovo `commitment_shares?: { commitment_id_fk: number; fiscal_year?: number | null; amount: number }[] | null` — se presente si raggruppa per capitolo dell'impegno + annualità, altrimenti righe per capitolo dell'utenza + competenza della riga.
  - Anomalia nuova `invoices_shares_mismatch`: fatture valide con quote `MANUAL` la cui somma differisce dal totale di più di 0,01 €; item `{ id, number, total, shares }`.
- [ ] **Step 1: test che falliscono**: SQL di `CHAPTER_ITEMS` con `UNION ALL` e `NOT EXISTS` sulle quote; `COMMITMENT_SPENT` su `invoice_commitment_shares`; `budgetCheck` con `commitment_shares` (capitolo dell'impegno) e senza (capitolo dell'utenza); `remove` dell'impegno bloccato da quote `MANUAL` (messaggio invariato nel senso: «scelto a mano su N fatture»); `MISSING_COMMITMENT` ricontrollata = fattura senza quote; `commitments_check` spent dalle quote; mock posizionale della nuova anomalia in fondo a `getAnomalies()`.
- [ ] **Step 2:** jest sui quattro file → FAIL.
- [ ] **Step 3:** implementare; filtro capitolo di `invoice.service.ts` `findAll` (`budget_chapter_ids`) sulle quote: `EXISTS (SELECT 1 FROM invoice_commitment_shares fs JOIN budget_commitments fc ON fc.id = fs.commitment_id_fk WHERE fs.invoice_id_fk = Invoice.id AND fc.budget_chapter_id_fk IN (...))`.
- [ ] **Step 4:** jest → PASS; `pnpm run type-check` nel container.
- [ ] **Step 5:** commit `feat(spending): chapter spending and commitment balances from invoice shares`.

### Task 5: quote a mano dalla fattura, import PEC

**Files:**
- Create: `backend/src/apis/invoices/dto/invoice-commitment-share.dto.ts`
- Modify: `backend/src/apis/invoices/dto/create-invoice.dto.ts`, `dto/invoice-line.dto.ts`, `invoice.service.ts`
- Modify: `backend/src/apis/invoice-import/invoice-applier.service.ts`
- Delete: `backend/src/apis/invoice-import/kept-commitment.ts`, `kept-commitment.spec.ts`
- Test: `invoice.service.spec.ts`, `invoice-applier.service.spec.ts`

**Interfaces:**
- Consumes: `InvoiceCommitmentShare`, `annualityFor` (`budget-commitments/annuality.ts`), `lineFiscalYear`.
- Produces: `InvoiceCommitmentShareDto { commitment_id_fk: number (IsInt); fiscal_year?: number | null (IsInt); amount: number (IsNumber) }`; `CreateInvoiceDto.commitment_shares?: InvoiceCommitmentShareDto[]` (`ArrayMaxSize(50)`), semantica PATCH: assente = invariate, `[]` = torna automatica (cancella le `MANUAL`), lista = sostituisce con `MANUAL`. Risposta di `findOne`/`findAll` con `commitmentShares` + `commitment` + `commitment.budgetChapter`; righe senza relazione `commitment`.
- [ ] **Step 1: test che falliscono**:
  - quote a mano salvate `MANUAL` con `fiscal_year` dato; omesso → `annualityFor(anni, competenza fattura)`;
  - `fiscal_year` non tra le annualità → 400 «L'impegno X non ha l'esercizio 2027»;
  - impegno di un altro contratto o fattura senza contratto → 400 (messaggi come oggi, riferiti alla quota);
  - `[]` cancella le `MANUAL` e chiama il ricalcolo;
  - audit `commitment_shares` (vecchio e nuovo numero) solo se cambiano;
  - `InvoiceApplier`: righe sostituite, nessuna scrittura su `invoice_commitment_shares`.
- [ ] **Step 2:** jest sui due file → FAIL.
- [ ] **Step 3:** `checkShares` al posto della parte impegni di `checkLines`; scrittura nella stessa transazione; `lineKey` senza impegno; applier senza `keptCommitment`.
- [ ] **Step 4:** jest → PASS.
- [ ] **Step 5:** commit `feat(invoices): manual commitment shares on the invoice`.

### Task 6: via le colonne d'impegno dalle righe

**Files:**
- Create: `backend/src/database/migrations/1796000000001-DropLineCommitment.ts`
- Modify: `backend/src/apis/invoices/entity/invoice-line.entity.ts`
- Modify: eventuali residui trovati con `grep -rn "commitment_id_fk\|commitment_auto\|commitment_fiscal_year" backend/src/apis` (devono restare solo su `invoice_commitment_shares`)

- [ ] **Step 1:** togliere da `InvoiceLine` `commitment_id_fk`, `commitment_auto`, `commitment_fiscal_year` e la relazione `commitment`.
- [ ] **Step 2:** migration (generate → solo FK/indice/colonne di `invoice_lines`) in scratch, poi spostata. `down` ricrea le colonne e rimette su ogni riga impegno e annualità della quota se la fattura ne ha una sola (`commitment_auto = source <> 'MANUAL'`); con più quote righe senza impegno.
- [ ] **Step 3:** `docker restart utenzepa-api-1`; `schema:log` pulito su `invoice_lines` e `invoice_commitment_shares`; ciclo `migration:revert` ×2 → avvio (up) e confronto `SELECT source, COUNT(*), SUM(amount)` uguale prima e dopo.
- [ ] **Step 4:** `pnpm run type-check`, `pnpm run lint` (solo i propri file, CRLF ripuliti con `git diff --numstat`), jest dei file toccati nei Task 1–5.
- [ ] **Step 5:** commit `refactor(invoices): drop commitment columns from invoice lines`.

### Task 7: frontend

**Files:**
- Create: `frontend/src/app/pages/invoices/invoice-commitments-tab.component.ts` (`app-invoice-commitments-tab`)
- Create: `frontend/src/app/pages/invoices/entity/invoice-commitment-share.model.ts`
- Modify: `pages/invoices/entity/invoice-line.model.ts`, `invoice-lines-tab.component.ts`, `invoice-edit-dialog.component.ts` + `.html`, `invoices-filters.ts` (`INVOICE_SIGNALS`)
- Modify: `pages/commitments/commitment.model.ts`, `commitment.service.ts`, `commitment-sheet.component.ts`
- Modify: `pages/budget-chapters/chapter-budget.model.ts`, `budget-chapter-edit-dialog.component.ts`
- Modify: `pages/utilities/utility-invoices-tab.component.ts`

**Interfaces:**
- Consumes: API di Task 4–5.
- Produces: `InvoiceCommitmentShare { id?: number; commitment_id_fk: number; fiscal_year: number | null; amount: number; source?: 'AUTO' | 'MANUAL' | 'ACCOUNTING'; commitment?: CommitmentRef | null }`; `CommitmentInvoice` (gemello di Task 4); `CommitmentService.invoices(id)`.

- [ ] **Step 1:** righe: tolta la colonna impegno (`commitmentValue`, `setCommitment`, `autoHint`, `autoMissing`, `newCommitment`, `AUTO_COMMITMENT`, `isAutoLine`) e `dropForeignCommitments` del dialog.
- [ ] **Step 2:** tab «Impegni» (`aria-label="Impegni"`, contatore = quote) dopo «Righe»:
  - modo **Automatico** (default): riga in sola lettura «Assegnata a <impegno> · comp. <anno> · <importo>», oppure «Nessun impegno del contratto per l'esercizio <anno>» se manca;
  - **Dividi a mano**: tabella con impegno (`app-filterable-select` sulle opzioni impegni già caricate dal dialog, creazione al volo come oggi), annualità (`mat-select` delle annualità dell'impegno, default = `annualityFor` lato client sulla competenza), importo; prima riga precompilata col totale; somma e differenza dal totale sotto la tabella (rossa se ≠ 0);
  - **Torna automatico**: conferma (`ConfirmDialogComponent`), invia `commitment_shares: []`.
  - Cambio di contratto in testata con quote a mano di un altro contratto: quote svuotate + toast warn (come oggi `Impegni tornati automatici`).
- [ ] **Step 3:** payload: `commitment_shares` solo se modificate nel tab (assente altrimenti); `budgetCheck` con `commitment_shares` a mano o `null`.
- [ ] **Step 4:** scheda impegno, tab «Fatture» da `invoices(id)`: colonne fattura, data, competenza, importo, origine («Automatica» / «A mano» / «Ragioneria»); scheda capitolo: `kind` nella tabella fatturato (utenza vuota per le quote); tab fatture dell'utenza: capitolo dalla quota della fattura se unica, altrimenti dall'utenza.
- [ ] **Step 5:** segnalazione `invoices_shares_mismatch` in `INVOICE_SIGNALS` («Quote d'impegno che non tornano col totale»).
- [ ] **Step 6:** `docker exec utenzepa-frontend-1 sh -c "pnpm exec ng build --configuration production"` → nessun errore.
- [ ] **Step 7:** commit `feat(invoices): commitments tab with automatic or manual shares`.

### Task 8: guida, documenti, verifica E2E, release

**Files:**
- Modify: `frontend/public/guida/guida.md` («Registrare una fattura», «Gestire gli impegni di spesa», «Non riesco a eliminare un impegno»; data in testa)
- Modify: `CLAUDE.md` (Dominio → Fatture/Impegni: quote al posto di righe), `publiccode.yml` (v1.49.0), `docs/roadmap-patrimonio.md` voce 26 (fase 2 fatta)

- [ ] **Step 1:** guida: l'impegno è della fattura; automatico = una quota per tutto l'importo, primo impegno per numero con rimanenza; «Dividi a mano»; anomalia nuova; le righe non hanno più l'impegno. `node scripts/check-guida.mjs` verde.
- [ ] **Step 2:** E2E Playwright con utente temporaneo (`docs/claude/testing-e2e.md`): fattura A2A con contratto → tab «Impegni» automatico; divisione a mano 2 quote su due impegni dello stesso contratto (es. contratto 285, 13506/0, 2025) → rimanenze nelle schede impegno; somma sbagliata → segnalazione in elenco fatture; torna automatico; cambio contratto → quote svuotate. Utente e audit di accesso cancellati, dati creati con autore `-1` o ripristinati.
- [ ] **Step 3:** commit `docs: invoice commitment shares (v1.49.0)`; PR solo con l'OK dell'utente.

## Note di rilascio (da riportare nella PR)

- Migration automatiche: le righe con impegno diventano una quota per fattura; poi spariscono le colonne d'impegno delle righe. Nessun dato da sistemare prima.
- Effetto visibile: le fatture con contratto e senza righe (canoni) entrano nella spesa del capitolo e consumano l'impegno.
- Spesa per utenza/immobile: anno = competenza del periodo della riga (prima seguiva l'annualità dell'impegno; uguale in quasi tutti i casi).

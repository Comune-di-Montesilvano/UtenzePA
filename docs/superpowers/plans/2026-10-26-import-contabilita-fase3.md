# Import contabilità – fase 3 (formato neutro, applicatore automatico, caricamento CSV) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Con l'import acceso, tre CSV (capitoli, impegni, liquidazioni) caricati da Impostazioni → Contabilità rendono capitoli, impegni, quote d'impegno delle fatture, contratti degli impegni e capitoli delle utenze uguali alla contabilità, senza interventi a mano.

**Architecture:** Nuovo modulo `backend/src/apis/accounting-import/`. I CSV vanno in tabelle di appoggio `acc_*`: ogni file caricato sostituisce in blocco la sua tabella. Poi una catena di applicatori, uguale per tutti gli enti, porta l'applicazione allo stato della contabilità in quest'ordine: perimetro → capitoli → impegni → fatture → quote → contratti e capitoli delle utenze. Ogni applicatore = funzione pura `*-plan.ts` (testata da sola) + service che scrive. Le scritture sono firmate dall'utente di sistema `-1` con audit. Un interruttore (stato nel DB + variabile d'ambiente) accende le regole; da spento l'ente lavora a mano come oggi.

**Tech Stack:** NestJS 11 + TypeORM (MySQL 8), jest; Angular 22 + Material, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-25-import-contabilita-design.md`: sezioni 2 e 4, «Import (facoltativo)», «Verificato sul DB del Comune» e l'ultima decisione del 2026-10-26, che prevale sul resto della spec dove sono in conflitto.

## Global Constraints

- **La contabilità vince sempre** (import acceso): negli esercizi coperti dal file i dati di capitoli e impegni sono quelli della contabilità; quelli a mano che la contabilità non ha si cancellano.
- **Anno di partenza** (`accounting_import_state.from_year`, impostato dall'Admin nella pagina; per Montesilvano 2023): le righe dei file con anno (`year`, `fiscal_year`) precedente vengono scartate senza segnalarle, e gli anni prima non si toccano mai. Senza anno di partenza il caricamento è rifiutato (400 `'Impostare l'anno di partenza.'`).
- **Esercizi coperti** = anni presenti nel file `capitoli.csv` (per le righe di spesa) e valori di `fiscal_year` di `impegni.csv` (per impegni e annualità), tutti dall'anno di partenza in poi. Gli anni fuori dal file non si toccano mai.
- **Perimetro fornitori** = soggetti terzi non cancellati con almeno un contratto di fornitura non cancellato, la stessa regola dell'import PEC. P.IVA da `vat_number`, altrimenti `tax_code`.
- **Perimetro capitoli** = capitoli già presenti più quelli degli impegni con almeno una liquidazione non annullata verso un fornitore del perimetro. Questi ultimi vengono creati dall'import (`chapter_code`, `article`, `description`).
- Ogni scrittura dell'import è firmata da `SYSTEM_USER_ID = -1` (`system-users/system-user.constants.ts`), con audit sui campi cambiati. Le quote d'impegno non hanno audit né cambiano `update_date` della fattura, come il ricalcolo.
- Collegamenti impegno ↔ contratto: l'import li aggiunge e non toglie mai quelli a mano.
- Mai quote miste sulla stessa fattura: le quote `ACCOUNTING` sostituiscono `AUTO` e `MANUAL`.
- Interruttore: `accounting_import_state.enabled` (default false) + `ACCOUNTING_IMPORT_DISABLED=true` che lo forza spento (default `true` in `.env.example`, come `INVOICE_IMPORT_DISABLED`). Da spento: niente caricamento (400 `'Import contabilità spento.'`), niente sola lettura, nessun cambiamento per l'ente.
- Conflitti e righe non valide = HTTP 400 con messaggio per la UI, mai 409. Colonna stringa nullable: `type: 'varchar'` esplicito. `invalidWhereValuesBehavior = 'throw'`: mai `undefined` in una where. Niente `Array.prototype.at()`.
- Migration nel container, scritta in uno scratch path e spostata a contenuto finale, poi ciclo up → down → up e `schema:log` pulito (`docs/claude/backend.md`).
- Ogni modifica visibile aggiorna `frontend/public/guida/guida.md` nella stessa PR, con la data in testa (`scripts/check-guida.mjs`).
- Nessun dato reale nel repo: test e fixture con numeri e P.IVA fittizi.
- Jest sempre con `--maxWorkers=2` nel container `api` (`/usr/src/app`). Comandi Docker uno alla volta.

## Scelte rispetto alla spec

- `source` su `budget_chapters`, `budget_chapter_spending`, `budget_commitments`, `budget_commitment_years` e `invoices` (per le fatture create dall'import). `external_key` non serve: la chiave è la stessa in contabilità e in UtenzePA (capitolo + articolo + anno; anno/num/sub dell'impegno; IdentificativoSdI oppure P.IVA + numero + data della fattura).

## Tracciato dei CSV (formato neutro)

UTF-8 (BOM tollerato), separatore `;`, prima riga = intestazione con questi nomi, in qualsiasi ordine (colonne in più ignorate). Importi con `.` o `,` decimale, senza separatore delle migliaia, arrotondati al centesimo. Date `AAAA-MM-GG`. Booleani `1`/`0`. Celle vuote = null.

| File | Colonne (obbligatorie in grassetto) |
|---|---|
| `capitoli.csv` | **`year`**, **`chapter`**, **`article`**, `description`, `initial_budget`, `adjusted_budget`, `spent` |
| `impegni.csv` | **`commitment_year`**, **`commitment_num`**, **`commitment_sub`**, **`fiscal_year`**, **`chapter`**, **`article`**, `supplier_vat`, **`amount`**, `cig`, `cancelled`, `description` |
| `liquidazioni.csv` | **`liquidation_key`**, **`commitment_year`**, **`commitment_num`**, **`commitment_sub`**, **`fiscal_year`**, `sdi_identifier`, `invoice_number`, `invoice_date`, `invoice_total`, `invoice_cig`, `supplier_vat`, **`amount`**, `cancelled` |

Righe di `impegni.csv` con lo stesso numero e `fiscal_year` diversi = annualità dello stesso impegno. In `liquidazioni.csv`, per abbinare la fattura servono `sdi_identifier` **oppure** `supplier_vat` + `invoice_number` + `invoice_date`. Per crearla se manca servono anche `invoice_total` e `supplier_vat`.

## Review Focus

1. **Ricarico identico**: nessun record creato o cancellato, nessuna riga di audit. Test in ogni applicatore (Task 5–9).
2. **Anni fuori dal file**: una riga di spesa 2024 a mano, o un impegno a mano con annualità solo 2024, non vengono toccati se il file copre solo 2025–2026. Test in Task 5 e 6.
3. **Liquidazione annullata dopo un giro precedente**: le quote `ACCOUNTING` della fattura spariscono e la fattura torna all'automatico (`reconcileAll`). Test in Task 8.
4. **Fattura creata dall'import e poi arrivata dalla PEC**: l'import PEC la trova (stesso fornitore + numero + data, oppure IdentificativoSdI) e la arricchisce invece di crearne una seconda. Test in Task 7.
5. **Impegno a mano cancellato con quote a mano su fatture non ancora liquidate**: le quote `MANUAL` vanno via insieme all'impegno e quelle fatture tornano all'automatico, invece di bloccare il giro con «impegno non eliminabile». Test in Task 6.

---

### Task 1: Migration, entity, interruttore

**Files:**
- Create: `backend/src/apis/accounting-import/record-source.enum.ts`, `entity/acc-chapter.entity.ts`, `entity/acc-commitment.entity.ts`, `entity/acc-liquidation.entity.ts`, `entity/accounting-import-state.entity.ts`
- Modify: entity di `budget-chapters`, `budget-chapter-spending`, `budget-commitments` (impegno e annualità), `invoices` (colonna `source`)
- Modify: `.env.example` (`ACCOUNTING_IMPORT_DISABLED=true`, commentata come `INVOICE_IMPORT_DISABLED`)
- Create: `backend/src/database/migrations/1796100000000-AccountingImport.ts`

**Interfaces:**
- Produces:
  - `enum RecordSource { MANUAL = 'MANUAL', ACCOUNTING = 'ACCOUNTING' }`, con colonna `source` `varchar(20)` not null default `'MANUAL'` sulle cinque tabelle sopra.
  - `acc_chapters`: `year int`, `chapter varchar(50)`, `article int`, `description varchar(255) null`, `initial_budget`/`adjusted_budget`/`spent decimal(14,2) null`. Indice (`chapter`, `article`, `year`).
  - `acc_commitments`: `commitment_year`/`commitment_num`/`commitment_sub`/`fiscal_year int`, `chapter varchar(50)`, `article int`, `supplier_vat varchar(16) null`, `amount decimal(14,2)`, `cig varchar(20) null`, `cancelled boolean`, `description varchar(255) null`. Indice sul numero.
  - `acc_liquidations`: `liquidation_key varchar(50)`, numero d'impegno + `fiscal_year int`, `sdi_identifier varchar(20) null`, `invoice_number varchar(50) null`, `invoice_date date null`, `invoice_total decimal(14,2) null`, `invoice_cig varchar(20) null`, `supplier_vat varchar(16) null`, `amount decimal(14,2)`, `cancelled boolean`. Indici su `sdi_identifier` e (`supplier_vat`, `invoice_date`).
  - `accounting_import_state` (singleton id 1, come `InvoiceImportState`): `enabled boolean default false`, `from_year int null`, `last_run_at datetime null`, `last_summary json null`, `last_error varchar(500) null`.

- [ ] **Step 1:** scrivere enum, entity e colonne; generare la migration nel container in uno scratch path; tenere solo questi statement, con un `down` che li toglie; spostarla in `src/database/migrations/`.
- [ ] **Step 2:** verificare la riga in `migrations` (se manca, `docker restart utenzepa-api-1`) e `schema:log` senza statement su queste tabelle.
- [ ] **Step 3:** ciclo revert → up. Atteso: `source = 'MANUAL'` su tutte le righe esistenti.
- [ ] **Step 4: Commit** `feat(accounting-import): tabelle di appoggio, source e interruttore`

### Task 2: Parser dei CSV

**Files:**
- Create: `backend/src/apis/accounting-import/accounting-csv.ts`; Test: `accounting-csv.spec.ts`

**Interfaces:**
- Produces: `type AccKind = 'chapters' | 'commitments' | 'liquidations'`; `interface CsvIssue { line: number; message: string }`; `parseAccountingCsv(kind, text): { rows; issues: CsvIssue[] }` con overload tipizzati che restituiscono `AccChapterRow[]` / `AccCommitmentRow[]` / `AccLiquidationRow[]`. Le righe hanno i campi delle entity del Task 1 senza `id` (importi `number`, date `'AAAA-MM-GG'`, booleani `boolean`).

- [ ] **Step 1: test che falliscono**
  - `'intestazione in qualsiasi ordine, colonne in più ignorate'`
  - `'virgola decimale e arrotondamento'`: `'1234,567'` → `1234.57`; `'75.65000000000001'` → `75.65`
  - `'riga con importo non numerico scartata, le altre caricate'`: `issues` = `[{ line: 3, message: expect.stringContaining('amount') }]`
  - `'colonna obbligatoria mancante = zero righe, un issue sulla riga 1'`
  - `'BOM e virgolette'`, `'cancelled vuoto = false'`, `'data non ISO = issue'`
- [ ] **Step 2:** `pnpm exec jest src/apis/accounting-import/accounting-csv.spec.ts --maxWorkers=2`. Atteso: FAIL.
- [ ] **Step 3:** implementare con `csv-parser` (già tra le dipendenze) o con uno split che rispetta le virgolette. Il messaggio di ogni issue nomina la colonna.
- [ ] **Step 4:** rieseguire. Atteso: PASS.
- [ ] **Step 5: Commit** `feat(accounting-import): parser del formato neutro`

### Task 3: Modulo, endpoint, stato, caricamento

**Files:**
- Create: `accounting-import.module.ts`, `accounting-import.controller.ts`, `accounting-import.service.ts`, `dto/update-accounting-import.dto.ts`; Test: `accounting-import.service.spec.ts`
- Modify: registrazione del modulo dove stanno gli altri `apis`

**Interfaces:**
- Produces:
  - `AccountingImportService.isActive(): Promise<boolean>`: `enabled && !forcedOff`. È il segnale che i Task 9 e 10 usano per la sola lettura.
  - `AccountingImportService.run(files: Partial<Record<AccKind, Buffer>>): Promise<AccountingImportSummary>`
  - `AccountingImportService.getStatus(): Promise<AccountingImportStatus>` = `{ enabled, forcedOff, running, lastRunAt, lastError, lastSummary, counts: Record<AccKind, number> }`
  - `AccountingImportSummary` = `{ loaded: Partial<Record<AccKind, number>>; issues: Partial<Record<AccKind, CsvIssue[]>>; steps: Record<string, Record<string, number>> }`. `steps` contiene il risultato di ogni applicatore (Task 4–9) sotto il suo nome.
  - Controller `@Controller('accounting-import')`, `@Roles('Admin')`: `GET status` (comprende `fromYear`); `PATCH` `{ enabled?: boolean; from_year?: number }` (`from_year` intero tra 2000 e l'anno corrente); `POST` multipart `FileFieldsInterceptor([{name:'chapters'},{name:'commitments'},{name:'liquidations'}], { limits: { fileSize: 50 * 1024 * 1024 } })`. Nessun file = 400 `'Nessun file caricato.'`; import spento = 400 `'Import contabilità spento.'`; giro in corso = 400 `'Import contabilità già in corso.'`.
  - Hook pubblico `AccountingImportService.isActive()` esportato dal modulo e iniettabile in `BudgetCommitmentsModule`, `BudgetChapterSpendingModule`, `BudgetChaptersModule` e `InvoicesModule`. Se nasce una dipendenza circolare: `forwardRef`, oppure un piccolo `AccountingStateService` separato che legge solo lo stato.

- [ ] **Step 1: test che falliscono**
  - `'ogni file sostituisce solo la sua tabella'`
  - `'righe con anno prima di from_year scartate prima del caricamento'`: `from_year 2023` e righe 2022 e 2023 → solo la 2023 in tabella, nessun issue
  - `'from_year non impostato = 400'`
  - `'file con soli issue non svuota la tabella'`
  - `'import spento = 400'`, `'giro concorrente = 400'`
  - `'errore in un applicatore: last_error salvato, tabelle acc_* già caricate restano'`
- [ ] **Step 2:** eseguire. Atteso: FAIL.
- [ ] **Step 3:** implementare `run`:
  1. sostituire le tabelle in transazione, a blocchi di 500 righe;
  2. eseguire gli applicatori in ordine: perimetro (T4) → capitoli (T5) → impegni (T6) → fatture (T7) → quote (T8) → contratti e utenze (T9);
  3. `CommitmentReconcileService.reconcileAll()`;
  4. salvare lo stato.
  Un flag in memoria impedisce due giri insieme. Fino ai task successivi `steps` resta vuoto.
- [ ] **Step 4:** rieseguire. Atteso: PASS.
- [ ] **Step 5: Commit** `feat(accounting-import): caricamento CSV, stato e interruttore`

### Task 4: Perimetro

**Files:**
- Create: `scope.ts`; Test: `scope.spec.ts`

**Interfaces:**
- Produces: `computeScope(acc: { commitments: AccCommitmentRow[]; liquidations: AccLiquidationRow[] }, supplierVats: Set<string>, existingChapters: { chapter_code: string; article: number }[]): { chapterKeys: Set<string>; commitmentKeys: Set<string> }`. Chiavi: capitolo `${chapter}/${article}`, impegno `${year}/${num}/${sub}`.

- [ ] **Step 1: test che falliscono**
  - `'capitolo esistente in perimetro anche senza liquidazioni'`
  - `'capitolo nuovo entra solo con una liquidazione non annullata verso un fornitore del perimetro'`
  - `'liquidazione annullata non porta il capitolo'`
  - `'impegni = tutti quelli non annullati sui capitoli del perimetro'`
- [ ] **Step 2–4:** FAIL → implementare la funzione pura → PASS. Il service carica `supplierVats` con la query del perimetro fornitori (Global Constraints).
- [ ] **Step 5: Commit** `feat(accounting-import): perimetro automatico`

### Task 5: Capitoli e spesa per anno

**Files:**
- Create: `chapter-plan.ts`, `chapter-applier.service.ts`; Test: `chapter-plan.spec.ts`, `chapter-applier.service.spec.ts`

**Interfaces:**
- Consumes: `computeScope` (T4).
- Produces:
  - `planChapters(acc: AccChapterRow[], scope, chapters: CurrentChapter[], spending: CurrentSpending[], liquidatedByChapterYear: Map<string, number>): ChapterChange[]`
  - `ChapterChange` = `createChapter` | `createSpending` | `updateSpending` (con `fields` cambiati) | `deleteSpending`
  - `ChapterApplierService.apply(scope): Promise<Record<'chaptersCreated' | 'created' | 'updated' | 'deleted', number>>`

- [ ] **Step 1: test che falliscono**
  - `'capitolo del perimetro assente in UtenzePA = createChapter con descrizione, source ACCOUNTING'`
  - `'anno coperto senza riga = createSpending'`
  - `'riga MANUAL in anno coperto diventa ACCOUNTING con i valori della contabilità'`
  - `'riga a mano in anno coperto per un capitolo che il file non ha in quell anno = deleteSpending'`
  - `'riga di un anno non coperto non toccata'` (Review Focus 2)
  - `'spent vuoto = somma delle liquidazioni del capitolo e anno'`: mappa `{'7:2026' → 6378.97}` → `amount: 6378.97`; `'spent valorizzato vince'`
  - `'ricarico identico = nessuna modifica'`
- [ ] **Step 2–4:** FAIL → implementare (cancellazione logica `deleted = 1`, audit UPDATE e DELETE con `-1`) → PASS.
- [ ] **Step 5: Commit** `feat(accounting-import): capitoli e spesa dalla contabilità`

### Task 6: Impegni e annualità

**Files:**
- Create: `commitment-plan.ts`, `commitment-applier.service.ts`; Test: `commitment-plan.spec.ts`, `commitment-applier.service.spec.ts`

**Interfaces:**
- Consumes: `computeScope` (T4); i capitoli creati dal T5 (ricaricati dal DB per id).
- Produces:
  - `planCommitments(acc: AccCommitmentRow[], scope, coveredYears: Set<number>, chapterIdByKey: Map<string, number>, current: CurrentCommitment[], suppliersByVat: Map<string, number>): CommitmentChange[]`
  - `CurrentCommitment` = `{ id, commitment_year, commitment_num, commitment_sub, budget_chapter_id_fk, supplier_id_fk, source, years: { id, fiscal_year, amount, source }[] }`
  - `CommitmentChange` = `create` | `update` (`fields`, `years.upsert`, `years.delete`) | `delete`
  - `CommitmentApplierService.apply(scope): Promise<Record<'created' | 'updated' | 'deleted', number>>`
  - `commitmentCig(commitmentId): string | null`: serve al Task 9; il CIG si legge da `acc_commitments`, non si salva sull'impegno.

- [ ] **Step 1: test che falliscono**
  - `'più righe con lo stesso numero = un impegno con più annualità'`
  - `'importo dell annualità = amount della contabilità'` (le variazioni sono già applicate nel file)
  - `'impegno nuovo: capitolo dalla chiave, fornitore da P.IVA o CF, null se assente'`
  - `'impegno MANUAL con lo stesso numero diventa ACCOUNTING'`, con capitolo, fornitore e annualità della contabilità
  - `'annualità a mano in anno coperto assente dal file = cancellata'`; `'annualità di un anno non coperto resta'` (Review Focus 2)
  - `'impegno a mano o ACCOUNTING senza riga valida nel file, con tutte le annualità in anni coperti = delete'`; `'riga annullata = delete'`
  - `'ricarico identico = nessuna modifica'`
- [ ] **Step 2:** eseguire. Atteso: FAIL.
- [ ] **Step 3:** implementare. Il `delete` è logico (`deleted = 1`, audit DELETE). Prima del delete si cancellano le quote `MANUAL` e `AUTO` dell'impegno (Review Focus 5, con un test in `commitment-applier.service.spec.ts`). Contratti, note e documenti restano.
- [ ] **Step 4:** rieseguire. Atteso: PASS.
- [ ] **Step 5: Commit** `feat(accounting-import): impegni e annualità dalla contabilità`

### Task 7: Fatture create dal registro e IdentificativoSdI

**Files:**
- Create: `invoice-number.ts`, `invoice-match.ts`, `accounting-invoice.service.ts`
- Test: `invoice-number.spec.ts`, `invoice-match.spec.ts`, `accounting-invoice.service.spec.ts`; Modify: `backend/src/apis/invoice-import/invoice-matcher.service.spec.ts` (Review Focus 4)

**Interfaces:**
- Produces:
  - `normalizeInvoiceNumber(n: string): string`: solo lettere e cifre, in maiuscolo, senza zeri iniziali
  - `matchInvoices(liquidations: AccLiquidationRow[], invoices: MatchableInvoice[]): Map<string, number>`, da `liquidation_key` a id fattura. Prima per `sdi_identifier`, poi per P.IVA + numero normalizzato + data. `MatchableInvoice` = `{ id, supplier_vat, invoice_number, invoice_date, sdi_identifier }`; solo fatture non cancellate e non rifiutate (`NOT_REJECTED_SQL`).
  - `AccountingInvoiceService.apply(): Promise<Record<'created' | 'sdiCompleted', number>>`, poi `matchedByKey(): Promise<Map<string, number>>` per il Task 8

- [ ] **Step 1: test che falliscono**
  - `invoice-number`: `'0150020250000011500'` → `'150020250000011500'`; `'FT/12'` e `'ft-12'` → `'FT12'`
  - `invoice-match`: `'sdi prima di P.IVA + numero + data'`; `'numero con zeri e separatori diversi abbinato'`
  - `accounting-invoice.service`:
    - `'liquidazione non annullata senza fattura, fornitore in perimetro, invoice_total presente = fattura creata'`: `source ACCOUNTING`, `invoice_id` = numero del file, `total_amount`, `sdi_identifier`, `contratto_id_fk` dal CIG (un solo contratto del fornitore con quel CIG, altrimenti null), nessuna riga
    - `'più liquidazioni della stessa fattura = una sola fattura'`
    - `'fornitore fuori perimetro o invoice_total vuoto = nessuna fattura'`
    - `'fattura esistente senza sdi_identifier lo prende dal file'`; `'sdi già presente e diverso non toccato'`
    - `'ricarico identico = nessuna modifica'`
  - `invoice-matcher.service.spec.ts`: `'fattura creata dalla contabilità viene trovata da fornitore + numero + data e arricchita'`
- [ ] **Step 2:** eseguire. Atteso: FAIL.
- [ ] **Step 3:** implementare. Creazione e IdentificativoSdI con audit e utente `-1`. Dopo aver scritto `sdi_identifier` ricalcolare `sdi_status` con la funzione di `invoices/sdi-status.ts`. Se il matcher PEC non normalizza il numero allo stesso modo, il test del matcher fallisce: in quel caso usare `normalizeInvoiceNumber` anche lì.
- [ ] **Step 4:** rieseguire. Atteso: PASS.
- [ ] **Step 5: Commit** `feat(accounting-import): fatture dal registro della contabilità`

### Task 8: Quote `ACCOUNTING` dalle liquidazioni

**Files:**
- Create: `share-plan.ts`, `share-applier.service.ts`; Test: `share-plan.spec.ts`, `share-applier.service.spec.ts`
- Modify: `backend/src/apis/invoices/invoice.service.ts` + spec (blocco sulle quote della ragioneria)

**Interfaces:**
- Consumes: `matchedByKey()` (T7); impegni per numero (T6).
- Produces:
  - `planShares(liquidations, matched: Map<string, number>, commitmentIdByNumber: Map<string, number>, current: CurrentShare[]): { invoiceId: number; shares: { commitment_id_fk; fiscal_year; amount }[] }[]`, dove `shares: []` = togliere le `ACCOUNTING`
  - `ShareApplierService.apply(): Promise<Record<'invoices' | 'cleared', number>>`

- [ ] **Step 1: test che falliscono**
  - `'liquidazioni dello stesso impegno e anno sommate'`: 292,21 + 2.922,07 → una quota da 3.214,28
  - `'più impegni = più quote'`
  - `'liquidazione su impegno fuori da UtenzePA = fattura saltata'`
  - `'fattura con ACCOUNTING e nessuna liquidazione valida = shares []'` (Review Focus 3)
  - `'quote già uguali = nessuna modifica'`
  - `invoice.service.spec`: `'PATCH commitment_shares su fattura con quote ACCOUNTING = 400'` con `'Le quote della ragioneria non si modificano.'`
- [ ] **Step 2–4:** FAIL → implementare (per ogni fattura si cancellano tutte le quote e si inseriscono le `ACCOUNTING`; con `[]` si cancellano solo le `ACCOUNTING`; nessun audit né `update_date`) → PASS.
- [ ] **Step 5: Commit** `feat(accounting-import): quote d'impegno dalle liquidazioni`

### Task 9: Contratti degli impegni e capitolo delle utenze

**Files:**
- Create: `link-plan.ts`, `link-applier.service.ts`; Test: `link-plan.spec.ts`, `link-applier.service.spec.ts`

**Interfaces:**
- Consumes: quote `ACCOUNTING` (T8), `commitmentCig` (T6).
- Produces:
  - `planCommitmentContracts(commitments: { id; cig: string | null; contractIds: number[] }[], contractsByCig: Map<string, number[]>, paidContracts: Map<number, number[]>): { commitmentId: number; add: number[] }[]`. `paidContracts` = da impegno a `contratto_id_fk` delle fatture con quote `ACCOUNTING` su quell'impegno.
  - `planUtilityChapters(rows: { utility_id; fiscal_year; chapter_id }[], current: Map<number, number | null>): { utilityId: number; chapterId: number }[]`. `rows` = righe di fattura con utenza, per ogni capitolo delle quote `ACCOUNTING` della fattura. Si usa l'ultimo esercizio con quote; si scrive solo se quel capitolo è uno solo ed è diverso dall'attuale.
  - `LinkApplierService.apply(): Promise<Record<'contractsLinked' | 'utilityChapters', number>>`

- [ ] **Step 1: test che falliscono**
  - `'CIG con un solo contratto = collegato'`; `'CIG con due contratti = niente dal CIG'`
  - `'contratti delle fatture pagate aggiunti'`; `'collegamenti a mano mai tolti'`; `'già collegato = nessuna modifica'`
  - `'utenza con un solo capitolo nell ultimo esercizio = aggiornata'`; `'due capitoli = invariata'`; `'esercizi vecchi ignorati'`
- [ ] **Step 2–4:** FAIL → implementare (audit con `-1`; dopo il cambio di capitolo `CommitmentReconcileService.reconcileUtilities(ids)`) → PASS.
- [ ] **Step 5: Commit** `feat(accounting-import): contratti degli impegni e capitolo delle utenze`

### Task 10: Sola lettura con l'import acceso

**Files:**
- Modify: `budget-commitments.service.ts`, `budget-chapter-spending.service.ts`, `budget-chapters.service.ts` e i rispettivi spec

**Interfaces:**
- Consumes: `isActive()` (T3).
- Produces: 400 `'Con l'import della contabilità attivo questo dato arriva dalla contabilità.'`

- [ ] **Step 1: test che falliscono** (tutti con `isActive() = true`; con `false` restano i comportamenti attuali)
  - impegni: create = 400; su un impegno, numero, capitolo, fornitore o importi delle annualità diversi = 400; delete = 400; contratti e note modificabili
  - spesa capitolo: create e delete = 400; `initial_budget`, `adjusted_budget`, `amount` diversi = 400; `notes` modificabili
  - capitoli: create = 400; codice, articolo e descrizione diversi = 400; tipi utenza ammessi e note modificabili
- [ ] **Step 2–4:** FAIL → implementare il confronto prima del salvataggio (valore uguale = ammesso: il form rimanda tutto) → PASS.
- [ ] **Step 5: Commit** `feat(accounting-import): sola lettura con l'import attivo`

### Task 11: Anomalie

**Files:**
- Modify: `backend/src/apis/anomalies/anomalies.service.ts` (query **in fondo** a `getAnomalies()`), il tipo `Anomalies`, lo spec (mock posizionali in fondo); etichette e segnalazioni nel frontend (`*_SIGNALS` di impegni e utenze, `pages/dashboard/anomalies-card.component.ts`)

**Interfaces:**
- Produces: tre chiavi nuove, vuote quando le tabelle `acc_*` sono vuote.
  - `accounting_liquidations_unmatched`: id di liquidazioni non annullate su impegni di UtenzePA senza fattura abbinata né creabile (manca `invoice_total` o il fornitore)
  - `accounting_commitments_without_contract`: impegni `ACCOUNTING` senza contratti dopo i collegamenti automatici
  - `accounting_utility_chapter_ambiguous`: utenze con più capitoli nell'ultimo esercizio liquidato

- [ ] **Step 1–4:** test con i mock posizionali → FAIL → query → PASS; poi frontend: etichette e segnalazioni.
- [ ] **Step 5: Commit** `feat(accounting-import): anomalie della contabilità`

### Task 12: Frontend e guida

**Files:**
- Create: `frontend/src/app/pages/accounting-import/accounting-import-page.component.ts`, `accounting-import.service.ts`
- Modify: `app.routes.ts` (`{path: 'accounting-import', component: AccountingImportPageComponent}`), `comp/sidebar/sidebar.component.ts` (voce `'Contabilità'`, icona `account_balance`, solo Admin, dopo «Import fatture»)
- Modify: scheda impegno (`pages/commitments/commitment-sheet.component.*`, `commitment.model.ts`), capitolo (`pages/budget-chapters/budget-chapter-edit-dialog.component.*`, `spending/spending-edit-dialog.component.ts`, `spending/budget-chapter-years-tab.component.ts`), tab Impegni della fattura (`pages/invoices/invoice-commitments-tab.component.ts`), `core/helpers/entity-status.ts` (badge), elenchi impegni e capitoli (bottone «Nuovo» nascosto con l'import attivo)
- Modify: `frontend/public/guida/guida.md`: data in testa; nuova sezione «Collegare la contabilità (solo amministratori)» con interruttore, caricamento, tracciato e regole; righe in «Gestire gli impegni di spesa» e «Controllare la spesa di un capitolo» su badge e sola lettura; `GUIDA_PER_PAGINA` per `/accounting-import`

**Interfaces:**
- Consumes: `GET /accounting-import/status`, `PATCH /accounting-import`, `POST /accounting-import` (T3); `source` su capitolo, riga di spesa, impegno, annualità e fattura; stato attivo = `enabled && !forcedOff` da `GET status`, letto una volta e messo in cache in un service condiviso.

- [ ] **Step 1:** pagina con interruttore (disabilitato e spiegato se `forcedOff`), campo «Importa dall'anno» (`from_year`), tre selettori di file, «Carica» (disabilitato durante il giro), ultimo giro (data, righe per file, righe scartate con riga e motivo, i numeri di `steps` con etichette italiane, `lastError`) e il tracciato.
- [ ] **Step 2:** badge «Da contabilità» dove `source = 'ACCOUNTING'` (capitolo, riga di spesa, impegno, fattura). Con l'import attivo i campi del Task 10 sono in sola lettura e i bottoni di creazione e cancellazione nascosti. Il tab «Impegni» di una fattura con quote `ACCOUNTING` nasconde «Dividi a mano» e «Torna automatico» e scrive «Ripartizione della ragioneria (liquidazioni)».
- [ ] **Step 3:** `docker exec utenzepa-frontend-1 sh -c "pnpm exec ng build --configuration production"` (comprende `check-guida.mjs`) e `pnpm run lint`. Atteso: nessun errore.
- [ ] **Step 4: Commit** `feat(accounting-import): pagina Contabilità, badge e guida`

### Task 13: Prova sul DB locale

I CSV e gli script vanno nello scratchpad, non nel repo: contengono dati reali.

- [ ] **Step 1:** **backup del DB locale** (Backup e manutenzione), perché l'import cancella i dati a mano negli anni coperti.
- [ ] **Step 2:** dal container `tinn-comune` estrarre i tre CSV dal 2023 in poi (anno di partenza 2023) con le regole della sezione «Verificato sul DB del Comune» (testi da WIN1252 a UTF-8, importo dell'impegno = `IMPORTO + V_VAR_P − V_VAR_N`, numero fattura = `NUMERO_DOCUMENTO`, P.IVA del fornitore della fattura). Questa è la bozza delle query della fase 4.
- [ ] **Step 3:** con un Admin temporaneo (`docs/claude/testing-e2e.md`) accendere l'import e caricare i file. Atteso:
  - righe di spesa 2023–2027 dei capitoli del perimetro uguali a Tinn (le 35 righe 2023 inserite a mano diventano dati della contabilità); assestati 2026 dei 70 capitoli uguali a quelli di Tinn;
  - impegno 2026/514/1 = 18.500 €;
  - circa 5.046 fatture con quote `ACCOUNTING`;
  - fatture create dal registro per i fornitori del perimetro;
  - nessuna riga scartata.
  Annotare quanti impegni e quante righe a mano sono stati cancellati e farli rivedere all'utente.
- [ ] **Step 4:** ricaricare gli stessi file. Atteso: tutti i contatori di `steps` a 0, nessuna riga di audit nuova.
- [ ] **Step 5:** controllare in UI la scheda dell'impegno 2026/514/1, una fattura A2A liquidata, una fattura creata dal registro, e che la sola lettura scompaia spegnendo l'import.
- [ ] **Step 6:** cancellare l'utente temporaneo e le sue righe di accesso; aggiornare la roadmap (voce 26, stato delle fasi) e `CLAUDE.md` (riga sul modulo `accounting-import` nel dominio).

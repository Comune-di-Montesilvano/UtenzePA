# Import fatture dalla PEC SDI — Parte 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pattern per fornitore mappati dall'utente in un editor; con un pattern l'import crea o arricchisce la fattura (stesso id), con righe per utenza, contratto, impegno, consumi nel tab Consumi e segnalazioni delle differenze.

**Architecture:** Funzioni pure in `invoice-import/pattern/` (catalogo dei campi XML con plausibilità, firma di struttura, valutazione delle regole → `ExtractedInvoice`); un `InvoiceMatcher` traduce l'estratto in fattura UtenzePA + elenco di `ImportIssue` interrogando il DB; un `InvoiceApplier` scrive fattura, righe, rilevazioni e issue in transazione. Il motore della Parte 1 chiama pattern → matcher → applier per i file in perimetro. Editor Angular a due colonne (form a sinistra, XML a destra) su API di anteprima che non scrivono nulla.

**Tech Stack:** NestJS 11, TypeORM/MySQL, fast-xml-parser 4.5.7 (già usato da `sdi-files.ts`), Angular 22 + Material.

**Spec:** `docs/superpowers/specs/2026-10-19-import-fatture-pec-design.md` (sezioni 2, 3, 4, 6; Parte 1 = piano `2026-10-19-import-fatture-pec-parte1.md`, già fatta).

## Global Constraints

- Le anagrafiche (soggetti terzi, contratti, CIG, utenze, impegni) **non si modificano mai** dall'import: ogni differenza è una `ImportIssue`.
- Pattern = un fornitore + una struttura; regole solo sull'XML (mai sul PDF).
- Una fattura importata modificata a mano (`invoices.import_locked = true`) non si rielabora più; lo stato SDI continua ad aggiornarsi.
- Fatture rifiutate (`sdi_status = REJECTED`): nessuna rilevazione collegata; se diventa rifiutata dopo l'import le rilevazioni si tolgono e si ricalcola l'utenza.
- Un lotto (più `FatturaElettronicaBody`) non si estrae: issue `BATCH_NOT_SUPPORTED`, fattura in attesa come nella Parte 1.
- Arricchimento delle fatture già presenti: **sì** (orientamento dell'utente; confermare in finalizzazione, vedi Task 6).
- PDR normalizzato a 14 cifre (zeri a sinistra), POD a 14 caratteri (`IT…`, maiuscolo, senza spazi).
- Importo riga IVA inclusa = `round2(PrezzoTotale × (1 + AliquotaIVA / 100))`.
- Errori verso l'utente in italiano, sempre 400 (mai 409). Scritture di sistema su `invoices` con `update_date: () => '\`update_date\`'`.
- Permessi editor: Admin e Operatore scrivono, Lettore vede.
- Nessun dato reale in test/fixture. Sorgenti CRLF preservati. Mai `git add .`/`-A`. jest `--maxWorkers=2`.
- Migration `backend/src/database/migrations/1795100000000-InvoicePatterns.ts` (scratch path, poi spostata; run → revert → run sul DB isolato `utenzepa_import`).
- Versione `publiccode.yml`: `v1.36.0`. Guida aggiornata con la data in testa.

## Review Focus

- **Fattura con riga senza utenza** («Indennizzo» A2A) in una fattura con una sola utenza: eredita quell'utenza (test in Task 5).
- **Periodo già coperto** da una rilevazione manuale sulla stessa utenza: nessun doppione, issue `PERIOD_COVERED`; una rilevazione `INVOICE` non collegata sullo stesso periodo viene **adottata** (test in Task 7).
- **Pattern modificato** con fatture già estratte il cui messaggio è sparito dalla PEC o con `import_locked`: restano invariate (test in Task 8).
- **Due pattern dello stesso fornitore** riconoscono la stessa fattura: vince quello con più percorsi; a parità la fattura resta in attesa (test in Task 3).
- **Nota di credito `TD04`** con importi di riga positivi nell'XML: righe e totale negativi in UtenzePA (test in Task 4).

---

## File Structure

| File | Responsabilità |
|---|---|
| `backend/src/apis/invoice-import/pattern/xml-tree.ts` | XML → albero normalizzato (array sempre), percorsi leggibili |
| `backend/src/apis/invoice-import/pattern/field-catalog.ts` | catalogo dei campi di testata e di riga, varianti condizionali, plausibilità |
| `backend/src/apis/invoice-import/pattern/pattern-rules.ts` | tipi `PatternRules`/`Rule`, valutazione → `ExtractedInvoice`, `structureKey`, `patternMatches` |
| `backend/src/apis/invoice-import/entity/invoice-pattern.entity.ts` | tabella `invoice_patterns` |
| `backend/src/apis/invoice-import/entity/invoice-import-issue.entity.ts` | tabella `invoice_import_issues` |
| `backend/src/apis/invoice-import/invoice-matcher.service.ts` | estratto → fattura proposta + issue (sola lettura DB) |
| `backend/src/apis/invoice-import/invoice-applier.service.ts` | scrittura fattura/righe/rilevazioni/issue in transazione |
| `backend/src/apis/invoice-import/invoice-patterns.controller.ts` + `invoice-patterns.service.ts` | strutture sconosciute, editor, anteprima, CRUD, ignora |
| `frontend/src/app/pages/invoice-patterns/` | elenco strutture e editor |

---

### Task 1: Modello dati

**Files:**
- Create: `backend/src/apis/invoice-import/entity/invoice-pattern.entity.ts`, `backend/src/apis/invoice-import/entity/invoice-import-issue.entity.ts`, `backend/src/apis/invoice-import/enum/import-issue-type.enum.ts`, `backend/src/database/migrations/1795100000000-InvoicePatterns.ts`
- Modify: `backend/src/apis/invoice-import/entity/sdi-message.entity.ts`, `backend/src/apis/invoice-import/enum/sdi-message-status.enum.ts`, `backend/src/apis/invoices/entity/invoice.entity.ts`, `backend/src/apis/invoices/entity/invoice-line.entity.ts`, `backend/src/apis/invoices/invoice.service.ts` (+ spec)

**Interfaces:**
- Produces:
  - `invoice_patterns`: `id`, `supplier_id_fk` (FK `third_parties`), `name` varchar(100), `ignored` boolean default false, `rules` json (`PatternRules`, Task 3; `null` se ignorato), `structure_key` varchar(40) (per i pattern ignorati: la struttura esclusa), `paths_count` int, `deleted`, audit `created_by_user_id`/`updated_by_user_id`, `create_date`/`update_date`.
  - `invoice_import_issues`: `id`, `sdi_message_id_fk` (FK, `ON DELETE CASCADE`), `invoice_id_fk` nullable, `line_index` int nullable, `type` varchar(30) (`ImportIssueType`), `detail` varchar(500), `create_date`.
  - `ImportIssueType` = `UNKNOWN_UTILITY`, `CIG_MISMATCH`, `SUPPLIER_NAME_MISMATCH`, `MISSING_COMMITMENT`, `PERIOD_COVERED`, `MIXED_CONTRACTS`, `BATCH_NOT_SUPPORTED`.
  - `sdi_messages`: + `structure_key` varchar(40) nullable, `pattern_id_fk` nullable (FK), `invoice_id_fk` nullable (FK `invoices`).
  - `SdiMessageStatus` + `EXTRACTED` (fattura creata/arricchita da un pattern), `IGNORED` (pattern ignorato).
  - `invoices`: + `import_locked` boolean default false. `invoice_lines`: + `consumption_id_fk` int nullable (FK `utility_consumptions`, `ON DELETE SET NULL`).
  - `InvoicesService.update` imposta `import_locked = true` quando la fattura ha un `sdi_messages.invoice_id_fk` che la punta (fattura nata o arricchita dall'import).

- [ ] **Step 1: test che falliscono** in `invoice.service.spec.ts`: `update` di una fattura estratta (query di controllo su `sdi_messages` → una riga) salva `import_locked: true`; fattura non importata → `import_locked` non toccato.
- [ ] **Step 2:** `run.sh "pnpm exec jest src/apis/invoices/invoice.service.spec.ts --maxWorkers=2"` → FAIL.
- [ ] **Step 3:** entity, enum, migration (scratch → `src/database/migrations/`), `InvoicesService.update`.
- [ ] **Step 4:** jest → PASS; `run-db.sh "pnpm run migration:run && pnpm run migration:revert && pnpm run migration:run"` → ok; `schema:log` senza statement su tabelle toccate.
- [ ] **Step 5: commit** `feat(invoice-import): pattern, segnalazioni d'import e collegamenti riga-rilevazione`.

### Task 2: Catalogo dei campi XML e plausibilità

**Files:**
- Create: `backend/src/apis/invoice-import/pattern/xml-tree.ts`, `backend/src/apis/invoice-import/pattern/field-catalog.ts`, `field-catalog.spec.ts`, fixture `backend/src/apis/invoice-import/sdi/fixtures/fattura-pod.xml` (fittizia, 2 righe con `AltriDatiGestionali` `TipoDato=POD`, una riga «Indennizzo» senza POD, `Causale` «kWh 542», CIG in `DatiContratto/CodiceCIG`), `fattura-aca.xml` (fittizia, `DatiContratto/IdDocumento` = `123456`, righe «Tariffa»/«Imposta fogne»/«Imposta depurazione» con `Quantita` 37 e `UnitaMisura` `Mc`)

**Interfaces:**
- Produces:
  - `type FieldScope = 'header' | 'line'`.
  - `interface CatalogField { key: string; scope: FieldScope; label: string; path: string; where?: { path: string; equals: string }; sample: string | null }` — `path` di testata assoluto da `FatturaElettronicaBody` (es. `DatiGenerali/DatiGeneraliDocumento/Numero`) o da `FatturaElettronicaHeader/...`; `path` di riga relativo a `DettaglioLinee` (es. `PrezzoTotale`, `AltriDatiGestionali/RiferimentoTesto`); `key` = `scope|path|where.path=where.equals`.
  - `buildCatalog(xml: Buffer): CatalogField[]` — un campo per ogni foglia; per i gruppi ripetuti con figlio `TipoDato` aggiunge la variante condizionale (`where: {path: 'AltriDatiGestionali/TipoDato', equals: <valore>}`, label `AltriDatiGestionali (TipoDato = POD) › RiferimentoTesto`); `sample` = valore nella prima riga che lo ha.
  - `type TargetField = 'supplierVat' | 'supplierName' | 'number' | 'date' | 'documentType' | 'total' | 'netAmount' | 'cig' | 'contractRef' | 'utility' | 'periodStart' | 'periodEnd' | 'amount' | 'description' | 'consumption' | 'unit' | 'meter'`.
  - `rankFor(target: TargetField, fields: CatalogField[]): CatalogField[]` — ordine: 1) `sample` col formato del target, 2) altri, 3) campi sotto `CessionarioCommittente` per ultimi. Formati: P.IVA `^\d{11}$`; data `^\d{4}-\d{2}-\d{2}$`; importo `^-?\d+\.\d{2,8}$`; POD `^IT\d{3}E\w{8}$`; PDR `^\d{14}$`; utenza = POD o PDR o `^\d{6,9}$`; CIG `^[A-Z0-9]{10}$`; consumo numerico.

- [ ] **Step 1: test che falliscono** (`field-catalog.spec.ts`):
  - `buildCatalog(fattura-pod)` contiene `{scope: 'line', path: 'AltriDatiGestionali/RiferimentoTesto', where: {path: 'AltriDatiGestionali/TipoDato', equals: 'POD'}, sample: 'IT001E00000001'}`;
  - `rankFor('supplierVat', …)[0].path` = `FatturaElettronicaHeader/CedentePrestatore/DatiAnagrafici/IdFiscaleIVA/IdCodice`; la P.IVA del `CessionarioCommittente` è dopo tutti i campi a 11 cifre del cedente;
  - `rankFor('utility', catalogo ACA)[0].path` = `DatiGenerali/DatiContratto/IdDocumento`;
  - `rankFor('date', …)` mette per prime le date.
- [ ] **Step 2:** jest → FAIL. **Step 3:** implementazione (riusa il parser di `sdi-files.ts`: `removeNSPrefix`, `parseTagValue: false`, `isArray` per i gruppi ripetuti). **Step 4:** jest → PASS.
- [ ] **Step 5: commit** `feat(invoice-import): catalogo dei campi XML ordinati per plausibilità`.

### Task 3: Regole del pattern ed estrazione

**Files:**
- Create: `backend/src/apis/invoice-import/pattern/pattern-rules.ts`, `pattern-rules.spec.ts`

**Interfaces:**
- Consumes: `CatalogField`, `TargetField`, `xml-tree` (Task 2).
- Produces:
  - ```ts
    type Rule =
      | { kind: 'field'; path: string; where?: { path: string; equals: string } }
      | { kind: 'numberAfter'; path: string; word: string }   // primo numero dopo la parola, virgola o punto decimale
      | { kind: 'grossAmount' }                                // riga: PrezzoTotale × (1 + AliquotaIVA/100)
      | { kind: 'fromHeader'; path: string; where?: { path: string; equals: string } }  // campo di riga preso dalla testata
      | { kind: 'none' };
    interface PatternRules {
      header: Partial<Record<'supplierName' | 'number' | 'date' | 'documentType' | 'total' | 'netAmount' | 'cig' | 'contractRef', Rule>>;
      line: Partial<Record<'utility' | 'periodStart' | 'periodEnd' | 'amount' | 'description' | 'consumption' | 'unit' | 'meter', Rule>>;
      consumptionLineFilter?: string;   // consumo solo dalle righe la cui descrizione contiene la parola
    }
    interface ExtractedLine { utility: string | null; periodStart: string | null; periodEnd: string | null; amount: number; description: string | null; consumption: number | null; unit: string | null; meter: string | null }
    interface ExtractedInvoice { supplierVat: string; supplierName: string | null; number: string; date: string; documentType: string; total: number | null; netAmount: number | null; cig: string | null; contractRef: string | null; lines: ExtractedLine[] }
    ```
  - `extract(xml: Buffer, rules: PatternRules): ExtractedInvoice` — P.IVA, numero, data e tipo documento hanno default dai campi obbligatori dello schema se la regola manca; `TD04` → `total`, `netAmount` e ogni `amount` col segno meno (valore assoluto negato); `consumption` valorizzato solo sulle righe che passano `consumptionLineFilter`.
  - `rulePaths(rules: PatternRules): string[]` — percorsi usati (anche le `where`).
  - `structureKey(xml: Buffer): string` — sha1 (40 hex) dei percorsi distinti di tutte le foglie, ordinati, senza indici.
  - `patternMatches(xml: Buffer, rules: PatternRules): boolean` — ogni percorso di `rulePaths` esiste nella fattura (le `where` con quel valore).
  - `pickPattern<T extends { id: number; rules: PatternRules; paths_count: number }>(xml: Buffer, patterns: T[]): T | null` — tra quelli che combaciano il `paths_count` più alto; parità → `null`.

- [ ] **Step 1: test che falliscono:**
  - pattern POD su `fattura-pod.xml`: due righe con `utility = 'IT001E00000001'`, riga «Indennizzo» con `utility = null`; `amount` della prima = `round2(PrezzoTotale × 1.22)`; `consumption` da `numberAfter` su `Causale` con `'kWh'` = 542;
  - pattern ACA con `utility: {kind: 'fromHeader', path: 'DatiGenerali/DatiContratto/IdDocumento'}` e `consumptionLineFilter: 'Tariffa'`: tutte le righe `utility = '123456'`, solo «Tariffa» con `consumption = 37`;
  - `TD04` con `PrezzoTotale` positivi → `amount` e `total` negativi;
  - `patternMatches` falso se manca un percorso; `pickPattern` sceglie il più specifico, `null` a parità;
  - `structureKey` uguale per due fatture con valori diversi e stessa struttura, diverso se cambia un percorso.
- [ ] **Step 2:** jest → FAIL. **Step 3:** implementazione. **Step 4:** jest → PASS.
- [ ] **Step 5: commit** `feat(invoice-import): regole dei pattern ed estrazione della fattura`.

### Task 4: Abbinamento all'anagrafica (InvoiceMatcher)

**Files:**
- Create: `backend/src/apis/invoice-import/invoice-matcher.service.ts`, `invoice-matcher.service.spec.ts`, `backend/src/apis/invoice-import/pattern/utility-code.ts` (+ spec)

**Interfaces:**
- Consumes: `ExtractedInvoice` (Task 3), `ImportIssueType` (Task 1).
- Produces:
  - `normalizeUtilityCode(value: string): string` — trim, maiuscolo, senza spazi; solo cifre di lunghezza 11–14 → zeri a sinistra fino a 14 (PDR); `IT…` di 15 caratteri → primi 14.
  - `interface MatchedLine { utility_id_fk: number | null; contract_id: number | null; commitment_id_fk: number | null; period_start: string | null; period_end: string | null; amount: number; consumption: number | null; description: string | null; supply_code: string | null }`
  - `interface MatchResult { supplierId: number; existingInvoiceId: number | null; contratto_id_fk: number | null; lines: MatchedLine[]; issues: { type: ImportIssueType; lineIndex: number | null; detail: string }[] }`
  - `InvoiceMatcher.match(extracted: ExtractedInvoice, supplierId: number): Promise<MatchResult>` — sola lettura, via `DataSource.query`:
    - utenza: `utilities.utility_id = normalizeUtilityCode(v)`, poi `utility_code = v`, solo utenze non cancellate; se `extracted.contractRef` e la regola utenza manca: utenze di `contract_utilities` dei contratti del fornitore con `consip_order = contractRef` o `cig_contract = contractRef`, valida se una sola; non trovata → `UNKNOWN_UTILITY` col codice;
    - righe senza utenza in una fattura con una sola utenza distinta → quella utenza;
    - contratto della riga: contratto del fornitore collegato all'utenza (`contract_utilities`), non cancellato, con `supply_start_date <= giorno` e (`supply_expiry_date IS NULL` o `>= giorno`), giorno = `periodEnd ?? date`; CIG estratto diverso da `cig_contract` → `CIG_MISMATCH` («CIG fattura X, contratto Y»);
    - testata: contratto comune a tutte le righe, altrimenti `null` + `MIXED_CONTRACTS`;
    - impegno: `budget_commitments` non cancellato con `contract_id_fk`, `budget_chapter_id_fk = utilities.budget_chapter_code_fk`, `fiscal_year = anno(giorno)`; assente con contratto e capitolo noti → `MISSING_COMMITMENT`;
    - ragione sociale estratta ≠ nome del soggetto (confronto senza maiuscole, punteggiatura e forma societaria finale) → `SUPPLIER_NAME_MISMATCH`;
    - fattura esistente: `invoices` non cancellata con `supplier_id_fk`, `invoice_id = number`, `invoice_date = date`.

- [ ] **Step 1: test che falliscono** (query mock per SQL, come `invoice-import.service.spec.ts`): POD trovato; PDR di 13 cifre trovato a 14; codice sconosciuto → riga senza utenza + `UNKNOWN_UTILITY`; «Indennizzo» eredita; CIG diverso → `CIG_MISMATCH`; due contratti → testata `null` + `MIXED_CONTRACTS`; impegno mancante → `MISSING_COMMITMENT`; «A2A ENERGIA S.P.A.» = «A2A Energia SpA» senza issue; fattura esistente → `existingInvoiceId`.
- [ ] **Step 2:** jest → FAIL. **Step 3:** implementazione. **Step 4:** jest → PASS.
- [ ] **Step 5: commit** `feat(invoice-import): abbinamento di utenze, contratti e impegni con segnalazioni`.

### Task 5: Scrittura della fattura (InvoiceApplier)

**Files:**
- Create: `backend/src/apis/invoice-import/invoice-applier.service.ts`, `invoice-applier.service.spec.ts`

**Interfaces:**
- Consumes: `MatchResult` (Task 4), entity del Task 1 (i consumi li aggiunge il Task 7).
- Produces:
  - `InvoiceApplier.apply(message: SdiMessage, extracted: ExtractedInvoice, match: MatchResult, patternId: number): Promise<number>` — in una transazione:
    - fattura esistente con `import_locked` → nessuna modifica a fattura e righe, solo `sdi_messages` (`status = EXTRACTED`, `pattern_id_fk`, `invoice_id_fk`); ritorna l'id;
    - esistente non bloccata → stesso id; righe sostituite da `match.lines`; `total_amount`, `net_amount_excl_vat` dall'estratto; `contratto_id_fk` solo se vuoto; `sdi_identifier` = `message.sdi_identifier`; scrittura di sistema (`update_date` invariato, `updated_by_user_id` invariato);
    - assente → creata con autore = `importUserId` (Step 3);
    - issue del messaggio sostituite da `match.issues` (con `invoice_id_fk`);
    - `sdi_messages`: `status = EXTRACTED`, `pattern_id_fk`, `invoice_id_fk`;
    - dopo la transazione: `refreshInvoiceStatus` della Parte 1 per l'identificativo.

- [ ] **Step 1: test che falliscono** (repository/manager finti): creazione con righe; arricchimento mantiene id e `update_date`; `contratto_id_fk` già valorizzato non sovrascritto; `import_locked` → righe intatte; issue sostituite (una vecchia sparisce).
- [ ] **Step 2:** jest → FAIL.
- [ ] **Step 3:** implementazione. `importUserId`: non esiste un utente di sistema e `created_by_user_id` è NOT NULL → `SELECT id FROM system_users WHERE role = 'Admin' AND deleted = 0 ORDER BY id LIMIT 1`, letto una volta per giro; nessun Admin → messaggio in `ERROR` «Nessun amministratore per le fatture importate».
- [ ] **Step 4:** jest → PASS.
- [ ] **Step 5: commit** `feat(invoice-import): creazione e arricchimento delle fatture dai pattern`.

### Task 6: Motore con i pattern

**Files:**
- Modify: `backend/src/apis/invoice-import/invoice-import.service.ts` (+ spec), `invoice-import.module.ts`

**Interfaces:**
- Consumes: `structureKey`, `pickPattern`, `extract` (Task 3), `InvoiceMatcher.match` (Task 4), `InvoiceApplier.apply` (Task 5).
- Produces:
  - in `fillInvoice`: salva `structure_key`; fornitore in perimetro → pattern non cancellati del fornitore; ignorato con `structure_key` uguale → `IGNORED`; `pickPattern` → `extract` + `match` + `apply` → `EXTRACTED`; più `FatturaElettronicaBody` → issue `BATCH_NOT_SUPPORTED` e comportamento della Parte 1; nessun pattern → comportamento della Parte 1 (`LINKED`/`PENDING`).
  - `reprocess(messageIds: number[]): Promise<{ extracted: number; skipped: number }>` — per ciascun messaggio: `fetchRaw`; sparito o fattura `import_locked` → `skipped`; altrimenti stesso percorso di `fillInvoice`. Una sola connessione IMAP per chiamata; con un giro in corso gli id finiscono in una coda in memoria che `runOnce` elabora alla fine del giro (mai errore verso l'utente).
  - `ImportRunResult` + `extracted: number`.

- [ ] **Step 1: test che falliscono:** messaggio di fornitore con pattern che combacia → `EXTRACTED` e `apply` chiamato; pattern ignorato con la stessa `structure_key` → `IGNORED`, nessun `apply`; lotto → `BATCH_NOT_SUPPORTED` + `LINKED`; `reprocess` salta messaggio sparito e fattura bloccata.
- [ ] **Step 2:** jest → FAIL. **Step 3:** implementazione. **Step 4:** jest → PASS.
- [ ] **Step 5: commit** `feat(invoice-import): estrazione automatica con i pattern dei fornitori`.

### Task 7: Consumi dalla fattura

**Files:**
- Create: `backend/src/apis/invoice-import/consumption-linker.service.ts`, `consumption-linker.service.spec.ts`
- Modify: `invoice-applier.service.ts`, `invoice-import.service.ts` (`refreshInvoiceStatus`), `invoice-import.module.ts` (importa `UtilityConsumptionsModule` per `ConsumptionRecalcService`)

**Interfaces:**
- Consumes: `invoice_lines.consumption_id_fk` (Task 1), `ConsumptionRecalcService.recalcUtility(utilityId)`.
- Produces:
  - `ConsumptionLinker.link(manager: EntityManager, invoiceId: number, userId: number): Promise<{ issues: MatchResult['issues']; utilityIds: number[] }>` — per ogni gruppo di righe (utenza, `period_start`, `period_end`) con consumo e periodo completo: somma dei consumi del gruppo; rilevazione `PERIOD`/`INVOICE` non cancellata con stessa utenza e periodo già collegata a questa fattura → aggiornata; non collegata a nessuna riga → **adottata** (valore aggiornato); altra rilevazione non cancellata che si sovrappone al periodo → nessuna creazione + `PERIOD_COVERED`; altrimenti creata (`is_estimated = false`). Righe del gruppo → `consumption_id_fk`. Rilevazioni `INVOICE` collegate prima a righe di questa fattura e non più usate → `deleted = true`.
  - `ConsumptionLinker.unlink(manager: EntityManager, invoiceId: number): Promise<number[]>` — rilevazioni collegate alle righe della fattura → `deleted = true`, `consumption_id_fk = null`; ritorna le utenze toccate.
  - Applier: chiama `link` dopo aver scritto le righe (salvo fattura `REJECTED`), aggiunge le issue; dopo la transazione `recalcUtility` per ogni utenza.
  - `refreshInvoiceStatus`: fattura che diventa `REJECTED` → `unlink` + ricalcolo; che smette di esserlo (SE) → `link` + ricalcolo.

- [ ] **Step 1: test che falliscono:** creazione di una rilevazione per due righe stessa utenza/periodo (somma); adozione di una `INVOICE` scollegata; periodo coperto da una `MANUAL` → nessuna creazione + `PERIOD_COVERED`; `unlink` cancella e ritorna l'utenza; fattura rifiutata → nessun `link`.
- [ ] **Step 2:** jest → FAIL. **Step 3:** implementazione. **Step 4:** jest → PASS (anche `src/apis/invoice-import` completo).
- [ ] **Step 5: commit** `feat(invoice-import): consumi della fattura nel tab Consumi`.

### Task 8: API dei pattern ed editor (backend)

**Files:**
- Create: `backend/src/apis/invoice-import/invoice-patterns.service.ts`, `invoice-patterns.controller.ts`, `dto/save-invoice-pattern.dto.ts`, spec del service
- Modify: `invoice-import.module.ts`

**Interfaces:**
- Consumes: Task 2, 3, 4, 6.
- Produces (controller `invoice-patterns`, `JwtAuthGuard` + `RolesGuard`; GET per tutti i ruoli, scritture Admin/Operatore):
  - `GET /invoice-patterns/unknown` → `{ supplier_id: number; supplier: string; structure_key: string; count: number; message_ids: number[] }[]` — messaggi `PENDING` o `LINKED` con `pattern_id_fk IS NULL`, raggruppati per fornitore + `structure_key`, più numerosi prima.
  - `GET /invoice-patterns` → pattern non cancellati con fornitore e numero di fatture estratte.
  - `GET /invoice-patterns/messages/:id/editor` → `{ xml: string; catalog: CatalogField[]; ranked: Record<TargetField, string[]> /* key ordinate */; similar: number[] /* stesso fornitore + structure_key */ }`; messaggio sparito → 400 «Non più disponibile sulla PEC: cercare la fattura nel protocollo.».
  - `POST /invoice-patterns/preview` body `{ message_id: number; rules: PatternRules }` → `{ matches: boolean; extracted: ExtractedInvoice | null; match: MatchResult | null; checks: { field: TargetField; tone: 'ok' | 'warn' | 'off'; text: string }[] }` (badge: es. «P.IVA → <nome> (<id>)», «POD → utenza <id>», «fattura già presente: verrà arricchita», giallo per ogni issue); nessuna scrittura.
  - `GET /invoice-patterns/messages/:id/pdf` → PDF del messaggio (come `getDocument` della Parte 1).
  - `POST /invoice-patterns` body `SaveInvoicePatternDto { supplier_id_fk; name; rules }`, `PATCH /invoice-patterns/:id`, `DELETE /invoice-patterns/:id` (soft); `POST /invoice-patterns/ignore` body `{ supplier_id_fk; structure_key; name }`.
  - Dopo create/patch/ignore: `reprocess` (Task 6) in background sui messaggi `PENDING`/`LINKED` del fornitore senza pattern e, per patch, su quelli `EXTRACTED` con quel pattern; risposta subito con `{ pattern, reprocessing: number }`.
  - Validazione: `rules` deve passare `patternMatches` sul messaggio di partenza (`message_id` nel DTO) → altrimenti 400 «Il pattern non riconosce la fattura di partenza.»; utenza o importo di riga senza regola → 400 «Indica almeno utenza e importo della riga.».

- [ ] **Step 1: test che falliscono:** raggruppamento di `unknown`; `preview` non scrive (nessun `save`/`update` sui repository); salvataggio rifiutato se non combacia; `ignore` crea pattern `ignored` con `rules = null`; patch avvia `reprocess` con gli id attesi.
- [ ] **Step 2:** jest → FAIL. **Step 3:** implementazione. **Step 4:** jest → PASS; `tsc --noEmit` pulito.
- [ ] **Step 5: commit** `feat(invoice-import): API dei pattern, anteprima e rielaborazione`.

### Task 9: Segnalazioni delle differenze

**Files:**
- Modify: `backend/src/apis/anomalies/anomalies.service.ts` (+ spec, query **in fondo**), `frontend/src/app/core/services/anomalies.service.ts`, `frontend/src/app/pages/invoices/invoices-filters.ts`, `frontend/src/app/pages/dashboard/anomalies-card.component.ts`

**Interfaces:**
- Produces (backend `Anomalies`):
  - `invoice_patterns_unknown: AnomalyList<{ supplier_id: number; supplier: string; structure_key: string; count: number }>`;
  - `invoice_import_issues: AnomalyList<{ invoice_id: number | null; number: string | null; type: ImportIssueType; detail: string }>` — issue dei messaggi non `IGNORED`, fatture non cancellate e non `REJECTED`.
  - Frontend: `INVOICE_SIGNALS` + una voce per tipo con etichette «Utenza sconosciuta», «CIG diverso dal contratto», «Ragione sociale diversa», «Impegno mancante», «Periodo di consumo già coperto», «Contratti diversi sulle righe» (`ids` = `invoice_id` filtrati per `type`); dashboard: «Strutture di fattura da mappare» (clic → editor del primo messaggio) e un pannello per tipo di issue.

- [ ] **Step 1: test che falliscono** (`only('/* invoice_patterns_unknown */', …)`, `only('/* invoice_import_issues */', …)`): mapping dei campi, esclusione `REJECTED`, conteggio query aggiornato.
- [ ] **Step 2:** jest → FAIL. **Step 3:** implementazione. **Step 4:** jest → PASS.
- [ ] **Step 5: commit** `feat(anomalies): strutture da mappare e differenze dell'import fatture`.

### Task 10: Editor dei pattern (frontend)

**Files:**
- Create: `frontend/src/app/pages/invoice-import/invoice-import-page.component.ts` (pagina Impostazioni → «Import fatture», tab «Motore» e «Pattern»), `invoice-patterns-tab.component.ts` (strutture da mappare + pattern esistenti), `pattern-editor.component.ts` (+ `.html`), `invoice-patterns.service.ts`, `pattern-rules.model.ts` (gemello dei tipi del Task 3), `target-fields.ts` (etichette dei campi UtenzePA)
- Move: `pages/backup-import/invoice-import-tab.component.ts` e `invoice-import.service.ts` → `pages/invoice-import/` (tab «Motore»: in più gli ultimi 10 messaggi in `ERROR` con file e motivo, da `GET /invoice-import/status` → `recentErrors: {file_name, error, create_date}[]`, backend + spec nel task); tolto il tab da `backup-import.component.html`
- Modify: `frontend/src/app/app.routes.ts` (`invoice-import`, `invoice-import/editor/:messageId`), `comp/sidebar/sidebar.component.ts` (voce «Import fatture», icona `mark_email_read`, in Impostazioni dopo «Backup e manutenzione»), `dashboard/anomalies-card.component.ts` (`openInvoiceImport()` → `/invoice-import`), `pages/guida/guida.ts` (`GUIDA_PER_PAGINA`)

**Interfaces:**
- Consumes: API del Task 8.
- Produces: editor a due colonne:
  - sinistra: form per `TargetField` raggruppato Testata/Riga; per ogni campo una `mat-select` con le opzioni nell'ordine di `ranked[target]` (etichetta + valore di esempio; `CessionarioCommittente` in fondo con nota «dati del Comune»), più le opzioni «Numero dopo la parola…» (campo + parola), «Calcolato: imponibile × IVA» (solo importo riga), «Dalla testata» (campi di riga), «Non presente»; campo «Consumo solo dalle righe che contengono»; badge del `checks` accanto a ogni campo (verde/giallo/grigio con token `--tone-*`);
  - destra: XML in `<pre>` con il valore del campo in focus evidenziato; bottone «Vedi PDF» (dialog del Task 7 della Parte 1 adattato all'URL del messaggio);
  - barra in alto: «Fattura N di M simili», frecce ‹ › che ricaricano editor + anteprima sul messaggio successivo mantenendo le regole, e «la mappatura regge su K di M» (anteprime già viste con `matches = true` e senza `UNKNOWN_UTILITY`);
  - azioni: «Salva pattern» (nome proposto = fornitore + «struttura» + n.), «Ignora questa struttura» (con `ConfirmDialogComponent`), Annulla; Lettore: solo consultazione.
  - Anteprima ricalcolata (debounce 400 ms) a ogni cambio di regola.

- [ ] **Step 1:** componenti e rotte.
- [ ] **Step 2:** `docker run … utenzepa/frontend:dev sh -c "node scripts/check-guida.mjs && node_modules/.bin/ng build --configuration production"` (comando del Task 7 Parte 1) → ok.
- [ ] **Step 3: prova reale** sul DB isolato (`.cache/importreal.ts` della Parte 1 esteso: avvio del backend non serve; si verifica con lo script che `POST preview` del service su un messaggio A2A e uno ACA dia righe con utenza riconosciuta) e, se lo stack è libero, Playwright: editor aperto dalla dashboard, mappatura A2A, sfoglia 3 simili, salva → fatture `EXTRACTED`.
- [ ] **Step 4: commit** `feat(invoices): editor dei pattern delle fatture`.

### Task 11: Guida, documentazione e rilascio

**Files:**
- Modify: `frontend/public/guida/guida.md`, `docs/roadmap-patrimonio.md` (voce 6: Parte 2 fatta; restano parser PDF e conguagli), `CLAUDE.md` (riga di dominio import fatture: pattern, issue, `import_locked`, `consumption_id_fk`), `publiccode.yml` (`v1.36.0`, data)

- [ ] **Step 1: guida** (data in testa): «Mappare una struttura di fattura» passo passo (dalla segnalazione all'editor, select ordinate, badge, sfogliare le simili, salvare o ignorare); cosa fa l'import con un pattern (crea o arricchisce, righe, consumi); significato di ogni segnalazione nuova; FAQ «Ho corretto il pattern ma le fatture vecchie non cambiano» (messaggio sparito dalla PEC o fattura modificata a mano) e «Una fattura importata che ho corretto non si aggiorna più».
- [ ] **Step 2:** `check-guida` + `ng build` → ok.
- [ ] **Step 3: commit** `docs: guida e roadmap pattern fatture (v1.36.0)`.
- [ ] **Step 4: note di rilascio** (corpo della PR): migration `InvoicePatterns`; dopo il deploy mappare i pattern dei fornitori principali (A2A, ACA, Dolomiti, Hera) dall'editor; le fatture già presenti vengono arricchite al salvataggio del pattern.

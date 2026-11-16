# Test d'integrazione, query in TypeORM e ritocchi CI — piano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** test d'integrazione su MySQL vero per tutto l'SQL a mano del backend, poi conversione in repository/QueryBuilder con le sole eccezioni in `*.sql.ts`; più test di proprietà, test helper frontend e ritocchi CI.

**Architecture:** jest con config dedicata (`*.int-spec.ts`) su un database `*_it` ricreato e migrato a ogni giro; job CI `integration` con servizio MySQL. Fase 2 modulo per modulo: caratterizzazione (test verdi sul codice di oggi) → conversione con gli stessi test.

**Tech Stack:** NestJS 11, TypeORM 1.x, MySQL 8, jest 30 + ts-jest, fast-check 4, Angular 22 + Vitest, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-16-test-integrazione-typeorm-design.md`

## Global Constraints

- Nessun cambio di comportamento: stesse API, stessi numeri. Guida operatori invariata.
- Migration esistenti e container `tinn/` fuori perimetro.
- jest sempre `--maxWorkers=2` (unit) / `--runInBand` (integrazione). Comandi Docker uno alla volta.
- Nessun dato dell'ente nei fixture; autore dei dati = utente di sistema `-1`.
- Database di test: nome che finisce con `_it` (default `utenzepa_it`), mai `mydatabase`.
- SQL a mano solo in `*.sql.ts`, con commento `// SQL a mano: <motivo>` (CTE, finestre, `UPDATE … JOIN` massivi, QueryBuilder che sarebbe solo SQL spezzato).
- Where object-criteria: mai valori `undefined` senza guardia (`invalidWhereValuesBehavior: 'throw'`).
- Check obbligatori: saltare per step (matrice) o per job senza matrice, mai per workflow (`paths-ignore`).
- Commit Conventional in italiano con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; `git commit` in background; mai `git add .`; CRLF preservati (Edit o Python `newline=''`).
- Una PR per task (fase 2: una PR per modulo/gruppo), `gh pr merge N --auto`.

## Review Focus

1. Test di caratterizzazione verde perché il fixture non esercita la condizione (nessuna fattura rifiutata, nessun cancellato) → ogni modulo ha un **controllo di mutazione**: tolta temporaneamente la condizione, almeno un test diventa rosso.
2. Tipi numerici: `dataSource.query` restituisce DECIMAL/SUM come stringhe, il codice fa `Number(…)`; dopo la conversione `getRawMany`/`getMany` possono dare stringhe o numeri diversamente → i test d'integrazione confrontano con `toStrictEqual` sui valori tipizzati restituiti dal service, non sulle righe.
3. Filtri facoltativi assenti nel QueryBuilder convertito (`undefined` nella where = throw) → per ogni metodo con filtri facoltativi un test senza filtri.
4. Rilevamento «sola documentazione» sbagliato (guida.md, file rinominati, base del merge group) → `scripts/ci/changes.mjs` testato con `node --test`.
5. Guardia sul nome del DB di test → unit test di `assertTestDatabase`.

---

## Fase 1

### Task 1: Infrastruttura d'integrazione + primo test + job CI

**Files:**
- Create: `backend/jest.integration.config.ts`, `backend/src/test/integration/global-setup.ts`, `backend/src/test/integration/data-source.ts`, `backend/src/test/integration/fixtures.ts`, `backend/src/test/integration/test-database.ts`, `backend/src/test/integration/test-database.spec.ts`, `backend/src/apis/spending/spending.int-spec.ts`
- Modify: `backend/package.json` (script `test:int`), `backend/tsconfig.build.json` (exclude `src/test`), `.github/workflows/tests.yml` (job `integration`), `CLAUDE.md`, `docs/claude/backend.md`

**Interfaces:**
- Produces:
  - `assertTestDatabase(name: string | undefined): string` (`test-database.ts`): restituisce il nome (default `utenzepa_it`), lancia `Error` se non finisce con `_it`.
  - `itDataSource(): Promise<DataSource>` (`data-source.ts`): DataSource inizializzato sul DB di test (env `MYSQL_*`, nome passato da `assertTestDatabase`), entity via glob come `src/database/data-source.ts`; uno per file di test, `destroy()` in `afterAll`.
  - `resetTables(ds: DataSource, tables: string[]): Promise<void>`: `SET FOREIGN_KEY_CHECKS=0`, `DELETE` di ogni tabella, `SET FOREIGN_KEY_CHECKS=1`.
  - Fixture (`fixtures.ts`), ognuna `(ds: DataSource, over?: Partial<…>) => Promise<number>` (id inserito), valori finti, `created_by`/autore `-1` dove la tabella lo prevede: `insertThirdParty`, `insertContract`, `insertUtility`, `insertBudgetChapter`, `insertInvoice`, `insertInvoiceLine`. Le altre si aggiungono nei task che le usano.
  - Script `pnpm run test:int`.

- [ ] **Step 1: unit test della guardia** in `test-database.spec.ts` (gira con `test:unit`):
```ts
expect(assertTestDatabase(undefined)).toBe('utenzepa_it');
expect(assertTestDatabase('ci_it')).toBe('ci_it');
expect(() => assertTestDatabase('mydatabase')).toThrow(/_it/);
expect(() => assertTestDatabase('')).toThrow(/_it/);
```
- [ ] **Step 2:** `docker exec utenzepa-api-1 pnpm exec jest src/test/integration/test-database.spec.ts --maxWorkers=2` → FAIL (modulo mancante).
- [ ] **Step 3:** implementare `assertTestDatabase` → stesso comando PASS.
- [ ] **Step 4: config e global setup.** `jest.integration.config.ts` riusa `moduleNameMapper`/`transform`/`rootDir` di `package.json` (letti da lì, non copiati), `testRegex: '.*\\.int-spec\\.ts$'`, `globalSetup`. `global-setup.ts`: `assertTestDatabase(process.env.MYSQL_DB)`, `DROP DATABASE IF EXISTS` + `CREATE DATABASE … CHARACTER SET utf8mb4` con `mysql2/promise` senza database, poi `execSync` di `node -r ts-node/register -r tsconfig-paths/register node_modules/typeorm/cli.js migration:run -d src/database/data-source.ts` con lo stesso env (comando di `scripts/check-migrations.sh`). Script `"test:int": "jest -c jest.integration.config.ts --runInBand"`. `tsconfig.build.json`: exclude `src/test`.
- [ ] **Step 5: primo test** `spending.int-spec.ts` su `SpendingService.forUtility` (istanziato `new SpendingService(ds)`):
  - utenza con due fatture dello stesso anno (righe 100 e 50) → `[{ year: <anno>, total: 150, invoices: 2 }]`;
  - una terza fattura `sdi_status = 'REJECTED'` (riga 70) → totale invariato 150;
  - una quarta `deleted = 1` → invariato.
- [ ] **Step 6:** `docker exec -e MYSQL_DB=utenzepa_it utenzepa-api-1 pnpm run test:int` → PASS (3 test). **Mutazione:** togliere `${NOT_REJECTED_SQL('i')}` da `LINES` in `spending.service.ts` → il test della rifiutata FAIL; ripristinare.
- [ ] **Step 7: job CI** `integration` in `tests.yml`, copiato da `migrations` (needs `mysql-image`, servizio MySQL, harden-runner audit, checkout senza `fetch-depth`, pnpm, Node dal Dockerfile, `pnpm install --frozen-lockfile`), step `pnpm run test:int` con env `MYSQL_HOST: 127.0.0.1`, `MYSQL_PORT: '3306'`, `MYSQL_USER: root`, `MYSQL_PASSWORD: ci`, `MYSQL_DB: utenzepa_it`. Su PR e coda.
- [ ] **Step 8: documentazione.** CLAUDE.md, sezione Backend: riga `pnpm run test:int` (comando con `-e MYSQL_DB=utenzepa_it`, `*.int-spec.ts`, helper in `src/test/integration/`) e togliere «Niente test d'integrazione per ora»; `docs/claude/backend.md`: paragrafo su fixture, reset, mutazione.
- [ ] **Step 9:** branch `test/integration-infra`, commit `test(backend): infrastruttura dei test d'integrazione su MySQL`, PR, CI verde (job `integration` verde), merge.

### Task 2: Test di proprietà sulle funzioni di calcolo

**Files:**
- Create: `backend/src/apis/budget-commitments/commitment-allocation.property.spec.ts`, `backend/src/apis/backup/backup-retention.property.spec.ts`, `backend/src/apis/accounting-import/payment-plan.property.spec.ts`, `backend/src/apis/spending/agreement-forecast.property.spec.ts`

**Interfaces:**
- Consumes: `allocate(...)`, `selectBackupsToKeep(items, policy, now?)`, `planPayments(...)`, `consumptionTrend(dailies, today)`, `agreementForecast(input)` (firme dai file; leggere i commenti in testa prima di scrivere le proprietà).

- [ ] **Step 1:** scrivere le proprietà (generatori `fc.record`/`fc.array`, `numRuns` default):
  - `allocate`: ogni fattura senza quote fisse compare al più una volta e il target è un'annualità candidata (stesso contratto/anno/capitolo secondo `candidates`); nessuna fattura con `fixed.length > 0` nel risultato; risultato identico con le annualità in ordine permutato (`fc.shuffledSubarray` sull'intero array).
  - `selectBackupsToKeep`: il più recente sempre tenuto; `kept.length <= daily + weekly + monthly + yearly + 1`; idempotente (`select(kept) ≡ kept`); indipendente dall'ordine di input.
  - `planPayments`: stato `null` per le fatture prima dell'anno di partenza e per le rifiutate; `paid_on` valorizzato ⇔ stato `PAID`; due chiamate con lo stesso input danno lo stesso output.
  - `consumptionTrend`: risultato in `[0.7, 1.5]` per ogni input con valori finiti ≥ 0; `agreementForecast`: nessun `NaN`/`Infinity` nei campi numerici dell'output con input finiti.
- [ ] **Step 2:** `docker exec utenzepa-api-1 pnpm exec jest <i 4 file> --maxWorkers=2`. Atteso: PASS. Un controesempio = bug reale o proprietà sbagliata: leggere il commento del file; se il codice fa ciò che documenta, correggere la proprietà e scriverlo nella PR; se no, test deterministico col controesempio in `<file>.spec.ts` + fix (come #421).
- [ ] **Step 3:** commit `test(backend): test di proprietà su impegni, backup, pagamenti e fabbisogno`, PR, merge.

### Task 3: Test degli helper frontend

**Files:**
- Create: `frontend/src/app/core/helpers/date.helper.spec.ts`, `coordinate.helper.spec.ts`, `string.helper.spec.ts`, `party-name.helper.spec.ts`, `frontend/src/app/pages/utilities/arera-category.spec.ts`

- [ ] **Step 1:** test:
  - `DateHelper.isoToLocalDate('2026-03-29')` → `getFullYear/Month/Date` = 2026/2/29 (giorno del cambio d'ora); `null`/`''`/`'abc'` → `null`; `toIsoDate(new Date(2026, 9, 25))` → `'2026-10-25'`; `toLocalIsoString(null)` → `null`.
  - `CoordinateHelper.parseCoordinate('42,4567')` → `42.4567`; `'42.4567'` → stesso; `null`/`''`/`'x'` → comportamento attuale del file (leggerlo, fissarlo).
  - `StringHelper.truncateAt('abcdef', 4)` → `'abc…'` (o quanto fa oggi: fissare), `null` → `''`, stringa corta invariata.
  - `partyName`/`partyNames` su persona fisica, giuridica, `null`, lista vuota.
  - `areraOptionsFor(null)`, `areraOptionsFor` per ogni `HardType` = `ARERA_CATEGORIES_BY_HARD_TYPE`; `areraLabel(undefined)`, `areraLabel(ARERA_NONE)`, codice sconosciuto.
- [ ] **Step 2:** `docker exec utenzepa-frontend-1 pnpm exec ng test --watch=false --include='src/app/core/helpers/*.spec.ts' --include='src/app/pages/utilities/arera-category.spec.ts'` → PASS.
- [ ] **Step 3:** commit `test(frontend): test degli helper di date, coordinate, testi, nomi e categorie ARERA`, PR, merge.

### Task 4: CI — sola documentazione, artifact-metadata, nota v1.58.3, regola lint

**Files:**
- Create: `scripts/ci/changes.mjs`, `scripts/ci/test/changes.test.mjs`
- Modify: `.github/workflows/tests.yml`, `.github/workflows/release.yml`, `backend/eslint.config.mjs`, `docs/claude/release-ci.md`, `CLAUDE.md`

**Interfaces:**
- Produces: `isDocsOnly(files: string[]): boolean` (export di `changes.mjs`); da CLI `node scripts/ci/changes.mjs <base> <head>` scrive `code=true|false` su `$GITHUB_OUTPUT`.

- [ ] **Step 1: test** `changes.test.mjs`:
```js
assert.equal(isDocsOnly(['docs/a.md', 'README.md']), true);
assert.equal(isDocsOnly(['docs/releases/v1.md']), true);
assert.equal(isDocsOnly(['frontend/public/guida/guida.md']), false);
assert.equal(isDocsOnly(['docs/a.md', 'backend/src/x.ts']), false);
assert.equal(isDocsOnly(['docs/img.png']), true);
assert.equal(isDocsOnly([]), false); // diff vuoto o non calcolabile = esegui tutto
```
- [ ] **Step 2:** `node --test scripts/ci/test/changes.test.mjs` → FAIL; implementare (`docs/**` o `*.md`, guida esclusa; diff con `git diff --name-only --no-renames`; errore di git = `code=true`) → PASS.
- [ ] **Step 3: job `changes`** in `tests.yml`: checkout `fetch-depth: 0`, `BASE_SHA` = `pull_request.base.sha || merge_group.base_sha`; fuori da PR/coda `code=true`. `backend`, `frontend`, `migrations`, `integration`, `tinn`, `e2e`, `tinn-runtime`: `needs` + `if` a livello di job (`needs.changes.outputs.code == 'true'`, in `&&` con le condizioni esistenti); `docker` (matrice): condizione aggiunta a quella di step esistente (`merge_group`). `security-scripts` sempre.
- [ ] **Step 4:** `release.yml`, job di build e push: `artifact-metadata: write` nelle `permissions`.
- [ ] **Step 5: lint `warn`** in `backend/eslint.config.mjs`: blocco con `files: ['src/**/*.ts']`, `ignores: ['src/**/*.sql.ts', 'src/database/**', 'src/**/*.spec.ts', 'src/**/*.int-spec.ts', 'src/test/**']`, regola `no-restricted-syntax: ['warn', { selector: "CallExpression[callee.property.name='query']", message: 'SQL a mano solo in *.sql.ts (motivo nel commento): usare repository o QueryBuilder.' }]`. `pnpm run lint:ci` → nessun errore nuovo (solo warning).
- [ ] **Step 6:** docs (`release-ci.md`, CLAUDE.md: job `changes`, regola lint). Commit `ci: salto dei job pesanti sulle PR di sola documentazione e regola lint sull'SQL a mano`, PR. Verifica: sulla PR il job `changes` dà `code=true` e tutto gira. Merge.
- [ ] **Step 7: prova sola documentazione:** PR con la sola nota di questo piano nel ledger o un refuso in `docs/` → job pesanti «skipped», check obbligatori soddisfatti, coda passa.
- [ ] **Step 8:** `gh release edit v1.58.3 --notes-file <body attuale + riga>`: nella sezione Sicurezza «Aggiornate le dipendenze transitive body-parser, engine.io e glob segnalate da OSV (#416).» (scaricare prima il body con `gh release view v1.58.3 --json body`).

### Task 5: Ruleset `main`

- [ ] **Step 1:** (dopo Task 1 su `main`) `gh api repos/Comune-di-Montesilvano/UtenzePA/rulesets/25883106` → salvare JSON nello scratchpad; in `required_status_checks` togliere `trivy-image (backend)`, `trivy-image (frontend)`, `trivy-image (tinn)`, aggiungere `integration`; `PUT` con lo stesso endpoint.
- [ ] **Step 2:** rileggere il ruleset: atteso 17 check con `integration`, nessun `trivy-image`. CLAUDE.md (elenco dei check) e `release-ci.md` nella prima PR utile.

### Task 6: harden-runner in block (non prima del 2026-11-20)

- [ ] **Step 1:** per ogni job, endpoint dagli insight StepSecurity delle ultime run (link nel log dello step harden-runner) → `egress-policy: block` + `allowed-endpoints:` in `tests.yml`, `security.yml`, `scorecard.yml`, `publiccode-validate.yml`, `lockfile-refresh.yml`, `dependabot-automerge.yml`, `ghcr-cleanup.yml`, `security-autofix.yml`, `security-alerts.yml`.
- [ ] **Step 2:** PR; CI e coda verdi; il giorno dopo nightly (`security.yml` schedule, `lockfile-refresh`) verdi. Endpoint mancante = aggiungerlo, mai tornare ad audit.
- [ ] **Step 3:** dopo 7 giorni senza blocchi, stessa cosa su `release.yml` (in PR a parte); prima release successiva come verifica.

## Fase 2 — conversione per modulo

**Procedura comune (ogni task 7–12), un commit per punto:**

1. **Inventario:** `grep -n '\.query(' <file del task>`; elencare nella PR ogni chiamata e il metodo pubblico che la raggiunge.
2. **Caratterizzazione:** `<service>.int-spec.ts` con almeno un test per metodo pubblico che raggiunge una query, più i casi limite del task; valori attesi calcolati a mano dai fixture. Metodi con filtri facoltativi: un test senza filtri.
3. `docker exec -e MYSQL_DB=utenzepa_it utenzepa-api-1 pnpm run test:int` → PASS. Un test rosso sul codice di oggi = bug trovato: fermarsi, test deterministico + fix in PR separata, poi riprendere.
4. **Mutazione:** togliere una condizione per query (cancellati, rifiutate, anno) → almeno un test FAIL; ripristinare. Annotare nella PR.
5. Commit `test(<modulo>): test d'integrazione delle query`.
6. **Conversione:** repository/QueryBuilder con entity e relazioni; ciò che resta SQL in `<modulo>.sql.ts` con `// SQL a mano: <motivo>`. Niente `undefined` nelle where.
7. `test:int` + unit del modulo → PASS; `git diff <commit del punto 5> -- '*.int-spec.ts'` vuoto (valori attesi intoccati). Nessun warning `no-restricted-syntax` nei file del task.
8. Moduli di calcolo (Task 10–12): script nello scratchpad che chiama vecchia e nuova implementazione sul DB di sviluppo (`mydatabase`, sola lettura) per tutti gli id (capitoli, contratti, utenze, impegni) e confronta l'output JSON; differenze = bug della conversione. Mai committato.
9. Spec unit che verificano stringhe SQL o mock posizionali di query convertite: sostituiti dai test d'integrazione (togliere i `toContain('…')` superati).
10. Commit `refactor(<modulo>): query in TypeORM`, PR, merge.

### Task 7: Moduli piccoli
`utility-types`, `third-parties`, `setup`, `attachments`, `audit-log` (controller), `backup`, `invoices` (`invoice.service.ts`), `utility` (`utility.service.ts`: la CTE resta in `utility.sql.ts`). Casi limite: cancellati esclusi; `setup` conta gli utenti senza l'utente di sistema `-1`; `third-parties` ruoli calcolati dai collegamenti.

### Task 8: `utility-supply` e `agreement-forecast`
`supply-reconcile.service.ts`, `agreement-forecast.service.ts` + `agreement-forecast.sql.ts`. Casi limite: eventi annullati (`cancelled_on`), in sospeso senza data effettiva, contratto immobiliare attivo vs scaduto, decisioni FOLLOWS/STAYS/null; convenzione con bozze e chiusi compresi, fatture rifiutate e compensate escluse. `agreement-forecast.sql.spec.ts` sostituito.

### Task 9: `invoice-import`
`invoice-import.service.ts` (`RESCOPE_SQL`, `UNBLOCKED_SQL`), `invoice-matcher.service.ts`, `invoice-patterns.service.ts`, `consumption-linker.service.ts`, `invoice-applier.service.ts`, `pattern/unknown-structures.ts`. Casi limite: fornitore entrato in perimetro dopo; due pattern con lo stesso `paths_count` = nessuno; `import_locked`; letture stessa data, decrescenti; note di credito senza consumi.

### Task 10: `accounting-import`
`commitment-applier`, `link-applier`, `share-applier`, `payment-applier`, `chapter-applier`, `accounting-data.service`, `accounting-invoice.service`, `accounting-import.service`. Casi limite: anno di partenza; idempotenza (secondo caricamento identico = nessuna scrittura: confrontare `update_date` e conteggi); dati MANUAL non presenti tolti; note di credito CANCELLED/COMPENSATED/TO_COMPENSATE; mandato di esercizio chiuso = PAID. Confronto (punto 8) su un caricamento completo dei CSV locali in un DB copia, mai su `mydatabase`.

### Task 11: `budget-commitments` e `spending`
`budget-commitments.service.ts`, `commitment-reconcile.service.ts`, `spending.service.ts`, costanti SQL di `spending/chapter-year.ts` e `line-year.ts`. Casi limite: quote AUTO/MANUAL/ACCOUNTING, annualità senza importo, impegno pluriennale, fatture con contratto senza righe, competenza dal periodo delle righe, rifiutate e compensate fuori (`NOT_REJECTED_SQL`, `NOT_OFFSET_SQL`), `update_date` invariata dopo la riconciliazione.

### Task 12: `anomalies`
`anomalies.service.ts` (47 query). Un test per anomalia (positivo e negativo) riusando le fixture dei task precedenti; tolto il test «aggrega le 5 categorie» con mock posizionali, sostituito da un test d'integrazione sul conteggio delle categorie. Le soglie (tolleranza 30 giorni, sforamento, `accounting_import_stale` 2 giorni) con un caso appena sotto e uno appena sopra.

### Task 13: Chiusura
- [ ] **Step 1:** `no-restricted-syntax` da `warn` a `error`; `pnpm run lint:ci` → 0 errori (eventuali chiamate rimaste = convertirle o spostarle in `*.sql.ts`).
- [ ] **Step 2:** CLAUDE.md: regola «SQL a mano solo in `*.sql.ts`» in Backend; `docs/claude/backend.md`: elenco delle eccezioni e motivo.
- [ ] **Step 3:** release patch con le note (`### Correzioni`: query riscritte senza cambi di comportamento, bug trovati; `### Sicurezza`: non vuota secondo modello). Rilasci intermedi a discrezione dopo Task 9 e 11.

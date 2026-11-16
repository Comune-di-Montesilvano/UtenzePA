# Test d'integrazione, query in TypeORM e ritocchi CI — design

Data: 2026-11-16. Stato: da approvare.

## Perché

1. **Correttezza dei numeri.** Spesa, impegni, pagamenti, anomalie e import PEC si calcolano con SQL scritto a mano (`dataSource.query(sql, params)`). Gli unit test sostituiscono `query` con un mock che restituisce righe già pronte: l'SQL vero non lo esegue nessun test. Un JOIN che conta due volte, un `NOT_REJECTED_SQL` dimenticato o una colonna rinominata emergono solo dai numeri in produzione.
2. **Codice scritto bene e uniforme** (richiesta esplicita). Oggi convivono repository TypeORM, QueryBuilder e stringhe SQL. Obiettivo: TypeORM come regola, SQL a mano solo dove TypeORM non arriva, isolato e dichiarato.
3. **Chiudere i punti aperti** della baseline CI/CD (spec `2026-11-13-ci-cd-baseline-design.md`).

Ordine deciso: **prima i test, poi la conversione**. Un modulo passa a TypeORM solo quando i suoi test d'integrazione fissano i numeri di oggi; gli stessi test restano verdi dopo la conversione.

## Obiettivi

- Infrastruttura di test d'integrazione backend su MySQL vero, in CI e in locale.
- Test d'integrazione (di caratterizzazione) per ogni service con SQL a mano.
- Conversione di quelle query in repository/QueryBuilder; SQL a mano residuo solo in file `*.sql.ts` motivati.
- Regola ESLint che impedisce nuovo SQL a mano fuori dalle eccezioni.
- Test di proprietà sulle funzioni pure di calcolo; test degli helper puri del frontend.
- Ritocchi CI: ruleset, permesso `artifact-metadata`, harden-runner in block, salto della CI pesante sulle PR di sola documentazione; riga #416 nella release v1.58.3.

## Non obiettivi

- Nessun cambio di comportamento visibile: stesse API, stessi numeri, stessa UI. Guida operatori invariata.
- Migration esistenti (`src/database/migrations/`): restano in SQL, sono storia congelata. Le migration nuove continuano a essere SQL generato.
- Container `tinn/` (Python) fuori perimetro.
- Indipendenza da MySQL: non è un obiettivo (le funzioni MySQL nelle eccezioni restano).
- Nessuna soglia di coverage.
- Test dei componenti Angular: solo helper puri.

## Anti-obiettivi (fallimento anche se "funziona")

- Un numero di spesa, rimanenza, stato pagamento o anomalia diverso dopo la conversione.
- Query più lente in modo percepibile (righe portate in memoria per calcolare in TypeScript ciò che oggi fa MySQL).
- QueryBuilder che è solo SQL in stringa spezzato in `.select('…')`/`.where('…')` senza alcun guadagno: in quel caso il posto giusto è un `*.sql.ts`.
- CI più lenta in modo significativo o check obbligatori che restano «in attesa» bloccando la coda.

## Vincoli

- CLAUDE.md: jest `--maxWorkers=2`; comandi Docker uno alla volta; nessun dato dell'ente nel codice o nei fixture; autore dei dati di test = utente di sistema `-1`; Conventional Commits in italiano; mai `git add .`; CRLF preservati.
- Merge queue: ogni check obbligatorio deve comparire sia su PR sia in coda (saltare per step, non per job/workflow).
- `invalidWhereValuesBehavior: 'throw'`: nelle where object-criteria mai valori `undefined` senza guardia (vale per tutto il codice convertito).
- Lib TS < ES2022.

## Approcci considerati

Test d'integrazione:
- **A (scelto): jest su MySQL di servizio.** Spec `*.int-spec.ts`, config jest dedicata, job CI `integration` con un servizio MySQL (immagine da `mysql-image`, come `migrations`); in locale sul MySQL dello stack dev, database separato.
- B: testcontainers. Scartato: su Windows serve il socket Docker nel container `api`, rischio crash di Docker già osservati.

Uniformità delle query:
- **A (scelto): QueryBuilder/repository come regola, eccezioni dichiarate.** SQL a mano solo per CTE, funzioni finestra, `UPDATE … JOIN` massivi e casi dove il QueryBuilder sarebbe solo SQL spezzato; in `*.sql.ts` con commento sul motivo e test d'integrazione obbligatorio; lint che vieta `.query(` altrove.
- B: tutto TypeORM senza eccezioni. Scartato: CTE e finestre diventerebbero subquery illeggibili o calcoli in memoria (anti-obiettivo).
- C: solo le query semplici. Scartato: il codice resta misto.

## Design

### Fase 1 — fondamenta (una PR per punto, ordine libero)

**1.1 Infrastruttura d'integrazione (backend)**
- Spec accanto al codice: `src/**/*.int-spec.ts` (non intercettati dal `testRegex` unit `.*\.spec\.ts$`).
- Config `backend/jest.integration.config.ts` (stessi `moduleNameMapper`/transform di `package.json`, `testRegex: '.*\.int-spec\.ts$'`), script `test:int` con `--runInBand`.
- `globalSetup`: ricrea il database `MYSQL_DB` (default `utenzepa_it`; rifiuta di partire se il nome non finisce con `_it`, per non toccare mai `mydatabase`), esegue tutte le migration con il `data-source.ts` esistente.
- Helper in `src/test/integration/`: `itDataSource()` (DataSource sul DB di test, stesse entity), `resetTables(ds, tabelle)` (DELETE in ordine FK prima di ogni test) e fixture minime (`insertThirdParty`, `insertContract`, `insertUtility`, `insertInvoice`, `insertCommitment`, …) con valori finti e autore `-1`. Le fixture si aggiungono man mano che servono, non tutte subito.
- Service sotto test: istanziati con il DataSource vero e gli altri collaboratori mock (`new Service(ds, …)` o `Test.createTestingModule` con `TypeOrmModule.forRoot` sul DB di test; scelta del builder caso per caso).
- CI: job `integration` in `tests.yml` (needs `mysql-image`, servizio MySQL, harden-runner, pnpm come `migrations`), su PR e coda; aggiunto ai check obbligatori del ruleset `main` (25883106).
- Locale: `docker exec -e MYSQL_DB=utenzepa_it utenzepa-api-1 pnpm run test:int` sul MySQL dello stack dev. Documentato in `docs/claude/backend.md` e CLAUDE.md.
- Primo test d'integrazione nella stessa PR: `NOT_REJECTED_SQL`/`NOT_OFFSET_SQL` su `spending` (fattura rifiutata e compensata fuori dalla spesa del capitolo), per provare l'infrastruttura.

**1.2 Test di proprietà (backend, `fast-check`)**
`*.property.spec.ts` accanto agli spec esistenti. Proprietà candidate, da confermare leggendo il codice (un'invariante che il codice non rispetta per scelta documentata non si forza: si annota nella PR):
- `allocate` (`commitment-allocation.ts`): ogni fattura senza quote fisse riceve al più un target e il target è tra le sue candidate; le fatture con quote fisse non compaiono; il risultato non dipende dall'ordine di input di fatture e annualità; nessuna fattura con candidati resta senza target.
- `selectBackupsToKeep` (`backup-retention.ts`): il backup più recente è sempre tenuto; il numero tenuto ≤ somma dei limiti (+ il più recente); idempotenza (riapplicata ai tenuti li tiene tutti); indipendente dall'ordine di input.
- `planPayments` (`payment-plan.ts`): stato `null` prima dell'anno di partenza e sulle rifiutate; `paid_on` presente solo con stato `PAID`; deterministico.
- `agreement-forecast.ts`: `consumptionTrend` sempre in [0,7; 1,5]; nessun `NaN`/`Infinity` nell'output di `agreementForecast` con input finiti; copertura in [0; 1].

**1.3 Helper frontend (Vitest)**
Spec per gli helper puri senza test: `core/helpers/date.helper.ts`, `coordinate.helper.ts` (virgola decimale), `string.helper.ts`, `party-name.helper.ts`, `pages/utilities/arera-category.ts`. Casi limite inclusi (date a cavallo dell'ora legale, coordinate vuote/malformate).

**1.4 Ritocchi CI**
- Ruleset `main`: togliere `trivy-image (backend|frontend|tinn)` dai check obbligatori (in coda il gate è `docker (…)`), aggiungere `integration`. CLAUDE.md e `docs/claude/release-ci.md` allineati.
- `release.yml`: `artifact-metadata: write` sul job di build e push (toglie l'avviso «Failed to create storage record»).
- Salto per PR di sola documentazione: job `changes` in `tests.yml` (diff con la base, output `code`); `backend`, `frontend`, `migrations`, `integration`, `docker`, `e2e`, `tinn`, `tinn-runtime` saltano gli step quando `code == 'false'` (i job restano e risultano verdi). «Sola documentazione» = solo `docs/**` e `*.md`, **escluso** `frontend/public/guida/guida.md` (servita dall'app e controllata dalla build). `security.yml` e `security-scripts` girano sempre (note di rilascio, segreti). Vale su PR e in coda.
- harden-runner in `egress-policy: block` **dal 2026-11-20** (dopo ~7 run notturne in audit), con `allowed-endpoints` per job dagli insight di StepSecurity. Prima `tests.yml`, `security.yml` e i workflow minori; `release.yml` per ultimo, dopo una settimana senza blocchi negli altri.
- Release GitHub v1.58.3: aggiungere la riga su #416 (override body-parser, engine.io, glob) nel testo (`gh release edit`).

### Fase 2 — conversione per modulo

Una PR per modulo (o gruppo piccolo), ogni PR con due commit logici:
1. **Caratterizzazione**: test d'integrazione che coprono ogni query a mano del modulo (casi base + i casi limite noti dal dominio in CLAUDE.md: rifiutate, compensate, cancellati, note di credito, annualità senza importo, …). Verdi sul codice di oggi.
2. **Conversione**: query in repository/QueryBuilder; ciò che resta SQL va in `<modulo>.sql.ts` con commento `// SQL a mano: <motivo>`. Stessi test verdi, nessun test modificato nel valore atteso.

Verifica aggiuntiva consigliata per i moduli di calcolo (spending, budget-commitments, accounting-import, anomalies): confronto vecchio/nuovo sul DB locale di sviluppo (dati reali importati) con uno script nello scratchpad, mai committato; differenze = bug della conversione.

Ordine (dal più piccolo, per fissare lo stile, al più rischioso):
1. `utility-types`, `third-parties`, `setup`, `attachments`, `audit-log`, `backup`, `invoices`, `utility`
2. `utility-supply` (`supply-reconcile`), `agreement-forecast`
3. `invoice-import` (service, matcher, patterns, linker, applier, `unknown-structures`)
4. `accounting-import` (appliers, data, invoice)
5. `budget-commitments` (service, reconcile), `spending`
6. `anomalies` (47 query, per ultimo: riusa le fixture di tutti gli altri)

Gli spec unit esistenti che verificano stringhe SQL (es. `agreement-forecast.sql.spec.ts`, `toContain('c.deleted = 0')`) e i mock posizionali di `anomalies.service.spec.ts` vengono sostituiti dai test d'integrazione equivalenti quando il modulo è convertito.

**Regola lint**: `no-restricted-syntax` su chiamate `.query(` fuori da `**/*.sql.ts`, `src/database/**` e spec. Introdotta in fase 1 come `warn`, portata a `error` a fine fase 2.

**Rilasci**: nessuna migration e nessun cambio visibile → patch, raggruppando più moduli per release (scelta del momento a chi esegue). Note in `### Correzioni`/`### Sicurezza` secondo il modello.

## Lasciato al builder

- Forma esatta delle fixture e del reset (DELETE vs TRUNCATE con FK disattivate), purché ogni test parta da tabelle pulite.
- Istanziazione dei service nei test d'integrazione.
- Quali query restano eccezione `*.sql.ts`, purché ogni eccezione abbia il motivo scritto e rientri nei criteri dell'approccio A.
- Divisione fine delle PR di fase 2.

## Decisioni mie (da controllare)

- Spec d'integrazione colocate (`*.int-spec.ts`) invece di una cartella `test/`: stessa convenzione degli unit e dei property.
- Guardia sul nome del DB (`_it`) contro la cancellazione del DB di sviluppo.
- `integration` obbligatorio su PR e coda (è veloce: niente build di immagini).
- Docs-only salta anche in coda: `main` non cambia comportamento con sola documentazione.
- harden-runner block a scaglioni, `release.yml` per ultimo: un blocco sbagliato lì ferma un rilascio.
- Lint `warn` → `error` solo a fine fase 2.

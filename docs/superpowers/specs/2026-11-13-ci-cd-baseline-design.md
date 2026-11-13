# CI/CD allineata alla baseline di ComunicaPA e mappa dei test — design

Data: 2026-11-13 (rivisto lo stesso giorno dopo la revisione). Riferimento: `docs/ci-cd-security-baseline.md` di ComunicaPA (ultima modifica #324, 2026-11-05; workflow letti a `a6edfdb`). Nessuna funzione nuova per gli operatori: guida invariata.

Legenda: **[utente]** = chiesto o deciso dall'utente; **[scelta mia]** = decisione di chi ha scritto il design, da contestare se non convince; il resto sono fatti verificati il 13/11 su repo, workflow e `gh api`.

## Perché

**[utente]** UtenzePA deve seguire la stessa baseline di sicurezza della supply chain di ComunicaPA: stesso modello (un solo cancello, fallire chiusi, tutto fissato, provare ciò che si pubblica) e, dove possibile, gli stessi script e workflow, così che una correzione fatta su un repo si porti sull'altro copiando. In più va mappato cosa testiamo (unit, integrazione, e2e) e cosa manca.

## Obiettivi

- Ogni voce della checklist della baseline a ✅ o n.a. motivato, tranne i gap che ComunicaPA stesso dichiara (§10: review di una seconda persona, SLSA 3, secret scanning generico).
- Workflow e script di sicurezza **presi da ComunicaPA**, adattati solo dove lo stack differisce (tre progetti pnpm separati, nessun pip, MySQL, tre immagini). Dove l'adattamento non è banale (autofix) gli script si parametrizzano in entrambi i repo, così restano copiabili.
- Test: la CI fallisce davvero sugli errori (niente `--fix`, type-check), coverage misurata, smoke delle immagini di release. Integrazione MySQL, fuzzing, unit frontend ed e2e di flusso in una **seconda fase** con un design suo **[utente]**.

## Fuori (non obiettivi)

- Review obbligatoria di una seconda persona (unico maintainer, come ComunicaPA).
- SLSA livello 3 (workflow riutilizzabile isolato): gap dichiarato anche da ComunicaPA.
- Secret scanning `non_provider_patterns`/`validity_checks`: richiedono la licenza Secret Protection.
- Migrazione a pnpm workspace unico: `backend`, `frontend`, `e2e` restano separati; i workflow girano in matrice sulle directory **[scelta mia]**.
- Deploy: procedura di ComunicaPA (Portainer + podman) non replicata qui oltre a `verify-images` e al compose.
- Estensione dei test (vedi «Seconda fase»).

## Stato attuale (fatti)

**Repository** (`gh api repos/Comune-di-Montesilvano/UtenzePA…`)

| Voce | Oggi | Baseline |
|---|---|---|
| `GITHUB_TOKEN` default | `read`, non approva | ✅ |
| Secret scanning, push protection, Dependabot security updates | attivi | ✅ |
| Private vulnerability reporting | **spento** | attivo (citato in `SECURITY.md`) |
| `allow_merge_commit` / `allow_rebase_merge` | **true** / **true** | false / false |
| `delete_branch_on_merge`, `allow_auto_merge` | true, true | ✅ |
| Action consentite | **all** | `selected` + elenco |
| `sha_pinning_required` | **false** | true |
| CodeQL default setup | suite **default**, linguaggi actions/js-ts/python | suite `extended` |
| GitHub App bot | `BOT_CLIENT_ID`/`BOT_PRIVATE_KEY` come secret Actions **e** Dependabot | ✅ |

**Ruleset `main`** (id 25883106): deletion, non_fast_forward, PR squash 0 approvazioni, check richiesti `dependency-review`, `backend`, `frontend`, `migrations`, `docker (backend, production)`, `docker (frontend, prod)`, `e2e`, merge queue ALLGREEN 5/5/60', nessun bypass. Mancano: thread risolti obbligatori, regola `code_scanning`, `docker (tinn, production)` e `tinn` tra i richiesti. **Nessun ruleset sui tag** `v*`.

**Workflow** (`tests.yml`, `release.yml`, `dependabot-automerge.yml`, `lockfile-refresh.yml`, `ghcr-cleanup.yml`, `scorecard.yml`, `publiccode-validate.yml`)

- ✅ action per SHA, `permissions: contents: read` in testa, `concurrency`, `merge_group`, `--frozen-lockfile`, App token per i bot.
- ❌ nessun `harden-runner`; `persist-credentials: false` solo in `scorecard.yml`; `timeout-minutes` assente su `backend`, `frontend` e `build-push` di `release.yml`.
- ❌ Trivy `version: latest` (tests e release); nessun workflow che segnala nuove versioni di Trivy, pnpm, Node.
- ❌ nessun `pnpm audit`, nessun Trivy fs (segreti, misconfig Dockerfile/compose), nessun controllo giornaliero assoluto, nessun `security-alerts`, nessun `security-autofix`.
- ❌ Trivy immagine sulle PR **assoluto**: una CVE pubblicata oggi blocca qualsiasi PR non correlata.
- ⚠️ `tests.yml` gira anche su push di `main` (già provato in coda: run doppio).
- ⚠️ `pnpm run lint` del backend usa `eslint --fix`: in CI corregge in silenzio invece di fallire; `eslint.config.mjs` ignora `**/*.spec.ts`. `type-check` non gira (`nest build` non vede gli `*.spec.ts`). Non si sa quanti errori ci sono oggi senza `--fix` e con `tsc --noEmit`.
- ⚠️ `lockfile-refresh.yml` fa `git push --force` con le credenziali salvate dal checkout (token dell'App), non con `createCommitOnBranch`.

**Release** (`release.yml`)

- ❌ push **con i tag** (`vX.Y.Z`, `latest`) **prima** di Trivy; sui tag `v*` Trivy è report-only (`exit-code 0`).
- ✅ provenance (`attest-build-provenance`); ⚠️ SBOM solo BuildKit nell'indice, nessuna attestazione SBOM; ❌ nessuna firma cosign.
- ❌ nessuno smoke sulle immagini di release (l'`e2e` di `tests.yml` prova le immagini della PR).
- ⚠️ rebuild giornaliero incondizionato con salto «tag nelle ultime 24 ore» (rimosso in ComunicaPA da #283): sempre un digest nuovo, ignora per un giorno patch OS e CVE.

**Dipendenze e immagini**

- ❌ immagini base senza digest: `node:26` (frontend, solo stage di build), `node:${NODE_VERSION}-alpine` (backend: ARG che Dependabot non segue), `nginx:1.31-alpine`, `firebirdsql/firebird:5.0.3`, `mysql:8` (compose e servizio del job `migrations`).
- ❌ corepack installato con `npm install -g corepack@0.36.0` (Node 26 non lo include), senza checksum; `packageManager` = `pnpm@11.24.0` senza hash nei tre `package.json`; Dependabot senza ecosistema `docker-compose`.
- ⚠️ `.trivyignore` (formato vecchio, una voce con motivo e `exp:`), nessun `auditConfig.ignoreGhsas`; `overrides` presenti in `backend/pnpm-workspace.yaml`; `e2e/` senza `pnpm-workspace.yaml` e con sole devDependencies.
- Tinn: solo pacchetti Debian via apt, **nessun pip** → la parte pip della baseline è n.a.

**Runtime** (`docker-compose.yml`)

- ✅ backend non-root (`nestjs`), tinn scende a uid 1000 con `setpriv`, npm/npx/corepack rimossi dal backend di produzione, segreti `:?`.
- ❌ nessun `read_only`, `cap_drop`, `no-new-privileges` su alcun servizio.
- ❌ frontend nginx come **root** (nessun `USER` nello stage `prod`) e `config.js` scritto in `/usr/share/nginx/html`.
- ⚠️ Dockerfile di tinn: l'ultimo stage è `test` (`USER 1000`), quindi Trivy misconfig non vede lo stage `production`, che parte root per scelta.
- ❌ porta dell'API pubblicata sull'host: frontend e API su origin diverse (`API_URL`, `CORS_ORIGIN`).

**Governance**: ✅ `SECURITY.md`, `CODEOWNERS`, template PR, Scorecard. ❌ `CONTRIBUTING.md`, badge OpenSSF Best Practices, fuzzing.

## Mappa dei test (fatti)

| Livello | Dove | Gira in CI | Stato |
|---|---|---|---|
| Unit backend | Jest, `backend/src/**/*.spec.ts` | `backend` (PR + coda + push) | 150 spec su ~386 file (migration escluse; 465 con). `auth.service.spec.ts` e `backup.controller.spec.ts` esclusi da `testPathIgnorePatterns` (pacchetti ESM-only). Densi: `accounting-import` 21/31, `invoice-import` 12/27, `spending` 6/8, `utility` 8/13. Scoperti o quasi: `core/email`, `core/database`, `core/sentry`, `helpers`, `invoices` 3/17, `contracts` 3/11, `asset` 3/12, `third-parties` 2/12 |
| Unit frontend | Vitest su jsdom | `frontend` | **11 spec su 265 file**: helper, filtri, 3 servizi, 1 interceptor, 1 componente. Nessun form, dialog di scheda, guard. Provider di coverage non installato |
| Migration | `backend/scripts/check-migrations.sh` su MySQL 8 | `migrations` | da zero + `schema:log` = baseline + down → up delle nuove (solo schema, non i dati). Buono |
| Tinn | pytest + `app.selftest` su `tinn/testdata` | `tinn` | buono, ma **non richiesto** dal ruleset; nessuna prova dell'immagine di produzione |
| Guida | `scripts/check-guida.mjs` | dentro `frontend` (`pnpm run build`) | ancore e titoli |
| Integrazione backend su DB reale | — | — | **assente**. `jest.integration.config.js` esiste ma punta a `test/setup/integration-setup.ts`, che non c'è; `test:e2e` (`test/jest-e2e.json` inesistente) e `test:all` sono residui |
| E2E | Playwright `e2e/tests/smoke.spec.ts` sullo stack di produzione con le immagini della PR | `e2e` | 2 test: health/setup e giro delle pagine senza 5xx né errori di console. Nessun flusso, nessun ruolo diverso da Admin |
| Coverage | `test:cov` esiste | — | mai misurata |
| Fuzzing | — | — | assente |
| Script di sicurezza | — | — | n.a. finché non esistono (Fase 4) |

## Design

Fase 0 (LDAP, sezione dedicata più sotto) e poi sei fasi, una PR ciascuna (la Fase 1 non ha PR: solo impostazioni). Ogni fase lascia `main` verde e utilizzabile. Ordine **[scelta mia]**: il compose irrigidito e il same-origin (D1) vengono **prima** di `security.yml` e della release, perché `trivy-fs` (misconfig assoluti) fallirebbe subito sul frontend nginx root, e lo smoke di release dipende da porte e `API_URL` definitivi.

### Fase 1 — Impostazioni del repository (nessun codice)

Con `gh api` (comandi nel piano), verificati con i comandi di verifica della baseline §1–2:

1. `allow_merge_commit=false`, `allow_rebase_merge=false`.
2. Private vulnerability reporting acceso; controllare che `SECURITY.md` lo indichi come canale.
3. CodeQL default setup: `query_suite=extended`.
4. Ruleset `main`: `required_review_thread_resolution=true`; regola `code_scanning` (CodeQL, alert `errors`, sicurezza `high_or_higher`); aggiungere `tinn` e `docker (tinn, production)` ai check richiesti.
5. Ruleset nuovo `release-tags` su `refs/tags/v*`: creation, update, deletion, non_fast_forward; bypass solo ruolo admin.
6. **Action consentite** = `selected`, GitHub + elenco esplicito (quelle usate oggi più quelle che entrano con le fasi successive): `aquasecurity/trivy-action@*`, `aquasecurity/setup-trivy@*`, `dependabot/fetch-metadata@*`, `docker/build-push-action@*`, `docker/login-action@*`, `docker/metadata-action@*`, `docker/setup-buildx-action@*`, `italia/publiccode-parser-action@*`, `ossf/scorecard-action@*`, `pnpm/action-setup@*`, `sigstore/cosign-installer@*`, `step-security/harden-runner@*` (stesso elenco di ComunicaPA). Prima: `grep -rh 'uses:' .github/workflows` per non dimenticarne una.
7. `sha_pinning_required=true` **solo dopo** aver verificato che le composite usate fissino per SHA le loro action interne (in ComunicaPA è attivo con le stesse action: rischio basso).

Rischio: un'action non in elenco fa fallire il workflow. Mitigazione: dopo il punto 6 aprire una PR vuota (tutti i check di `tests.yml`, docker compreso), lanciare `ghcr-cleanup.yml` in dry-run e `release.yml` con `rebuild_latest=true` (senza, va in skip e non prova le action docker).

### Fase 2 — Igiene dei workflow e test più severi (PR 1)

**Tutti i workflow**
- Primo step di ogni job: `step-security/harden-runner` (SHA v2.22.4 `1d88384fd173af6ecb012dfd0264a306b711241a`) con `egress-policy: audit`. Il `block` arriva in Fase 5, sui soli job che pubblicano, con gli host presi dai log di audit (smoke compreso: registry npm, CDN di Playwright, mirror apt di `--with-deps`).
- `actions/checkout` con `persist-credentials: false` ovunque **tranne** `lockfile-refresh.yml`, che fa `git push` con le credenziali del checkout: lì cambia in Fase 6, quando passa a `createCommitOnBranch`. Il job `migrations` usa `git diff` sulla storia locale: non serve il token.
- `timeout-minutes` su ogni job che non lo ha (`backend` 20, `frontend` 20, `build-push` di `release.yml` 45).
- `tests.yml`: tolto il trigger `push: main` (D3).
- Trivy a versione fissa `v0.76.1` (come ComunicaPA) in `tests.yml` e `release.yml`.
- Copiati da ComunicaPA `trivy-version-check.yml` e `toolchain-version-check.yml` (issue settimanale; pnpm/corepack dopo 7 giorni). Node: regola aggiunta qui (ComunicaPA non la ha): issue quando esce una nuova LTS rispetto a `node-version` dei workflow e al tag dei Dockerfile.
- pnpm: `packageManager` con hash (`pnpm@11.24.0+sha512.…`) nei tre `package.json` (baseline §5); i workflow leggono `packageManager` (`pnpm/action-setup` con `package_json_file: <dir>/package.json`: non c'è un `package.json` alla radice) invece di `version: 11.24.0`; uno step controlla che le tre versioni coincidano.

**Test**
- Primo passo della PR: misurare lo stato reale, mai girato in CI: `tsc --noEmit` (spec compresi) ed `eslint` senza `--fix`. Gli errori esistenti si correggono nella stessa PR; se sono troppi, in una PR preparatoria. Gli `*.spec.ts` restano esclusi da ESLint in questa fase **[scelta mia]** (li controlla `type-check`); da rivalutare nella seconda fase.
- Backend: script `lint:ci` = `eslint "{src,test}/**/*.ts"` senza `--fix`; il job `backend` esegue `lint:ci`, `type-check`, `test:unit --coverage`, `build`. Il `lint` con `--fix` resta per l'uso locale.
- Frontend: devDependency `@vitest/coverage-v8` (stessa major di `vitest`, passa da `allowBuilds` se serve), poi `ng test --watch=false --coverage`.
- Coverage scritta nel `$GITHUB_STEP_SUMMARY` (percentuali per linee/rami), **nessuna soglia** (D2).
- Rimossi da `backend/package.json` gli script rotti (`test:e2e`, `test:integration*`, `test:all`, `test:ci`, `docker:dev*`) e `backend/jest.integration.config.js`; l'integrazione torna nella seconda fase con una config vera. Aggiornare CLAUDE.md (righe che li descrivono come rotti).

Verifica: PR con tutti i check verdi; un errore ESLint correggibile introdotto apposta in un commit di prova fa fallire `backend`.

### Fase 3 — Compose di produzione, runtime e same-origin (PR 2)

Ogni modifica provata con Docker **e** podman rootless (la produzione usa podman: CLAUDE.md).

- Tutti i servizi: `security_opt: [no-new-privileges:true]`, `cap_drop: [ALL]`, `read_only: true`.
- `mysql`: `cap_add: [CHOWN, DAC_OVERRIDE, FOWNER, SETUID, SETGID]`; `tmpfs` per `/var/run/mysqld` (socket e pid) e `/tmp`, senza `uid=`/`gid=` (podman li rifiuta; il chown lo fa l'entrypoint). Provato al primo avvio e su un volume già esistente.
- `tinn` (entrypoint root che fa `chown` e scende a 1000 con `setpriv`): stesse `cap_add`; `tmpfs: /tmp` (`FIREBIRD_LOCK=/tmp/tinn-lock`, file temporanei); log di Firebird (`firebird.log` in `/opt/firebird`) spostato in tmpfs o sul volume `/work`.
- `api`: scritture solo su volumi (`backups_data`, `photos_data`, `attachments_data`, `accounting_inbox`; staging di backup e ripristino è già in `backupDir`) + `tmpfs: /tmp` piccolo. Da verificare nel piano: nessun'altra scrittura su disco (Sentry, pdfjs, cache di TypeORM).
- `frontend`: nginx **non-root** (uid 101, porta interna 8080; il cambio di porta del container va nelle note di rilascio), `config.js` generato in tmpfs (`/tmp/runtime-config`) e servito da un `location` dedicato; `tmpfs` per cache e pid di nginx; `20-runtime-config.sh` adattato.
- **Same-origin (D1)**: nginx del frontend con `location /api/` verso il servizio `api`, risolto con il **resolver dinamico** come ComunicaPA (nameserver letto da `/etc/resolv.conf`: con podman il DNS non è `127.0.0.11`). Download dei backup (fino a GB) senza buffering (`proxy_buffering off` o `proxy_max_temp_file_size 0`, altrimenti finiscono nel tmpfs, cioè in RAM); `client_max_body_size` adeguato ai pezzi dell'upload e ai JSON da 3 MB; timeout lunghi su backup e ripristino. Porta dell'API solo in `docker-compose.override.yml`; `API_URL` di default `/api/v1`. Aggiornati il job `e2e` (`API_URL`, attesa dell'API via porta del frontend) ed `e2e/tests/smoke.spec.ts` (URL dell'API).
- Servizio one-shot `verify-images` (cosign, `VERIFY_IMAGES=true`): i servizi applicativi dipendono da lui con `condition: service_completed_successfully`; opzionale con **variabile**, non con `profiles`. Default `false` finché la Fase 5 non firma le immagini.
- Dockerfile di tinn: stage `test` spostato **prima** di `production`, così l'ultimo stage (quello che Trivy controlla per i misconfig e che si costruisce senza `target`) è quello vero.
- Job nuovo `tinn-runtime` in `tests.yml`: immagine di produzione avviata con `read_only`, `cap_drop`, `cap_add`, i tmpfs e `tinn/testdata` montata, entrypoint `python3 -m app.selftest` (lo stage di produzione non contiene `testdata`). Richiesto dal ruleset dopo il merge.

Verifica: stack su con podman rootless e Docker; job `e2e` verde sul same-origin; backup manuale con foto e allegati + ripristino; import di un CSV di contabilità; allegato grande (upload a pezzi); download di un backup di qualche GB senza crescita di memoria del frontend.

### Fase 4 — Sicurezza delle dipendenze e immagini base (PR 3)

**`security.yml`** preso da ComunicaPA (PR, coda, push `main`, giornaliero 05:00), con i job:
- `dependency-review` spostato qui da `tests.yml` (nome del check invariato: il ruleset non cambia). `allow-ghsas` dall'unione degli `auditConfig.ignoreGhsas` di `backend/` e `frontend/pnpm-workspace.yaml` (non c'è un file alla radice).
- `pnpm-audit` in **matrice** su `backend` e `frontend`: `pnpm audit --prod --audit-level high` assoluto su push/schedule, differenziale su PR e coda con `diff-gate.mjs` preso da `.base/` (fallback sulla copia della PR solo se la base non lo ha). `--workspace <dir>/pnpm-workspace.yaml` passato solo se il file esiste (il gate esce con 2 su file mancante). `e2e` **escluso**, n.a. motivato: solo devDependencies, `--prod` non controlla nulla; lo copre `dependency-review`. Un job matrice saltato non crea i check → si salta per step, mai per job.
- `trivy-fs`: lockfile, segreti, misconfig di Dockerfile e compose; vulnerabilità differenziali su PR/coda, segreti e misconfig sempre assoluti. Root voluto dell'entrypoint di tinn: eccezione DS-0002 in `.trivyignore.yaml` limitata a `tinn/Dockerfile`, con `statement`.
- `trivy-image (<app>)` ×3 (`backend`, `frontend`, `tinn`): sulla PR verde senza scansione (per step), in coda differenziale rispetto alla `latest` pubblicata, assoluto su `main` e nel giornaliero. **Con lo step «Checkout base»**, che nel job di ComunicaPA manca (lì `GATE=.base/…` ricade sempre sulla copia della PR, contro il principio 9: da correggere anche in ComunicaPA, PR a parte). In coda scansiona l'immagine già costruita dal job `docker` di `tests.yml` (artefatto), non una seconda build. Lo scan Trivy del job `docker` viene tolto.
- Check richiesti nuovi: `pnpm-audit (backend)`, `pnpm-audit (frontend)`, `trivy-fs`, `trivy-image (backend|frontend|tinn)`, `security-scripts`, `tinn-runtime`. Aggiunti al ruleset **dopo** il merge della PR che li crea.

**Script** copiati in `scripts/security/` con i test (`node --test scripts/security/test/`, fixture fisse), eseguiti nel job `security-scripts` di `tests.yml` (richiesto, come `run-tests` in ComunicaPA): `diff-gate.mjs`, `findings.mjs`, `semver-lite.mjs` e dipendenze. Gli script dell'autofix arrivano in Fase 6.

**`security-alerts.yml`** copiato: issue aperta/aggiornata se ci sono alert code scanning high/critical aperti su `main` (Scorecard escluso), chiusa quando non ce ne sono. **Non** richiesto dal ruleset.

**Eccezioni**: `.trivyignore` → `.trivyignore.yaml` (per ID, limitato per percorso, `statement`; la voce zod/Infisical migra con la sua scadenza). `overrides` esistenti rivisti: limitati alla versione vulnerabile (`'pkg@<x.y.z': ^x.y.w`) con advisory e condizione di rimozione nel commento.

**Immagini base fissate per digest**, con il tag **scritto per intero** (`FROM node:26-alpine@sha256:…`, niente `${NODE_VERSION}`: Dependabot e `base-image.mjs` non seguono gli ARG) in tutti gli stage dei Dockerfile, e `mysql:8@sha256:…` nel compose. Il servizio MySQL del job `migrations` prende l'immagine dal compose (`yq` in un job preliminare che la passa come output), così il digest è uno solo e lo aggiorna Dependabot (che non segue i `services:` dei workflow). Ecosistema `docker-compose` (directory `/`) aggiunto a Dependabot con lo stesso cooldown; major di MySQL ignorata (richiede migrazione dei dati), come `postgres` in ComunicaPA. Frontend: `node:26` resta Debian (solo build, non arriva nell'immagine finale), solo digest.

**Corepack con checksum**: nel backend e nel frontend `ADD --checksum=sha256:… <tarball corepack>` come in ComunicaPA, al posto del corepack incluso in Node.

Verifica: PR verde; in un branch di prova un pacchetto con advisory HIGH noto fa fallire `pnpm-audit` differenziale, la stessa CVE già presente in base no; `trivy-fs` assoluto verde su `main`.

### Fase 5 — Release come ComunicaPA (PR 4)

`release.yml` riscritto partendo da quello di ComunicaPA:

- **setup**: risolve la modalità (tag / schedule / dispatch con `rebuild_latest`, `dry_run`). Sullo schedule `scripts/rebuild-check.sh` sulle tre `latest`: cause **a** commit dopo la label `org.opencontainers.image.revision`, **b** patch di sistema (`apk` per backend/frontend, `apt` per tinn), **c** Trivy HIGH/CRITICAL con fix; nessuna causa = skip, `latest` invariato. Tolto il salto «tag nelle ultime 24 ore». Label di causa: `utenzepa.rebuild.reason`.
- **build-push ×3**: build → push **solo per digest** → Trivy (tag: bloccante su CRITICAL/HIGH con fix; rebuild: nessuna regressione rispetto a `latest`) → SBOM CycloneDX → attestazioni provenance (`attest-build-provenance`) e SBOM (`actions/attest` con `sbom-path`) → firma **cosign keyless**. `egress-policy: block` con `allowed-endpoints`.
- **smoke**: stack `docker-compose.yml` con i digest di backend e frontend → `scripts/smoke-stack.sh` + la suite Playwright di `e2e/`; tinn provato come nel job `tinn-runtime` (immagine per digest, `read_only`, selftest su `testdata` montata).
- **publish ×3**: solo se lo smoke è verde → `vX.Y.Z` (+ `latest` solo al tag più alto, regola attuale), `latest`/`latest-YYYYMMDD` dal rebuild.
- Issue «Vulnerabilità non risolvibile con un rebuild (<app>)» quando un rebuild pubblica con CVE ancora presenti.

`scripts/smoke-stack.sh` (adattato): servizi su, `/health` dell'API via nginx, frontend servito con `config.js`, login con Admin creato via SQL, query autenticata che prova le migration applicate, upload di un allegato su volume, filesystem in sola lettura, log senza errori di filesystem. La creazione dell'Admin di prova esce da `tests.yml` e diventa uno script condiviso (`scripts/e2e-admin.sh`).

`scripts/verify-images.sh` copiato (Docker e `CONTAINER_CLI=podman`); identità attesa `^https://github.com/Comune-di-Montesilvano/UtenzePA/\.github/workflows/release\.yml@refs/(tags/v.*|heads/main)$`.

`ghcr-cleanup.yml`: aggiunta la rimozione dei digest orfani (build non pubblicate) e delle loro firme cosign, come ComunicaPA.

CLAUDE.md e `docs/claude/release-ci.md` aggiornati (sezione release, verifica con `gh attestation verify` + `verify-images.sh`); da qui `VERIFY_IMAGES=true` consigliato nei deploy.

Verifica: `workflow_dispatch` con `dry_run=true` stampa le cause senza costruire; `rebuild_latest=true` produce digest firmati, attestati e scansionati; `cosign verify` e `gh attestation verify` riusciti; un digest con smoke rosso non riceve tag.

### Fase 6 — Autofix e governance (PR 5)

**`security-autofix.yml`** portato da ComunicaPA (giornaliero 02:30, dopo `Sicurezza` fallita su `main`, dispatch `force`/`dry_run`), limitato a: npm diretta → bump, npm transitiva → override sulla sola versione vulnerabile, immagine base → digest più recente dello stesso tag. Parte pip esclusa (n.a.). Versione più bassa che corregge, ≥ 48 h, provenienza verificata; commit via `createCommitOnBranch` con l'App. **Non è una copia**: gli script di ComunicaPA hanno percorsi fissi (`autofix.mjs` su `apps/*` e `pdf-extractor`, `ALLOWED` in `gh-commit.mjs`) e un solo workspace alla radice. Si parametrizzano con un file di configurazione (directory pnpm, Dockerfile, file consentiti), da riportare anche in ComunicaPA perché i due repo restino allineati copiando. È la fase più lunga. Test degli script con fixture fisse nel job `security-scripts`.

`lockfile-refresh.yml` resta (aggiorna le transitive nel range), ma passa a `createCommitOnBranch` e `persist-credentials: false`.

**Governance**: `CONTRIBUTING.md` (policy: ogni fix ha un test di regressione; come lanciare test e lint; Conventional Commits), template PR con la checklist test/sicurezza allineata a ComunicaPA, domanda per il badge OpenSSF Best Practices (passing).

## Seconda fase — Estensione dei test (fuori da questo spec) [utente]

Si fa dopo le sei fasi, con un design suo. Qui resta come elenco di partenza, con le note della revisione.

**Integrazione backend su MySQL** (`test:integration` nuovo, file `*.int-spec.ts`, che non collidono con il `testRegex` degli unit): DB creato dalle migration come nel job `migrations`. Da decidere: isolamento tra i test (truncate o transazione) e se le spec unit con mock posizionali di `getAnomalies()` restano. Priorità alle query SQL scritte a mano, che i mock non verificano:
1. `spending/chapter-year.ts` (`COMMITMENT_SPENT`, `COMMITMENTS`, fatturato per capitolo) con `NOT_REJECTED_SQL` e `NOT_OFFSET_SQL`;
2. `getAnomalies()` per categoria;
3. `invoice-import`: `RESCOPE_SQL`, `HEADER_CONTRACT_SQL`, `UNBLOCKED_SQL`;
4. `CommitmentReconcileService` end-to-end su poche fatture e impegni;
5. `costStatusSql`/`maintenanceStatusSql` contro i gemelli TypeScript;
6. import contabilità: un CSV non valido non lascia righe scritte a metà;
7. backup e ripristino con `excludeTables`;
8. migration `down` che non perdono dati (oggi si prova solo lo schema).

**Matrice di autorizzazione per ruolo**: per ogni controller che scrive, 403 per Lettore e Operatore dove previsto.

**Fuzzing property-based** (`fast-check`):
- filtri LDAP (dopo il fix, vedi sotto) e celle CSV degli export (formula injection): sono i target della baseline §9;
- parsing SDI (p7m DER/base64, BOM, `xml-stylesheet`): mai eccezioni non gestite;
- `accounting-csv.ts`: righe arbitrarie → errore di validazione, mai crash;
- `attachment-file-policy.ts` e nomi file di allegati e backup: nessun path traversal;
- `wordPattern`: un timeout di jest non interrompe una regex sincrona → worker thread con timeout, oppure input di lunghezza limitata.

**Unit frontend**: guard, `entity-sheet` (Salva con form invalido → `markAllAsTouched` + pallino), `app-linked-table` (Scollega chiede conferma), un dialog di scheda per entità principale sul `toPayload`. Lint degli `*.spec.ts`.

**E2E di flusso** (Playwright, stack del job `e2e`), dati creati via API in ogni test:
1. immobile e utenza collegata, ritrovata in elenco e in mappa;
2. fattura con righe su un contratto con impegno, quota AUTO nel tab «Impegni»;
3. Lettore (utente locale creato via SQL): vede le schede, niente pulsanti di modifica, PATCH via API = 403;
4. `/guida` e un'ancora del bottone «?»;
5. backup e ripristino con `/manutenzione`: per ultimo o in un progetto Playwright separato, perché il ripristino riporta indietro i dati degli altri test.

## Fase 0 — Escape nei filtri LDAP (PR 0, prima di tutto) [utente]

`backend/src/apis/auth/ldap/ldap.service.ts` costruisce i filtri LDAP interpolando lo username senza escape (righe 151, 186, 220) e il DN con `dnTemplate.replace('%s', username)` (riga 38). È un'iniezione nei filtri LDAP. Sfruttabilità bassa: le ricerche avvengono solo dopo un bind riuscito con lo stesso username (riga 78), che con caratteri di filtro di solito fallisce; ma la ricerca dell'utente (riga 220) e la verifica del gruppo richiesto `LDAP_REQUIRED_GROUP` (riga 186) decidono chi può entrare, e non devono dipendere da questa assunzione. Correzione: escape RFC 4515 dei valori nei filtri (`\` `*` `(` `)` NUL → `\5c` `\2a` `\28` `\29` `\00`) e RFC 4514 dello username nel DN quando il template non è `%s` puro (UPN: nessun escape DN, il valore non è un DN), con test di regressione in `ldap.service.spec.ts` (il filtro passato a `search` contiene il valore con escape; un username con `)(` non allarga la ricerca). Fix `fix(auth)`, patch.

## Correzione in ComunicaPA [utente]

Nel job `trivy-image` di `security.yml` di ComunicaPA manca lo step «Checkout base»: `GATE=.base/…` ricade sempre sulla copia della PR (principio 9). PR a parte su ComunicaPA che aggiunge lo step come negli altri job differenziali; da fare insieme alla Fase 4 di UtenzePA, che lo copia già corretto.

## Decisioni

- **D1 — Same-origin [utente, 2026-11-13].** Solo il frontend pubblica una porta; nginx inoltra `/api/` all'API; `API_URL` di default `/api/v1`; `CORS_ORIGIN` resta per i deploy che tengono le origin separate; porta dell'API spostata in `docker-compose.override.yml`. Fatto in Fase 3, prima della release, perché job `e2e` e smoke dipendono da porte e URL. Impatto sui deploy esistenti (proxy esterno che punta all'API, porta del container frontend 80 → 8080): nelle note di rilascio.
- **D2 — Coverage: solo misura [utente, 2026-11-13].** Coverage di backend e frontend misurata e scritta nel summary della run, senza soglia. La soglia (probabile: «non scende rispetto a `main`») si decide nella seconda fase. Nota: senza `push: main` (D3) il valore di riferimento di `main` andrà preso dal run in coda (artefatto) o da un job giornaliero; da decidere lì.
- **D3 — `push: main` di `tests.yml` tolto [utente, 2026-11-13].** La coda prova lo stesso albero che finisce su `main`; il controllo assoluto giornaliero su `main` lo fa `security.yml`.

## Rischi

| Rischio | Mitigazione |
|---|---|
| Action non in elenco o non fissata → workflow rotti in silenzio (schedule) | elenco preso dal grep; PR vuota, `ghcr-cleanup` in dry-run e `release.yml` con `rebuild_latest=true` dopo la Fase 1 |
| Check richiesti nuovi aggiunti al ruleset prima che esistano → coda ferma | aggiunti solo dopo il merge della PR che li crea |
| Job matrice saltato → check mancanti → PR bloccate | salto per step, mai per job (regola della baseline) |
| `lint:ci`/`type-check` rivelano molti errori vecchi | misura come primo passo della Fase 2; PR preparatoria se servono |
| `read_only` rompe funzioni rare (backup con foto, ripristino, pdfjs, import Tinn, Firebird) | verifica della Fase 3 su tutte; job `tinn-runtime`; tmpfs mirati |
| Podman rifiuta opzioni accettate da Docker (tmpfs `uid=`/`gid=`), DNS diverso | prova su podman prima del merge; resolver dinamico in nginx |
| Download dei backup bufferizzati dal proxy in RAM | `proxy_buffering off` / `proxy_max_temp_file_size 0`, verificato con un backup di GB |
| Release nuova mai provata con un tag reale | `dry_run`, poi `rebuild_latest`, poi il primo tag `vX.Y.Z` con il maintainer presente |
| Autofix che tocca file non previsti | elenco consentiti nel commit via GraphQL (fallisce fuori elenco) |

## Rilascio

Fasi 2, 4, 6 senza migration e senza modifiche visibili: patch. Fase 3: **minor** (D1 cambia `API_URL`, porte e porta del container frontend; note di rilascio con le istruzioni per il proxy). Fase 5: patch, con nelle note la verifica delle firme. Guida operatori invariata; aggiornati CLAUDE.md, `docs/claude/release-ci.md`, `docs/claude/testing-e2e.md`, `docs/claude/docker-windows.md` (compose irrigidito).

## Criteri di completamento

- Checklist della baseline compilata in fondo a `docs/claude/release-ci.md` con ✅/n.a. motivati, rieseguendo i comandi di verifica della baseline §1–2.
- Un tag `vX.Y.Z` rilasciato dalla pipeline nuova: digest firmato (`verify-images.sh`), attestato (`gh attestation verify`), smoke verde, Trivy pulito.
- Stack di produzione su podman con `read_only`/`cap_drop`/`no-new-privileges`, same-origin e `VERIFY_IMAGES=true`.
- Job di test: unit backend/frontend con `lint:ci`, `type-check` e coverage misurata; `tinn-runtime` richiesto.

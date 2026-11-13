# CI/CD allineata alla baseline di ComunicaPA — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** portare repository, workflow, release e compose di UtenzePA alla baseline di sicurezza CI/CD di ComunicaPA, partendo dal fix dell'iniezione nei filtri LDAP.

**Architecture:** sette parti in ordine, ognuna una PR (la Parte 1 sono solo impostazioni via `gh api`): fix LDAP → impostazioni del repo → igiene dei workflow e test più severi → compose irrigidito e same-origin → sicurezza delle dipendenze → release per digest firmata e provata → autofix e governance. Workflow e script presi da ComunicaPA (`../comunicaPA`, aggiornato con `git pull` prima di ogni parte) e adattati a tre progetti pnpm separati, MySQL, tre immagini.

**Tech Stack:** GitHub Actions, Docker/Podman Compose, Trivy `v0.76.1`, cosign keyless, StepSecurity harden-runner, pnpm 11, Node 26, NestJS 11 + jest, Angular 22 + Vitest, Playwright, nginx-unprivileged.

**Spec:** `docs/superpowers/specs/2026-11-13-ci-cd-baseline-design.md`. La baseline di riferimento è `../comunicaPA/docs/ci-cd-security-baseline.md`: ogni task che «prende da ComunicaPA» parte dal file omonimo lì e cambia solo quanto scritto nel task.

## Global Constraints

- Ordine delle parti vincolante: 0 → 1 → 2 → 3 → 4 → 5 → 6. Ogni PR lascia `main` verde.
- Un branch per parte (`fix/ldap-escape`, `ci/hygiene`, `ci/runtime-hardening`, `ci/security-workflow`, `ci/release-pipeline`, `ci/autofix-governance`), dal worktree principale aggiornato a `origin/main`.
- Mai `git add .`/`-A`: file sempre elencati. `git commit` con `run_in_background` (hook husky lenti). Messaggi Conventional Commits, chiusi con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; corpo PR chiuso con `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Merge con `gh pr merge N` (`--auto` se i check girano ancora), mai `--delete-branch`.
- Ogni `uses:` fissato per SHA completo con il tag in commento; SHA presi dai workflow aggiornati di ComunicaPA quando l'action è la stessa. `harden-runner`: `1d88384fd173af6ecb012dfd0264a306b711241a # v2.22.4`.
- Ogni job: `harden-runner` primo step, `timeout-minutes`, `actions/checkout` con `persist-credentials: false` (unica eccezione `lockfile-refresh.yml` fino al Task 6.3).
- Check richiesti nuovi entrano nel ruleset **solo dopo** il merge della PR che li crea. Nelle matrici si salta per step, mai per job.
- Trivy sempre `version: v0.76.1`.
- Comandi Docker uno alla volta; sorgenti CRLF modificati con Edit o Python `newline=''`, mai `sed -i`; dopo un lint nel container scartare le righe `0 0` di `git diff --numstat`.
- jest sempre `--maxWorkers=2` e solo i file toccati.
- Nessun dato dell'ente o segreto in codice, test, commit, log di CI: solo valori fittizi `ci-…-not-secret`.
- Versioni: parte 0 → `v1.57.2` (patch); parte 3 → `v1.58.0` (minor: porte e `API_URL` cambiano); parte 5 → `v1.58.1` (primo tag con la pipeline nuova). Le parti 2, 4, 6 non richiedono tag. Bump di `softwareVersion`/`releaseDate` in `publiccode.yml` nella PR che va taggata.
- Ogni cambio di comportamento operativo aggiorna nella stessa PR CLAUDE.md e il file pertinente di `docs/claude/`. Guida operatori invariata (nessuna funzione nuova per gli utenti).

## Review Focus

- Username LDAP con caratteri leciti ma insoliti (accenti, `@` dell'UPN, apostrofo come in `d'addiego`, spazi) → il login continua a funzionare come prima; solo `\ * ( ) NUL` cambiano. Test nel Task 0.1.
- Deploy esistente aggiornato a `v1.58.0` con `API_URL` ancora assoluto verso l'API sulla porta 3000 → continua a funzionare (`CORS_ORIGIN` invariato, porta pubblicabile da override); con `API_URL` vuoto → same-origin `/api/v1`. Verifica nel Task 3.6.
- Download e upload di un backup di qualche GB attraverso il proxy nginx → nessuna crescita di memoria del container frontend, nessun 413 o timeout. Verifica nel Task 3.6.
- PR aperta da Dependabot (vede solo i secret Dependabot) e run in `merge_group` → tutti i check richiesti compaiono e sono verdi, nessuno «in attesa». Verifica nei Task 2.7 e 4.7.
- Rebuild giornaliero senza alcuna causa → run verde, nessun digest nuovo, `latest` invariato; un rebuild con CVE non correggibile → `latest` pubblicato solo se non peggiora, issue aperta. Verifica nel Task 5.5.

---

## Parte 0 — Escape nei filtri LDAP (PR `fix/ldap-escape`)

### Task 0.1: escape RFC 4515/4514 in `LdapService`

**Files:**
- Create: `backend/src/apis/auth/ldap/ldap-escape.ts`
- Create: `backend/src/apis/auth/ldap/ldap-escape.spec.ts`
- Modify: `backend/src/apis/auth/ldap/ldap.service.ts` (riga 38 DN; righe ~151, ~186, ~220 filtri)
- Test: `backend/src/apis/auth/ldap/ldap.service.spec.ts`

**Interfaces:**
- Produces: `escapeLdapFilterValue(value: string): string`, `escapeLdapDnValue(value: string): string`.

- [ ] **Step 1: Test delle due funzioni (`ldap-escape.spec.ts`)**

```ts
expect(escapeLdapFilterValue('a*b(c)d\\e\u0000')).toBe('a\\2ab\\28c\\29d\\5ce\\00');
expect(escapeLdapFilterValue("mario.d'addiego@ente.it")).toBe("mario.d'addiego@ente.it");
expect(escapeLdapFilterValue('Niccolò Rossi')).toBe('Niccolò Rossi');
expect(escapeLdapDnValue('Rossi, Mario')).toBe('Rossi\\, Mario');
expect(escapeLdapDnValue('a+b"c\\d<e>f;g=h')).toBe('a\\+b\\"c\\\\d\\<e\\>f\\;g\\=h');
expect(escapeLdapDnValue('#x')).toBe('\\#x');
expect(escapeLdapDnValue(' x ')).toBe('\\ x\\ ');
```

- [ ] **Step 2: Test di regressione in `ldap.service.spec.ts`** (stessi mock di `searchUser` già usati nel file)
  - `it('mette l\'escape sullo username nel filtro di ricerca')`: login con username `x)(sAMAccountName=*` → il `filter` passato a `client.search` è `(|(sAMAccountName=x\29\28sAMAccountName=\2a)(userPrincipalName=x\29\28sAMAccountName=\2a))`.
  - `it('mette l\'escape sullo username nel filtro del gruppo ricorsivo')`: stesso username, filtro di `checkRecursiveMembership` con i valori escapati (il `groupDn` resta com'è: viene da AD).
  - `it('mette l\'escape sul nome del gruppo richiesto')`: `LDAP_REQUIRED_GROUP='G(1)'` → filtro `(&(objectClass=group)(cn=G\281\29))`.
  - `it('escape DN solo se il template non è %s puro')`: `LDAP_USER_DN_TEMPLATE='CN=%s,OU=Utenti'` con `Rossi, Mario` → bind su `CN=Rossi\, Mario,OU=Utenti`; template `%s` con `mario@ente.it` → bind su `mario@ente.it` invariato.

- [ ] **Step 3: Eseguire e vedere fallire**

Run: `docker exec utenzepa-api-1 sh -c "cd /usr/src/app && pnpm exec jest src/apis/auth/ldap --maxWorkers=2"`
Expected: FAIL (modulo `ldap-escape` mancante, filtri senza escape).

- [ ] **Step 4: Implementare** `ldap-escape.ts` (filtro: `\`→`\5c` per primo, poi `*`→`\2a`, `(`→`\28`, `)`→`\29`, NUL→`\00`; DN: `\` `,` `+` `"` `<` `>` `;` `=` preceduti da `\`, `#` iniziale e spazio iniziale/finale con `\`). In `ldap.service.ts`: `userDn = dnTemplate === '%s' ? username : dnTemplate.replace('%s', escapeLdapDnValue(username))`; i tre filtri usano `escapeLdapFilterValue(username)` e `escapeLdapFilterValue(groupCn)`.

- [ ] **Step 5: Eseguire e vedere passare** — stesso comando, Expected: PASS, compresi i test esistenti (`autentica utente membro diretto…`, `mock mode…`).

- [ ] **Step 6: Commit** `fix(auth): escape dello username nei filtri e nel DN LDAP` con i quattro file.

### Task 0.2: PR, merge e tag `v1.57.2`

**Files:** Modify: `publiccode.yml` (`softwareVersion: 1.57.2`, `releaseDate` del giorno); Modify: `CLAUDE.md` (riga Auth: «filtri LDAP con escape RFC 4515, DN RFC 4514 se il template non è `%s`»).

- [ ] **Step 1:** commit `chore(release): v1.57.2`, push, `gh pr create` (titolo `fix(auth): escape nei filtri LDAP (v1.57.2)`, corpo: problema, sfruttabilità bassa, test).
- [ ] **Step 2:** `gh pr merge N --auto`; a merge avvenuto `git tag -a v1.57.2 -m "v1.57.2"` + `git push origin v1.57.2`; `gh run watch` del run `Build & Push immagini` verde.

---

## Parte 1 — Impostazioni del repository (nessuna PR)

### Task 1.1: impostazioni via `gh api`

**Files:** nessuno. `R=repos/Comune-di-Montesilvano/UtenzePA`.

- [ ] **Step 1: Repo e sicurezza**

```sh
gh api -X PATCH $R -F allow_merge_commit=false -F allow_rebase_merge=false
gh api -X PUT $R/private-vulnerability-reporting
gh api -X PATCH $R/code-scanning/default-setup -f state=configured -f query_suite=extended
```

- [ ] **Step 2: Ruleset `main`** — leggere `gh api $R/rulesets/25883106`, salvare il JSON in scratchpad, modificarlo (`required_review_thread_resolution: true`; check richiesti + `tinn`, `docker (tinn, production)`; regola `{"type":"code_scanning","parameters":{"code_scanning_tools":[{"tool":"CodeQL","alerts_threshold":"errors","security_alerts_threshold":"high_or_higher"}]}}`), `gh api -X PUT $R/rulesets/25883106 --input file.json`.

- [ ] **Step 3: Ruleset `release-tags`** — `gh api -X POST $R/rulesets --input` con `{"name":"release-tags","target":"tag","enforcement":"active","conditions":{"ref_name":{"include":["refs/tags/v*"],"exclude":[]}},"rules":[{"type":"creation"},{"type":"update"},{"type":"deletion"},{"type":"non_fast_forward"}],"bypass_actors":[{"actor_id":5,"actor_type":"RepositoryRole","bypass_mode":"always"}]}` (5 = ruolo admin).

- [ ] **Step 4: Action consentite** — `grep -rhoE 'uses: [^@ ]+' .github/workflows | sort -u` e confronto con l'elenco dello spec (Fase 1 punto 6); poi:

```sh
gh api -X PUT $R/actions/permissions -F enabled=true -f allowed_actions=selected
gh api -X PUT $R/actions/permissions/selected-actions --input actions.json   # github_owned_allowed=true, patterns_allowed = elenco dello spec
gh api -X PUT $R/actions/permissions -F enabled=true -f allowed_actions=selected -F sha_pinning_required=true
```

- [ ] **Step 5: Verifica** — i sei comandi di verifica della baseline §1 e `gh api $R/rulesets -q '.[] | {name,target,enforcement}'`: valori attesi come nello spec. PR vuota di prova (`ci: prova impostazioni`, branch `ci/settings-probe`, chiusa senza merge): tutti i check partono e sono verdi. `gh workflow run ghcr-cleanup.yml -f dry_run=true` e `gh workflow run release.yml -f rebuild_latest=true`: verdi.

---

## Parte 2 — Igiene dei workflow e test più severi (PR `ci/hygiene`)

### Task 2.1: misurare e azzerare gli errori di `type-check` e lint senza `--fix`

**Files:** Modify: `backend/package.json` (script `lint:ci`); Modify: i sorgenti che risultano in errore.

- [ ] **Step 1:** aggiungere `"lint:ci": "eslint \"{src,test}/**/*.ts\""`.
- [ ] **Step 2:** `docker exec utenzepa-api-1 sh -c "cd /usr/src/app && pnpm run type-check"` e `... pnpm run lint:ci 2>&1 | grep -v '␍'`; contare gli errori. Se > 40 in totale, fermarsi: correzioni in una PR preparatoria `chore(lint): errori di tipo e lint esistenti` prima di continuare.
- [ ] **Step 3:** correggere fino a zero errori su entrambi (gli `*.spec.ts` restano negli `ignores` di ESLint, li copre `type-check`); `test:unit` sui file toccati verde.
- [ ] **Step 4: Commit** `chore(backend): lint:ci senza --fix, errori di tipo esistenti corretti`.

### Task 2.2: coverage misurata, script rotti tolti

**Files:** Modify: `backend/package.json`; Delete: `backend/jest.integration.config.js`; Modify: `frontend/package.json` (+ `@vitest/coverage-v8` della stessa major di `vitest`), `frontend/pnpm-lock.yaml`; Modify: `CLAUDE.md` (righe su `test:e2e`/`test:integration`/`docker:dev*`).

- [ ] **Step 1:** togliere `test:e2e`, `test:integration`, `test:integration:watch`, `test:integration:cov`, `test:all`, `test:ci`, `docker:dev*`; cancellare `jest.integration.config.js`.
- [ ] **Step 2:** `docker exec utenzepa-frontend-1 sh -c "pnpm add -D @vitest/coverage-v8@<major di vitest>"` (se `ERR_PNPM_IGNORED_BUILDS`: aggiungere ad `allowBuilds`), poi `pnpm exec ng test --watch=false --coverage`: Expected verde con cartella `coverage/` e `coverage-summary.json` (reporter `json-summary` + `text`).
- [ ] **Step 3:** backend: `pnpm run test:unit -- --coverage --coverageReporters=json-summary --coverageReporters=text --maxWorkers=2` su un file, Expected `coverage/coverage-summary.json`.
- [ ] **Step 4: Commit** `chore(test): coverage misurata, script di test rotti rimossi`.

### Task 2.3: `tests.yml`, `release.yml` e gli altri workflow allineati

**Files:** Modify: tutti i file in `.github/workflows/`; Modify: `backend/package.json`, `frontend/package.json`, `e2e/package.json` (`packageManager` con hash).

- [ ] **Step 1: pnpm con hash** — `packageManager: "pnpm@11.24.0+sha512.<hash>"` (hash da `npm view pnpm@11.24.0 dist.integrity` convertito in hex, come in `../comunicaPA/package.json`) nei tre file.
- [ ] **Step 2: workflow** — in ogni job: `harden-runner` audit primo step; `persist-credentials: false` su ogni checkout tranne `lockfile-refresh.yml`; `timeout-minutes` (`backend` 20, `frontend` 20, `build-push` 45); `pnpm/action-setup` senza `version`, con `package_json_file: backend/package.json` (o `frontend/`, `e2e/`); Trivy `version: v0.76.1`. `tests.yml`: tolto `push: branches: [main]`.
- [ ] **Step 3: job `backend`** — `pnpm install --frozen-lockfile`, `pnpm run lint:ci`, `pnpm run type-check`, `pnpm run test:unit -- --coverage --coverageReporters=json-summary --maxWorkers=2`, `pnpm run build`, poi step che scrive nel `$GITHUB_STEP_SUMMARY` la tabella linee/rami/funzioni da `coverage/coverage-summary.json` (`node -e`, nessuna soglia). Job `frontend` uguale con `pnpm run lint`, `pnpm exec ng test --watch=false --coverage`, `pnpm run build`.
- [ ] **Step 4: coerenza pnpm** — step in `backend` che fallisce se `packageManager` dei tre `package.json` non coincide (`node -e` che li legge e confronta).
- [ ] **Step 5: verifica locale** — `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.7` (Docker, un comando): nessun errore.
- [ ] **Step 6: Commit** `ci: harden-runner, credenziali non salvate, timeout, Trivy e pnpm fissati`.

### Task 2.4: avvisi sulle nuove versioni dei tool

**Files:** Create: `.github/workflows/trivy-version-check.yml`, `.github/workflows/toolchain-version-check.yml` (da ComunicaPA).

- [ ] **Step 1:** copiare i due file; in `toolchain-version-check.yml` la versione pnpm corrente si legge da `backend/package.json`; aggiungere lo step Node: ultima LTS da `https://nodejs.org/dist/index.json` (`lts != false`, major più alta) confrontata con `node-version` dei workflow e con il tag `node:<major>` dei Dockerfile; issue con titolo `Nuova versione LTS di Node: <major>` se più alta, dopo 7 giorni dalla data di uscita.
- [ ] **Step 2:** `actionlint` verde; dopo il merge `gh workflow run toolchain-version-check.yml` e `trivy-version-check.yml`: verdi, nessuna issue se già allineati.
- [ ] **Step 3: Commit** `ci: avvisi su nuove versioni di Trivy, pnpm, corepack e Node`.

### Task 2.5: PR e merge

- [ ] **Step 1:** commit di prova con un `let x = 1; x = 2;` inutilizzato in un file backend → `backend` rosso per `lint:ci`; revert del commit.
- [ ] **Step 2:** `gh pr create` (`ci: igiene dei workflow e test più severi`), aggiornare `docs/claude/release-ci.md` (trigger di `tests.yml`, coverage nel summary) e CLAUDE.md (righe su `lint`/CI) nella stessa PR; `gh pr merge N --auto`; in coda tutti i check verdi (anche nel run `merge_group`).

---

## Parte 3 — Compose irrigidito e same-origin (PR `ci/runtime-hardening`, `v1.58.0`)

### Task 3.1: frontend nginx non-root con proxy `/api/`

**Files:** Modify: `frontend/Dockerfile` (stage `prod`); Modify: `frontend/nginx.conf`; Modify: `frontend/nginx/20-runtime-config.sh`; Modify: `frontend/src/index.html` (solo se il path di `config.js` cambia); Modify: `frontend/src/environments/environment.prod.ts`, `environment.stage.ts`.

**Interfaces:** Produces: frontend in ascolto su `8080`; `config.js` servito da `/config.js` ma letto da `/tmp/runtime-config/config.js`; `location /api/` → `http://api:3000`.

- [ ] **Step 1:** stage `prod` da `nginxinc/nginx-unprivileged:1.31-alpine` (digest nella Parte 4), `apk upgrade` come root poi `USER 101`, `EXPOSE 8080`, come `../comunicaPA/apps/frontend-admin/Dockerfile`.
- [ ] **Step 2:** `20-runtime-config.sh` scrive `config.js` in `/tmp/runtime-config/` e `resolver.conf` col nameserver di `/etc/resolv.conf` (copiare le righe ~40–50 di ComunicaPA); `nginx.conf`: `listen 8080`, `include /tmp/runtime-config/resolver.conf;`, `location = /config.js { root /tmp/runtime-config; }`, `location /api/ { set $api http://api:3000; proxy_pass $api; proxy_buffering off; proxy_request_buffering off; proxy_max_temp_file_size 0; client_max_body_size 0; proxy_read_timeout 3600s; proxy_send_timeout 3600s; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; }` (`client_max_body_size 0`: il limite lo fa già l'API con `BACKUP_MAX_SIZE_MB` e il body-parser).
- [ ] **Step 3:** fallback compilato di `apiUrl` in prod e stage = `'/api/v1'` (al posto dell'URL assoluto).
- [ ] **Step 4:** `docker build --target prod -t utenzepa-frontend:probe frontend` e `docker run --rm --read-only --tmpfs /tmp --cap-drop ALL -e API_URL= -p 4399:8080 utenzepa-frontend:probe`; `curl -s localhost:4399/config.js` contiene `/api/v1` o vuoto; `curl -sI localhost:4399/` 200.
- [ ] **Step 5: Commit** `feat(frontend): nginx non-root con proxy same-origin verso l'API`.

### Task 3.2: compose di produzione irrigidito

**Files:** Modify: `docker-compose.yml`, `docker-compose.override.yml`, `.env.example`.

- [ ] **Step 1:** su ogni servizio `security_opt: [no-new-privileges:true]`, `cap_drop: [ALL]`, `read_only: true`.
- [ ] **Step 2:** `mysql`: `cap_add: [CHOWN, DAC_OVERRIDE, FOWNER, SETUID, SETGID]`, `tmpfs: [/var/run/mysqld, /tmp]`. `tinn`: stesse `cap_add`, `tmpfs: [/tmp]`. `api`: `tmpfs: [/tmp]`. `frontend`: `tmpfs: [/tmp]` (config, resolver, cache e pid di nginx-unprivileged). Nessun `uid=`/`gid=` nei tmpfs.
- [ ] **Step 3:** porte: `api` senza `ports` in `docker-compose.yml`, `ports: ['${DOCKER_API_PORT:-3000}:3000']` spostato in `docker-compose.override.yml`; `frontend` `'${DOCKER_FRONTEND_PORT:-4300}:8080'`. `.env.example`: `API_URL` vuoto di default con commento «vuoto = stessa origin (/api/v1)».
- [ ] **Step 4: Commit** `feat(compose): servizi in sola lettura, senza capability, API solo in rete interna`.

### Task 3.3: tinn in sola lettura e job `tinn-runtime`

**Files:** Modify: `tinn/Dockerfile` (stage `test` prima di `production`; `firebird.log` su `/tmp`); Modify: `tinn/entrypoint.sh` se serve per il log; Modify: `.github/workflows/tests.yml` (job `tinn` usa `--target test`; nuovo job `tinn-runtime`).

- [ ] **Step 1:** stage riordinati: `base` (tutto l'attuale `production` tranne `ENTRYPOINT`), `test FROM base` (come oggi), `production FROM base` **ultimo** con `ENTRYPOINT`. Log di Firebird: `RUN ln -sf /tmp/firebird.log /opt/firebird/firebird.log` in `base`. `tests.yml` e `release.yml` passano già `target` esplicito: invariati.
- [ ] **Step 2:** job `tinn-runtime` (dopo `docker` per riusare l'artefatto, ma anche `tinn` va salvato come artefatto): `docker run --rm --read-only --cap-drop ALL --cap-add CHOWN --cap-add DAC_OVERRIDE --cap-add FOWNER --cap-add SETUID --cap-add SETGID --security-opt no-new-privileges --tmpfs /tmp -v "$PWD/tinn/testdata:/app/testdata:ro" --entrypoint python3 ghcr.io/comune-di-montesilvano/utenzepa-tinn:ci -m app.selftest`; Expected exit 0.
- [ ] **Step 3: Commit** `ci(tinn): immagine di produzione provata in sola lettura`.

### Task 3.4: e2e sul same-origin

**Files:** Modify: `.github/workflows/tests.yml` (job `e2e`: `API_URL` vuoto, `CORS_ORIGIN` invariato, attesa su `http://localhost:4300/api/v1/health/liveness`); Modify: `e2e/tests/smoke.spec.ts` (riga 6: API = `${baseURL}/api/v1`); Modify: `e2e/playwright.config.ts` se definisce l'URL API.

- [ ] **Step 1:** modifiche; il test `API: health e setup già fatto` passa dal frontend.
- [ ] **Step 2: Commit** `test(e2e): stack provato sulla stessa origin`.

### Task 3.5: verifica completa su Docker e podman

- [ ] **Step 1 (Docker, dev stack fermato):** `IMAGE_TAG` locali costruiti, `docker compose -f docker-compose.yml up -d`; login Admin temporaneo (procedura di `docs/claude/testing-e2e.md`); da UI: backup manuale con foto e allegati, download, ripristino con `/manutenzione`; import di un CSV di contabilità; allegato da 200 MB a pezzi. Durante il download di un backup ≥ 1 GB, `docker stats utenzepa-frontend-1` resta sotto 64 MB. `docker compose logs` senza `Read-only file system`.
- [ ] **Step 2 (vecchio `API_URL`):** con `API_URL=http://localhost:3000/api/v1` e la porta pubblicata da override il login funziona (deploy non ancora migrato).
- [ ] **Step 3 (podman):** chiedere all'utente l'accesso a un host podman rootless di prova (o `podman machine` locale); stesso giro dello Step 1 con `podman compose`. Annotare differenze; se un tmpfs o una capability vanno cambiati, tornare al Task 3.2.
- [ ] **Step 4:** MySQL su volume già esistente (DB locale importato): avvio pulito, migration applicate.

### Task 3.6: documenti, PR, tag `v1.58.0`

**Files:** Modify: `CLAUDE.md` (servizi, porte, `apiUrl`, nessun proxy → same-origin), `docs/claude/docker-windows.md` (compose irrigidito, tmpfs, porte), `docs/claude/testing-e2e.md` (URL API), `publiccode.yml` (1.58.0); `README.md` se descrive porte o `API_URL`.

- [ ] **Step 1:** PR `feat(compose): same-origin e container irrigiditi (v1.58.0)`; nel corpo le **note di rilascio**: proxy esterno solo verso il frontend; porta del container frontend 80 → 8080; `API_URL` da svuotare (o lasciare, con la porta API pubblicata da override); `CORS_ORIGIN` invariato.
- [ ] **Step 2:** merge, poi aggiungere `tinn-runtime` ai check richiesti (procedura del Task 1.1 Step 2); tag `v1.58.0`, run di release verde.

---

## Parte 4 — Sicurezza delle dipendenze (PR `ci/security-workflow`)

### Task 4.1: script di sicurezza e loro test

**Files:** Create: `scripts/security/diff-gate.mjs`, `findings.mjs`, `semver-lite.mjs` (+ gli import che richiedono) e `scripts/security/test/*.test.mjs` corrispondenti con `fixtures/` (da ComunicaPA); Modify: `.github/workflows/tests.yml` (job `security-scripts`: `node --test scripts/security/test/`).

- [ ] **Step 1:** copiare file e fixture; `node --test scripts/security/test/` → PASS.
- [ ] **Step 2:** `diff-gate.mjs` resta identico a ComunicaPA (esce con 2 se `--workspace` punta a un file mancante): è il workflow a passare `--workspace` solo quando il file esiste (Task 4.2).
- [ ] **Step 3: Commit** `ci(security): gate differenziale e test degli script`.

### Task 4.2: `security.yml`

**Files:** Create: `.github/workflows/security.yml` (da ComunicaPA); Modify: `.github/workflows/tests.yml` (via `dependency-review`, via lo step Trivy del job `docker`; artefatto immagine anche per `tinn`).

**Interfaces:** Produces i check `dependency-review`, `pnpm-audit (backend)`, `pnpm-audit (frontend)`, `trivy-fs`, `trivy-image (backend)`, `trivy-image (frontend)`, `trivy-image (tinn)`.

- [ ] **Step 1:** `dependency-review`: `allow-ghsas` calcolato in uno step dall'unione di `auditConfig.ignoreGhsas` di `backend/pnpm-workspace.yaml` e `frontend/pnpm-workspace.yaml` (`yq`), vuoto se assenti.
- [ ] **Step 2:** `pnpm-audit` con `matrix.dir: [backend, frontend]`, `working-directory: ${{ matrix.dir }}`, `package_json_file`; checkout base in `.base`; differenziale con `node "$GATE" --format pnpm --head … --base …` più `--workspace ${{ matrix.dir }}/pnpm-workspace.yaml` solo se il file esiste.
- [ ] **Step 3:** `trivy-fs` come ComunicaPA (scanners vuln, secret, misconfig; `trivyignores: .trivyignore.yaml`).
- [ ] **Step 4:** `trivy-image` con `matrix.app: [backend, frontend, tinn]`, **con lo step «Checkout base»**; su PR verde per step; in coda costruisce l'immagine come il job `docker` di `tests.yml`, con `cache-from` del buildcache (workflow diversi non condividono artefatti; la cache rende la seconda build breve; scriverlo nel commento del job); differenziale contro `:latest`; assoluto su push e schedule, SARIF caricato.
- [ ] **Step 5:** `actionlint` verde. **Commit** `ci(security): audit pnpm, Trivy fs e immagini, differenziali su PR e coda`.

### Task 4.3: eccezioni

**Files:** Create: `.trivyignore.yaml`; Delete: `.trivyignore`; Modify: `backend/pnpm-workspace.yaml` (`overrides` con commento advisory + condizione di rimozione, limitati alla versione vulnerabile).

- [ ] **Step 1:** `.trivyignore.yaml`: voce zod (`CVE-2023-54404`, `expired_at: 2027-01-31`, `statement` dal commento attuale); `misconfigurations: - id: DS-0002, paths: [tinn/Dockerfile], statement: "entrypoint root per chown dei volumi, scende a uid 1000 con setpriv"`.
- [ ] **Step 2:** rivedere ogni `overrides`: formato `'pkg@<x.y.z': ^x.y.w`, commento `# GHSA-… — togliere quando <padre> passa a …`; `pnpm install` + `test:unit` sui moduli coinvolti + `build` verdi.
- [ ] **Step 3:** `docker run --rm -v "$PWD:/repo" aquasec/trivy:0.76.1 fs --scanners vuln,secret,misconfig --ignorefile /repo/.trivyignore.yaml --severity HIGH,CRITICAL --exit-code 1 /repo` → exit 0 (con il frontend non-root della Parte 3).
- [ ] **Step 4: Commit** `ci(security): eccezioni Trivy per percorso, override limitati`.

### Task 4.4: immagini base per digest e corepack con checksum

**Files:** Modify: `backend/Dockerfile`, `frontend/Dockerfile`, `tinn/Dockerfile`, `docker-compose.yml` (`mysql`), `.github/dependabot.yml`, `.github/workflows/tests.yml` (job `migrations`).

- [ ] **Step 1:** ogni `FROM` con tag intero e digest (`docker buildx imagetools inspect <img:tag>` → `Digest`); niente `${NODE_VERSION}`. `mysql:8@sha256:…` nel compose.
- [ ] **Step 2:** corepack: al posto di `npm install -g corepack@0.36.0` (Node 26 non lo include più), `ADD --checksum=sha256:<sha> https://registry.npmjs.org/corepack/-/corepack-0.36.0.tgz /tmp/corepack.tgz` + estrazione come `../comunicaPA/apps/frontend-admin/Dockerfile` righe 5–12 (versione e checksum da lì).
- [ ] **Step 3:** job `migrations`: job preliminare `mysql-image` che legge `services.mysql.image` da `docker-compose.yml` con `yq` e lo espone come output; `services.mysql.image: ${{ needs.mysql-image.outputs.image }}`.
- [ ] **Step 4:** `dependabot.yml`: ecosistema `docker-compose`, directory `/`, schedule e cooldown come gli altri, `ignore: [{dependency-name: mysql, update-types: [version-update:semver-major]}]`.
- [ ] **Step 5:** build dei tre stage di produzione in locale (uno alla volta) verdi. **Commit** `build: immagini base per digest, corepack verificato`.

### Task 4.5: `security-alerts.yml`

**Files:** Create: `.github/workflows/security-alerts.yml` (da ComunicaPA, nomi `utenzepa` dove compaiono).

- [ ] **Step 1:** copiare; `actionlint`; **Commit** `ci(security): issue sugli alert aperti di main`.

### Task 4.6: correzione in ComunicaPA

**Files (repo `../comunicaPA`):** Modify: `.github/workflows/security.yml` (job `trivy-image`: step «Checkout base» con `ref: ${{ env.BASE_SHA }}`, `path: .base`, `persist-credentials: false`, solo se `DIFF == 'true'`, e `BASE_SHA` nell'`env` del job come in `pnpm-audit`).

- [ ] **Step 1:** branch `ci/trivy-image-base-gate`, modifica, PR `ci(security): gate di trivy-image preso dalla base`; merge con la coda di ComunicaPA (stesse regole).

### Task 4.7: PR, merge, check richiesti

- [ ] **Step 1:** PR `ci: sicurezza delle dipendenze come ComunicaPA`; aggiornare `docs/claude/release-ci.md` e `docs/claude/dependencies.md` (eccezioni, `.trivyignore.yaml`, digest). Verificare su una PR Dependabot aperta dopo il merge che tutti i check compaiano.
- [ ] **Step 2:** dopo il merge, ruleset: + `pnpm-audit (backend)`, `pnpm-audit (frontend)`, `trivy-fs`, `trivy-image (backend)`, `trivy-image (frontend)`, `trivy-image (tinn)`, `security-scripts`; − `docker (…)` resta (costruisce per `e2e`).
- [ ] **Step 3:** `gh workflow run security.yml` su `main`: verde (assoluto).

---

## Parte 5 — Release per digest, firmata e provata (PR `ci/release-pipeline`, `v1.58.1`)

### Task 5.1: script

**Files:** Create: `scripts/rebuild-check.sh`, `scripts/smoke-stack.sh`, `scripts/verify-images.sh`, `scripts/e2e-admin.sh`.

**Interfaces:** `scripts/e2e-admin.sh <compose-file>` crea l'Admin `E2E_USERNAME`/`E2E_PASSWORD` (codice spostato dal job `e2e`); `scripts/smoke-stack.sh` (env `IMAGE_TAG`, `E2E_*`) exit 0/1; `scripts/rebuild-check.sh <app>` stampa le cause (`a`/`b`/`c`) ed esce 0 = rebuild, 1 = nessuna causa; `scripts/verify-images.sh <tag>` exit 0 se le firme delle tre immagini sono valide.

- [ ] **Step 1:** copiare da ComunicaPA; sostituire nomi immagine (`utenzepa-backend|frontend|tinn`), label `utenzepa.rebuild.reason`, identità cosign `^https://github.com/Comune-di-Montesilvano/UtenzePA/\.github/workflows/release\.yml@refs/(tags/v.*|heads/main)$`; `rebuild-check.sh` usa `apt` per tinn (distro da `/etc/os-release`).
- [ ] **Step 2:** `smoke-stack.sh` controlla: `/api/v1/health/liveness` via frontend, `/config.js`, login con `e2e-admin.sh`, `GET /api/v1/settings/branding` autenticato (migration applicate), upload di un allegato piccolo su un immobile creato via API, `docker compose exec api touch /usr/src/app/x` fallisce (sola lettura), log senza `Read-only file system`/`EACCES`.
- [ ] **Step 3:** prova locale: `IMAGE_TAG=latest scripts/smoke-stack.sh` verde contro lo stack di produzione locale.
- [ ] **Step 4: Commit** `ci(release): script di rebuild, smoke e verifica delle firme`.

### Task 5.2: `release.yml` nuovo

**Files:** Modify: `.github/workflows/release.yml` (riscritto da ComunicaPA); Modify: `.github/workflows/tests.yml` (job `e2e` usa `scripts/e2e-admin.sh`).

- [ ] **Step 1:** job `setup` (modalità tag/schedule/dispatch con input `rebuild_latest` e `dry_run`; `rebuild-check.sh` per app; tolto il salto 24 ore), `build-push` ×3 (push per digest, Trivy bloccante sui tag / non-regressione sul rebuild, SBOM CycloneDX, `attest-build-provenance`, `actions/attest` con `sbom-path`, `cosign sign` keyless), `smoke` (stack con i digest di backend e frontend + `smoke-stack.sh` + Playwright di `e2e/`; tinn come `tinn-runtime`), `publish` ×3 (tag `vX.Y.Z`, `latest` solo al tag più alto, `latest-YYYYMMDD` e `latest` dal rebuild).
- [ ] **Step 2:** `harden-runner` `egress-policy: block` in `build-push`, `smoke`, `publish` con `allowed-endpoints` presi dal log DNS di un run in audit (Step 3) e da quelli di ComunicaPA.
- [ ] **Step 3:** prima run con `egress-policy: audit` (`gh workflow run release.yml -f dry_run=true`, poi `-f rebuild_latest=true` dal branch); ricavare gli host; passare a `block`; ripetere `rebuild_latest=true`: verde.
- [ ] **Step 4: Commit** `ci(release): push per digest, firma, SBOM, smoke prima dei tag`.

### Task 5.3: `verify-images` nel compose e pulizia ghcr

**Files:** Modify: `docker-compose.yml` (servizio `verify-images` come ComunicaPA, `VERIFY_IMAGES=${VERIFY_IMAGES:-false}`, `api`/`frontend`/`tinn` con `depends_on: verify-images: condition: service_completed_successfully`); Modify: `.env.example`; Modify: `.github/workflows/ghcr-cleanup.yml` (rimozione dei digest orfani e delle firme `sha256-<digest>.sig`, come ComunicaPA).

- [ ] **Step 1:** modifiche; `docker compose config` valido con `VERIFY_IMAGES` vuoto, `false`, `true`.
- [ ] **Step 2:** dopo il primo rebuild firmato: `VERIFY_IMAGES=true IMAGE_TAG=latest docker compose up -d` parte; con `IMAGE_TAG` di un tag non firmato (`v1.58.0`) i servizi non partono.
- [ ] **Step 3: Commit** `feat(compose): verifica delle firme prima dell'avvio`.

### Task 5.4: PR, tag `v1.58.1`, verifica

**Files:** Modify: `publiccode.yml` (1.58.1), `CLAUDE.md` (sezione release), `docs/claude/release-ci.md` (verifica con `gh attestation verify` + `scripts/verify-images.sh`, `VERIFY_IMAGES`).

- [ ] **Step 1:** PR, merge, tag `v1.58.1`; run verde; `scripts/verify-images.sh v1.58.1` e `gh attestation verify oci://ghcr.io/comune-di-montesilvano/utenzepa-backend:v1.58.1 --owner Comune-di-Montesilvano` riusciti.
- [ ] **Step 2:** il giorno dopo, run schedule senza cause: verde, nessun digest nuovo (`docker buildx imagetools inspect …:latest` invariato). `gh workflow run ghcr-cleanup.yml -f dry_run=true`: elenca orfani attesi.

---

## Parte 6 — Autofix e governance (PR `ci/autofix-governance`)

### Task 6.1: script dell'autofix parametrizzati (ComunicaPA e UtenzePA)

**Files (prima in `../comunicaPA`, poi copiati qui):** Create: `scripts/security/autofix.config.json`; Modify: `scripts/security/autofix.mjs`, `gh-commit.mjs`, `base-image.mjs`, `apply-npm.mjs` e i loro test.

**Interfaces:** `autofix.config.json` = `{ "pnpmDirs": ["."], "dockerfiles": ["apps/backend/Dockerfile", …], "allowedFiles": ["package.json", "pnpm-lock.yaml", …], "pip": { … } | null }`; gli script leggono solo da qui directory, Dockerfile e file consentiti (oggi fissi in `autofix.mjs` righe ~205/220 e `ALLOWED` in `gh-commit.mjs`).

- [ ] **Step 1 (ComunicaPA):** test nuovi con una config fittizia a due directory pnpm e senza pip: `apply-npm` scrive nella directory giusta, `gh-commit` rifiuta un file fuori `allowedFiles`, `pip` assente = nessuno step pip. FAIL, poi implementazione, PASS con tutti i test esistenti. PR su ComunicaPA `refactor(security): autofix configurabile`.
- [ ] **Step 2 (UtenzePA):** copiare gli script con `autofix.config.json` = `pnpmDirs: ["backend", "frontend", "e2e"]`, `dockerfiles: ["backend/Dockerfile", "frontend/Dockerfile", "tinn/Dockerfile"]`, `allowedFiles` = i tre `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, i tre Dockerfile, `docker-compose.yml`; `pip: null`. `node --test scripts/security/test/` verde.
- [ ] **Step 3: Commit** `ci(security): script dell'autofix configurabili`.

### Task 6.2: `security-autofix.yml` e `lockfile-refresh.yml`

**Files:** Create: `.github/workflows/security-autofix.yml` (da ComunicaPA, senza step pip); Modify: `.github/workflows/lockfile-refresh.yml` (commit via `gh-commit.mjs`/`createCommitOnBranch`, `persist-credentials: false`).

- [ ] **Step 1:** copiare/adattare; `actionlint` verde.
- [ ] **Step 2:** dopo il merge: `gh workflow run security-autofix.yml -f dry_run=true` verde con l'elenco (anche vuoto); `gh workflow run lockfile-refresh.yml` crea (se serve) una PR con commit «Verified».
- [ ] **Step 3: Commit** `ci(security): correzioni autonome delle vulnerabilità`.

### Task 6.3: governance e checklist

**Files:** Create: `CONTRIBUTING.md`; Modify: `.github/PULL_REQUEST_TEMPLATE.md` (checklist test/sicurezza di ComunicaPA); Modify: `docs/claude/release-ci.md` (in fondo: checklist della baseline compilata ✅/n.a. con motivo); Modify: `README.md` (badge Scorecard e Best Practices).

- [ ] **Step 1:** `CONTRIBUTING.md`: ogni fix ha un test di regressione; comandi di test e lint (da CLAUDE.md); Conventional Commits; segnalazioni di sicurezza → `SECURITY.md`.
- [ ] **Step 2:** rieseguire i comandi di verifica della baseline §1–2 e compilare la checklist; ogni voce non ✅ ha il motivo (gap dichiarati: review di una seconda persona, SLSA 3, secret scanning generico; estensione dei test = seconda fase).
- [ ] **Step 3:** domanda per il badge OpenSSF Best Practices (passing) compilata dall'utente su bestpractices.dev (account dell'organizzazione): chiedere all'utente, non farlo per lui.
- [ ] **Step 4:** PR `ci: autofix e governance`, merge; `gh workflow run security.yml` e `security-alerts.yml` verdi; nessuna issue di stato aperta senza motivo.

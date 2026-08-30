# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Panoramica progetto

Gestionale del patrimonio/utenze del Comune di Montesilvano (asset, utenze, fornitori, fatture). Sviluppato da terzi, in allineamento agli standard interni del team (rif. stile `comunicaPA`) tramite un primo giro "soft" — vedi sezione "Allineamento agli standard interni".

Monorepo semplice (nessun workspace tool): `backend/` (NestJS) + `frontend/` (Angular), orchestrati da Docker Compose (root).

| Servizio | Stack | Porta default |
|---|---|---|
| Backend API | NestJS 11 (Node ≥24) | 3000 (debug 9229) |
| Frontend | Angular 22 + Angular Material 22 | 4300 |
| Database | MySQL 8 | 3307 |

**Versioni tool**: usare sempre Docker per lanciare comandi che richiedono versioni software specifiche (`pnpm install`, build, ecc.) — l'host locale può avere Node/pnpm diversi da quelli richiesti dal progetto (`backend/package.json` richiede Node ≥24, potrebbe non corrispondere alla versione installata sulla macchina). `docker exec` sul container `api` (avviato con l'override di sviluppo) garantisce la versione corretta. Se i container dev non sono su (es. altro progetto in esecuzione sulla stessa macchina), per un `pnpm install` una tantum in un worktree separato: `MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd):/app" -w //app node:24 sh -c "corepack enable && pnpm install ..."` (su Windows/Git Bash serve `MSYS_NO_PATHCONV=1` + `-w //app` con doppio slash, altrimenti il path `/app` viene riscritto e il mount fallisce).

Query MySQL dirette (debug/pulizia dati test): `docker exec utenzepa-mysql-1 mysql -uroot -p'<MYSQL_PASSWORD da .env>' mydatabase -e "SELECT ..."`.

Porte locali override in `.env` (non i default di `.env.example`): `DOCKER_API_PORT=3010`, mailpit su `1026`/`8026` — conflitto con altri progetti locali sulla stessa macchina (es. comunicaPA usa 3000/1025/8025).

## Comandi

### Avvio con Docker (root)
Il `docker-compose.yml` di root è ora orientato alla **produzione** (immagini da GHCR, nessun bind mount, secret obbligatori). Per lo sviluppo serve l'override:
```
cp .env.example .env
# scommenta COMPOSE_FILE in .env per attivare docker-compose.override.yml (build locale + bind mount)
docker compose up -d
```
Frontend: http://localhost:4300 — API: http://localhost:3000 — Swagger: http://localhost:3000/api-docs (il README indica `/api`, verificare in `backend/src/main.ts` in caso di dubbio).

### Backend (`backend/`)
```
pnpm run start:dev          # watch mode
pnpm run start:debug        # watch + debugger su 0.0.0.0:9229
pnpm run build && pnpm run start:prod

pnpm run test -- --maxWorkers=2               # tutti gli unit test (jest)
pnpm run test:unit -- --maxWorkers=2          # solo src/**/*.spec.ts
pnpm run test:e2e -- --maxWorkers=2           # test/jest-e2e.json
pnpm run test:integration -- --maxWorkers=2   # jest.integration.config.js, usa mongodb-memory-server
pnpm run test:cov -- --maxWorkers=2           # con coverage
pnpm exec jest path/al/file.spec.ts --maxWorkers=2          # singolo file
pnpm exec jest -t "nome del test" --maxWorkers=2            # singolo test per nome

pnpm run lint                # eslint --fix
pnpm run format               # prettier --write
pnpm run type-check           # tsc --noEmit
```
Sempre con `--maxWorkers=2` sui comandi jest (container/runner con poche CPU disponibili — jest di default ne spawna quanti core rileva ed è facile saturare la macchina).

**Migration DB**: `migrationsRun: true` in `mysql.module.ts` — le migration pendenti girano da sole a ogni avvio (dev e prod). Dopo aver modificato un'entity, generare la migration (dentro il container, sempre — vedi nota Docker sopra):
```
docker exec -u root utenzepa-api-1 node -r ts-node/register -r tsconfig-paths/register node_modules/typeorm/cli.js migration:generate src/database/migrations/NomeMigration -d src/database/data-source.ts
```
`SYNCHRONIZE=true`/`DROPSCHEMA=true` restano disponibili come escape hatch per iterazione rapida in dev, ma bypassano le migration — mai in produzione.
Nota: gli script `docker:dev*` in `backend/package.json` referenziano `docker-compose-development.yml`, che non esiste nel repo — non funzionanti allo stato attuale, usare il `docker-compose.yml` di root o `pnpm run start:dev` in locale.

**Worktree/dev su Windows**: `npm install` con bind-mount diretto della cartella `backend`/`frontend` su Docker Desktop Windows può corrompere `node_modules` (file `package.json` mancanti nei pacchetti, symlink `.bin` non creati — silenzioso, npm riporta successo). Workaround: container con `node_modules` su volume Docker named (non bind-mount) + solo il codice sorgente bind-mountato, es. `docker run -d -v "$(pwd -W)":/usr/src/app -v <nome>-node-modules:/usr/src/app/node_modules -w /usr/src/app node:24-alpine tail -f /dev/null`, poi `npm install` dentro il container. In git-bash su Windows serve `MSYS_NO_PATHCONV=1` + `$(pwd -W)` per i path nei comandi `docker run`.

`child_process.execFile`/`exec` **asincroni** non supportano l'opzione `input` per lo stdin (solo le varianti `*Sync` la supportano) — per pipare dati a un processo figlio (es. `mysql < dump.sql`) serve `spawn` con scrittura esplicita su `child.stdin`. Scoperto implementando il restore backup (PR #36).

`stat.birthtime` non affidabile su alcuni filesystem Linux nei container (overlay2/tmpfs) — può risultare identico per file scritti a pochi millisecondi di distanza. Se serve un timestamp di creazione affidabile, meglio incorporarlo nel nome file (o in un campo DB) invece di fidarsi di `birthtime`.

### Frontend (`frontend/`)
```
pnpm run start        # ng serve, porta 4300
pnpm run build         # ng build --configuration production
ng test               # Karma/Jasmine (non presente come script npm)
```
Nessun ESLint configurato sul frontend.

PrimeNG rimosso interamente dal frontend (migrazione completa a Angular Material — `primeng`/`@primeuix/themes`/`primeicons` non più in `package.json`). Icone: Material Icons (font caricato in `index.html`), font-awesome resta per pochi usi residui (es. `hard-type.enum.ts`).

## Architettura

### Backend
- `src/apis/` — moduli di dominio, uno per risorsa REST: `auth`, `system-users`, `asset`, `asset-aggregators`, `utility`, `utility-types`, `utility-aggregators`, `invoices`, `suppliers`, `budget-chapters`, `consip-agreement`, `costs-borne-by`, `maintenance-managers`, `purpose`, `utilizer`, `utilizer-grant`, `health`.
- `src/core/` — infrastruttura trasversale (auth, database, cronjobs, email, exceptions).
- `src/common/`, `src/helpers/`, `src/utils/`, `src/data-importer/`.
- `src/database/` — migration TypeORM (`migrations/`) e `data-source.ts` dedicato per la CLI. Entity individuate via glob (`src/apis/**/*.entity.ts`), niente elenco esplicito da tenere sincronizzato a mano.
- Persistenza: TypeORM su MySQL. Mongoose/Redis/cache-manager (dipendenze morte ereditate dal template NestJS di partenza) sono stati rimossi.
- Auth: JWT (solo access token, nessun refresh token), bcrypt cost 10 (non 12 — verificare `auth.service.ts`/`system-users.service.ts`/`setup.service.ts` in caso di dubbio). Nessun blocco account dopo tentativi falliti attualmente implementato (`ACCOUNT_LOCKED` in `auth-codes.codes.ts` è un codice errore definito ma mai referenziato altrove). OTP email-based (numero random via `crypto.randomInt`, `backend/src/apis/shared/otp.helper.ts`) usato per il bootstrap `/setup` (`request-otp`/`verify`) e per il reset password (`/auth/generate-otp`/`verify-otp`/`reset-password`) — non per il login, che non ha step OTP. Non è TOTP/2FA con app authenticator (nessun uso di `speakeasy`/`qrcode` nel codice attuale, rimossi come dead dependency in PR di pulizia dedicata).
- Docs API: Swagger, gestione secrets opzionale via Infisical, error tracking opzionale via Sentry.
- Path alias Jest/TS: `@core`, `@apis`, `@common`, `@config`, `@modules`, `@utils` → rispettive cartelle in `src/`.
- Conventional Commits imposti via commitlint + husky/lint-staged (pre-commit).

### Frontend
- Angular standalone components (no NgModule-based feature modules), Angular Material.
- `src/app/pages/` (viste), `src/app/core/` (components/directives/entities/helpers/interfaces/pipes/services/types/validators), `src/app/services/` (es. `auth.service.ts`), `src/app/guards/`.
- Nessuno state manager dedicato (no NgRx/Akita): stato gestito via Angular services + RxJS.
- Config ambiente in `src/environments/environment*.ts` (dev/stage/prod) — contiene `apiUrl` del backend e DSN Sentry. `apiUrl` legge prima `window.__UTENZEPA_CONFIG__` (iniettata a runtime da `nginx/20-runtime-config.sh` via `API_URL` env, vedi `runtime-config.ts`), fallback al valore statico compilato se assente (es. `ng serve`, nessun nginx). Nessun proxy CLI: le chiamate HTTP vanno dirette all'`apiUrl` risolto (frontend e backend sono origin diverse, non stesso dominio via reverse-proxy) — CORS è ristretto via `CORS_ORIGIN` (`main.ts` legge la variabile, non più `cors: true` hardcoded).
- Interceptor HTTP (`core/interceptors/auth-error.interceptor.ts`, registrato in `app.config.ts`): su 401 fa `logout()` + redirect a `/login`. Copre solo le chiamate via `HttpClient` (i servizi che estendono `AbstractService`); `AuthService` usa `axios` direttamente per login/OTP, fuori dall'interceptor (non serve: quelle chiamate non hanno ancora un token da invalidare).
- Route `login` protetta anche da `RedirectToSetupGuard` (guards/redirect-to-setup.guard.ts): se non esiste ancora nessun utente (`GET /setup/status` → `available:true`), redirige automaticamente a `/setup` invece di mostrare il form di login.
- Dockerfile multi-stage: stage `dev` esegue `ng serve`, stage prod builda e serve via `nginx` (SPA fallback su `index.html`, config in `nginx.conf`).
- Angular Material `MatDialog`: `width` da solo non basta oltre 560px — `max-width:560px` (MDC) di default clampa silenziosamente qualsiasi `width` più largo passato in `MatDialogConfig`, va passato anche `maxWidth` esplicito (vedi `AbstractDataTableComponent.editDialogWidth()`).
- Angular template type-checking (binding a input/metodi tipizzati) sfugge a `npm run type-check`/`tsc --noEmit` — solo `ng build`/`ng serve` (compilatore Angular completo) lo cattura. Non considerare una pagina/migrazione frontend conclusa senza una `ng build` reale.
- `FormControl.setValue(v, {emitEvent:false})` non garantisce che nessun subscriber su quella `valueChanges` riceva comunque un'emissione (osservato su `FilterableSelectComponent`, `frontend/src/app/core/components/filterable-select.component.ts`) — in un `ControlValueAccessor` custom, gating della logica "input libero utente" dietro un flag di interazione reale (keydown/paste) è più robusto di `emitEvent:false`.

### Docker Compose (root)
Pattern comunicaPA: `docker-compose.yml` = produzione (immagini `ghcr.io/comune-di-montesilvano/utenzepa-{backend,frontend}`, volumi named, secret obbligatori via `${VAR:?}`), `docker-compose.override.yml` = sviluppo (build locale da Dockerfile, bind mount, porta MySQL/debug esposte), attivato da `COMPOSE_FILE` in `.env`. `.env.example` in root documenta tutte le variabili.

## Allineamento agli standard interni

Primo giro (soft, da PR dedicata) per adeguare il repo alle convenzioni usate negli altri progetti del team (rif. `comunicaPA`): aggiunti `.github/workflows/` (`tests.yml` su push/PR verso main, `release.yml` build&push GHCR su tag `v*`, `publiccode-validate.yml`), split `docker-compose.yml`/`docker-compose.override.yml`, `.env.example` root, `publiccode.yml`.

**Bug corretto in questo giro** (`backend/src/core/database/mysql/mysql.module.ts`): il modulo TypeORM ignorava le variabili passate dal compose. In dev host/porta/user/password erano hardcoded (`mysql`/`3306`/`root`/`password`), in produzione leggeva `DB_HOST`/`DB_PORT`/`DB_USERNAME`/`DB_PASSWORD` (nomi diversi da quelli nel compose, `MYSQL_*`) — una `MYSQL_PASSWORD` forte in `.env` veniva quindi ignorata in silenzio e l'app ricadeva sulla password debole di default. Il nome del database era inoltre sempre hardcoded a `'mydatabase'`, ignorando `MYSQL_DB` in ogni ambiente. Ora il modulo legge sempre `MYSQL_HOST`/`MYSQL_PORT`/`MYSQL_USER`/`MYSQL_PASSWORD`/`MYSQL_DB`, stessi nomi in dev e prod, con gli stessi default di prima come fallback.

**Risolto in giri successivi** (era elencato qui come nota aperta):
- CORS non è più aperto a qualsiasi origine: `main.ts` legge `CORS_ORIGIN` (root `.env`/`docker-compose.yml`, non `backend/.env.example`) e la usa come whitelist.
- Il doppio sistema email non esiste più: `common/mailer/mailer.service.ts` è stato rimosso, resta solo `core/email/email.service.ts`.
- Bootstrap del primo utente Admin implementato: wizard `/setup` (frontend) + `POST /api/v1/setup/{request-otp,verify}` (backend, `backend/src/apis/setup/`). Protetto da OTP email (helper condiviso `backend/src/apis/shared/otp.helper.ts`, usato anche da `AuthService`) **e** da `SETUP_BOOTSTRAP_TOKEN`, secret obbligatorio (root `.env`/`docker-compose.yml`, stesso pattern di `JWT_ACCESS_SECRET`) comunicato fuori banda a chi crea il primo Admin — senza il token corretto la richiesta OTP fallisce anche a DB vuoto.

**Note aperte, non risolte** (da valutare con la ditta terza):
- `backend/.env.example` non riflette le variabili realmente lette dal codice (elenca `MONGODB_URI`, `SMTP_HOST` ecc. non usati, non elenca `MYSQL_*`) — da riscrivere in un giro dedicato.
- NestJS 11→12 bloccato: `@nestjs/typeorm` non ha ancora una release compatibile (ultima 11.0.3, peer `@nestjs/common ^10||^11`) — bumpare gli altri pacchetti `@nestjs/*` a 12 romperebbe il peer con l'ORM wrapper. Nessuna soluzione pulita ora (valutato e scartato: sostituire `@nestjs/typeorm` con cablaggio manuale, o cambiare ORM — entrambe fuori scope). Riprovare quando `@nestjs/typeorm` pubblica una 12.x (dependabot lo segnalerà).
- `mysql.module.ts` ha `invalidWhereValuesBehavior: {null: 'ignore', undefined: 'ignore'}` — escape hatch introdotto col bump TypeORM 1.0 (che di default lancia errore su null/undefined nelle where, comportamento diverso da 0.3.x) per non rompere query esistenti scritte assumendo il vecchio comportamento permissivo. Endpoint `login`/`generate-otp`/`verify-otp`/`reset-password` ora hanno DTO reali con `class-validator` (prima erano literal object non validati dal `ValidationPipe` globale, nonostante `whitelist`/`forbidNonWhitelisted` fossero già configurati) — non più raggiungibili con `undefined` per via diretta. Rivalutare se rimuovere l'escape hatch (passare a `'throw'`) dopo un audit più ampio di tutte le query `where`/`delete` del codebase.

**Debug "il wizard/login non risponde" su un deploy**: quasi sempre `CORS_ORIGIN`/`API_URL` non allineati all'origine reale del browser (`SetupService.getStatus()` in errore di rete ritorna `false` di default, indistinguibile da "admin già esiste" senza controllare la Network tab), oppure c'è già un admin in `system_users`. Controllare prima quei due prima di sospettare un bug applicativo.

Dependabot: `@angular/*` e `@sentry/*` raggruppati in un'unica PR ciascuno (`.github/dependabot.yml`) — i pacchetti di una stessa famiglia vanno aggiornati insieme, un bump isolato rompe il peer dependency resolution (visto su PR #4/#7/#8 Angular, PR #11/#16 Sentry). `@angular/animations` era transitiva (mai dichiarata diretta) finché dipendeva da `primeng`; con la rimozione di PrimeNG è stata dichiarata esplicita in `package.json` (serve direttamente a `provideAnimationsAsync()`) — va comunque tenuta nel gruppo dependabot `@angular/*` andando avanti, altrimenti un bump isolato rompe di nuovo il peer dependency resolution (visto: `@angular/animations` richiede match esatto della versione di `@angular/core`, non solo compatibile in semver).

**Migrazione Angular 20→22 completata**: bloccata in precedenza da PrimeNG 22 diventato a pagamento (PR #29); con PrimeNG rimosso interamente dal frontend, il blocco non sussisteva più. Eseguito `ng update` in 4 passi sequenziali dentro il container `frontend` (Node 24, necessario: Angular 22 richiede Node `^22.22.3 || ^24.15.0 || >=26.0.0`, l'host locale è su Node 20): `@angular/cli@21 @angular/core@21` → `@angular/material@21 @angular/cdk@21` → `@angular/cli@22 @angular/core@22` → `@angular/material@22 @angular/cdk@22`, ognuno con `--allow-dirty` (worktree non pulito tra i passaggi) seguito da `chown -R 1000:1000 node_modules package.json package-lock.json` (il comando gira come root nel container, altrimenti l'utente 1000:1000 con cui gira normalmente l'app non può più scrivere/leggere `node_modules`). Migrazioni automatiche di rilievo: conversione a `@if`/`@for` control-flow (fatta già in un passaggio precedente per le pagine migrate a Material, ma ha toccato anche `login`/`setup`), `ChangeDetectionStrategy.Eager` aggiunto esplicitamente a tutti i componenti (comportamento pre-v22 preservato, non testata la nuova change detection di default), `TypeScript` bumpato a 6.0.3, `withXhr()` aggiunto a `provideHttpClient()`. Bundle iniziale sceso a 1.86MB. Verificato end-to-end con dati reali (604 utenze) via browser: dashboard, tabelle, dialog di modifica con `FilterableSelectComponent` tutti funzionanti.

Fallimento CI su PR dependabot non sempre è lockfile drift risolvibile con `@dependabot rebase`: a volte è un conflitto peer reale, serve bumpare a mano il pacchetto compagno nello stesso branch prima del merge. Casi visti: bump `jasmine-core` maggiore → serve bump anche di `karma-jasmine-html-reporter` (peer range); bump `eslint` maggiore → serve bump anche di `@typescript-eslint/eslint-plugin`+`parser`+`typescript-eslint` (meta-package), e eslint 10 richiede `@eslint/js` come devDependency esplicita (prima transitiva, ora import diretto in `eslint.config.mjs` con flat config). Bump `typescript` a una major non ancora supportata da `@angular/build` (peer `>=6.0 <6.1`): non risolvibile, chiudere la PR finché Angular non aggiorna il peer range.

`gh pr merge --auto` fallisce sempre su questo repo ("Auto merge is not allowed for this repository") — auto-merge disabilitato. Merge sempre manuale (`gh pr merge --squash --delete-branch`); dopo ogni merge le altre PR aperte tornano `BEHIND` (branch protection richiede branch aggiornata) — `gh api repos/OWNER/REPO/pulls/N/update-branch -X PUT` prima di ritentare il merge, una PR alla volta.

`tests.yml` esegue `npm run build` sia su backend sia su frontend (non solo lint+test) — un errore di tipo non preso da `ts-jest` (isolatedModules) può comunque rompere `nest build`/Docker, come successo con Sentry.

`tests.yml` non builda mai immagini Docker (solo `npm/pnpm ci`+lint+test+`nest build`/`ng build` su bare runner) — un `docker build --target production`/`--target prod` rotto viene scoperto solo al primo tag push (`release.yml`). Dopo modifiche ai Dockerfile, testare la build reale (`docker build --target <stage> .`) prima di taggare una release, non fidarsi del solo verde CI. Due bug reali trovati così al primo build produzione mai eseguito (tag v1.0.1 rotto, poi fixato):
- backend Dockerfile stage `prod-deps`: usare `--ignore-scripts` semplice, non `--ignore-scripts=false` — quest'ultimo fa girare anche il `prepare` di root (husky) che fallisce ("husky: not found", devDependency esclusa da `--prod`). bcrypt non ha bisogno di script (binario precompilato via node-gyp-build, funziona identico con o senza `--ignore-scripts`).
- frontend Dockerfile: `pnpm run build` da solo (senza `-- --configuration=production`) — lo script `build` è già `ng build --configuration production`, passare di nuovo il flag lo duplica ("Schema validation failed: Data path must NOT have additional properties").

Spostare un tag dopo un fix (es. release rotta): `git tag -d vX`, `git push origin :refs/tags/vX`, ricreare (`git tag -a vX -m "..."`) e ripushare — rifà partire `release.yml` sul nuovo commit. Sicuro solo se il tag non ha consumer esterni noti.

Dependabot PR: se il branch è stato toccato da altro (es. `gh api .../update-branch`), commentare `@dependabot rebase` fallisce ("edited by someone other than Dependabot") — usare `@dependabot recreate`. Merge sequenziale di più PR dependabot sullo stesso lockfile causa conflitti a cascata sulle successive: ri-aggiornarle (`update-branch` o recreate) una alla volta dopo ogni merge.

`main` è protetta (branch protection API): PR obbligatoria, check `backend`+`frontend` richiesti (branch aggiornata), no force-push/delete, 0 approvazioni umane richieste (CI come unico gate). Push diretti a `main` vengono rifiutati.

**Migration DB (sezione 2 della roadmap, completata)**: aggiunta `src/database/migrations/` + `data-source.ts`, `migrationsRun: true` in `mysql.module.ts` (sempre, dev e prod). Generata `InitialSchema` come baseline dallo schema esistente. `SYNCHRONIZE`/`DROPSCHEMA` restano solo come escape hatch dev, mai in produzione. Testato: due riavvii consecutivi del container `api` puliti, migration idempotente.

**Migrazione npm → pnpm**: pnpm pinnato via `packageManager` in `package.json` (backend e frontend), niente pnpm workspace multi-progetto (backend/frontend restano indipendenti). Script di build nativi (bcrypt, esbuild, ecc.) allowlisted esplicitamente in `pnpm-workspace.yaml` (per progetto) tramite la mappa `allowBuilds: {pkgName: true|false}` — **non** nel campo `"pnpm"` di `package.json` come in altri package manager/versioni pnpm più vecchie: pnpm@11 non legge più quel campo (rimosso, genera solo un warning silenzioso se presente). pnpm blocca gli script non allowlisted per default (gate di sicurezza supply-chain), critico per `bcrypt` (hashing password) che richiede binding nativi compilati. `playwright` (solo pin di sicurezza transitivo in `overrides` del backend, mai importato) escluso esplicitamente (`false` in `allowBuilds`) per evitare il download di ~300MB di Chromium ad ogni install. `ENV CI=true` aggiunto al Dockerfile backend (stage `base`) — necessario perché `pnpm run build` in ambienti non interattivi (Docker/CI) altrimenti abortisce con `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`. Trovato e corretto un bug di build reale durante la migrazione: `backend/src/utils/compression/compressionConfig.ts` richiedeva un'annotazione di tipo di ritorno esplicita, altrimenti TypeScript non riusciva a inferire un nome di tipo portabile per il path annidato nello store pnpm. Bind-mount diretto di `node_modules`/pnpm store su Docker Desktop Windows è catastroficamente lento (10+ minuti vs ~50s) — usare volumi Docker named, stesso pattern già documentato sopra per npm.

## Roadmap allineamento agli standard interni

Gap analysis completa vs comunicaPA (7 sottosistemi, decisioni prese) in `docs/superpowers/specs/2026-08-03-allineamento-standard-interni-design.md`.

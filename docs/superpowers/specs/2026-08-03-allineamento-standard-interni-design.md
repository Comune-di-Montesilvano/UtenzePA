# Allineamento utenzepa agli standard interni — design

Data: 2026-08-03
Riferimento: `comunicaPA` (stesso ente, convenzioni mature del team)

## Contesto

utenzepa è stato commissionato a una ditta terza e sviluppato senza seguire le convenzioni con cui il team gestisce gli altri progetti (rif. `comunicaPA`). Un primo giro "soft" ha già allineato l'infrastruttura di base: workflow GitHub Actions (`tests.yml`, `release.yml` build&push GHCR su tag `v*`, `publiccode-validate.yml`), split `docker-compose.yml` (produzione, immagini registry) / `docker-compose.override.yml` (sviluppo, build locale), `.env.example` root, `publiccode.yml`. In quel giro è stato corretto anche un bug reale in `backend/src/core/database/mysql/mysql.module.ts`: il modulo TypeORM ignorava le variabili passate dal compose (nomi diversi tra dev/prod, nome database sempre hardcoded).

Un'analisi comparativa sistematica (3 agenti paralleli: repo hygiene, backend, frontend) ha trovato ulteriori gap. Questo documento li organizza in 7 sottosistemi indipendenti, ciascuno da trattare con un proprio plan di esecuzione — non un lavoro unico, per evitare un plan che salta da NestJS a nginx a licenze senza filo conduttore. Qui sono fissate le decisioni prese con l'utente, da usare come base per gli spec/plan successivi.

La ditta terza continua a lavorare sul repo in parallelo: le modifiche vanno in branch dedicati, con PR e comunicazione esplicita quando si toccano file condivisi (in particolare il modulo database).

## 1. Sicurezza & compliance

Priorità immediata, rischio di conflitto basso (file isolati, non toccati dalla ditta terza).

- **Leak secret**: `console.log` del secret Infisical in chiaro all'avvio, in `infisical-config.service.ts`/`main.ts`. Da rimuovere.
- **Licenza**: `UNLICENSED` → **EUPL-1.2**. `publiccode.yml` dichiara il software riusabile (art. 69 CAD) — una licenza "tutti i diritti riservati" è incoerente con quella dichiarazione. Stessa licenza usata da comunicaPA. Serve: file `LICENSE` (testo EUPL-1.2), campo `license` in `backend/package.json` e `frontend/package.json`.
- **Guard anti-secret-di-default in produzione**: bootstrap check stile comunicaPA `production-guards.ts`. Se `NODE_ENV=production` e `JWT_ACCESS_SECRET`/`COOKIE_SECRET`/`MYSQL_PASSWORD` contengono ancora il placeholder `change-me-in-production...`, l'app deve rifiutarsi di avviarsi con un errore esplicito, invece di partire silenziosamente con credenziali deboli.
- **README**: aggiungere sezione "Contribuire" (requisiti minimi prima di una PR: lint pulito, test verdi, lettura di CLAUDE.md).

## 2. Persistenza dati — migration DB (implementato)

Rischio più alto di questo elenco: tocca un modulo su cui la ditta terza lavora attivamente.

Oggi lo schema esiste solo se `SYNCHRONIZE=true`; lo stesso flag pilota anche `dropSchema`, quindi una env sbagliata può sia non creare le tabelle sia cancellarle. Nessuna history versionata, nessun rollback controllato.

Decisione: passare a migration TypeORM esplicite, come comunicaPA (`src/database/migrations/`, `data-source.ts` dedicato per la CLI, script `migration:generate`/`migration:run`). Baseline: generare la prima migration dallo schema attuale (via `synchronize=true` su un DB pulito, poi diff con `migration:generate`), per partire da uno snapshot fedele invece che da zero. `SYNCHRONIZE`/`DROPSCHEMA` restano disponibili solo fuori produzione, per comodità di sviluppo.

Da fare in branch dedicato, comunicato esplicitamente alla ditta terza prima di partire (rischio di conflitto se aggiungono entità nel frattempo).

## 3. Test coverage backend

~15 moduli di dominio (`asset`, `invoices`, `suppliers`, `utility-*`, `utilizer*`, ecc.) senza un solo test; i pochi test esistenti (11 file) coprono solo infrastruttura (health, mailer, cronjobs, exceptions, infisical, compression, env-validator).

Decisione: priorità sui moduli critici — `auth`, `invoices`, `asset` (logica di business/dati sensibili) — nessuna soglia percentuale rigida in CI per questo giro. `tests.yml` resta con solo `test:unit`; valutare `test:integration`/`test:e2e` in CI quando i moduli critici hanno copertura solida.

## 4. Frontend — config runtime e interceptor

- **Config runtime**: oggi `environment.ts`/`environment.prod.ts` sono compilati nel bundle a build time — cambiare `apiUrl` per un nuovo ambiente richiede un rebuild dell'immagine. comunicaPA inietta la config a runtime: l'entrypoint nginx genera `assets/config.js` da una variabile d'ambiente (`API_URL`) all'avvio del container, letto da `window.__CONFIG__`. Decisione: adottare lo stesso pattern per utenzepa (`window.__UTENZEPA_CONFIG__`), con fallback al valore statico attuale in `environment.ts` per non rompere `ng serve` in sviluppo locale (dove non c'è nginx).
- **Interceptor HTTP 401**: nessuna gestione centralizzata di sessione scaduta — l'header `Authorization` è aggiunto manualmente per ogni chiamata (`AbstractService.getAuthHeaders()`), un 401 non fa scattare automaticamente logout/redirect. Decisione: `HttpInterceptorFn` che intercetta 401 → logout + redirect a login. Niente gestione refresh-token: `JWT_REFRESH_SECRET` è dead code lato backend (nessun endpoint di refresh reale), quindi non c'è nulla da orchestrare oltre al logout.

## 5. Observability

- **Health readiness fittizia**: `HealthService.isReady()` ritorna sempre `{status: 'ready'}`, non controlla nulla. `@nestjs/terminus` è già una dipendenza ma non è mai importato. Decisione: wire terminus con `TypeOrmHealthIndicator` per controllare davvero la connessione MySQL. **Nota importante**: Redis/`ioredis` non è usato da nessuna parte nel codice (stessa situazione di Mongoose, vedi punto 7) — niente readiness check su Redis, la dipendenza va rimossa, non finta-controllata.
- **Logging**: nessuna gestione di `LOG_LEVEL`, `console.log`/`console.info` sparsi in `main.ts` invece del `Logger` NestJS. Decisione: leggere `LOG_LEVEL` da env e passarlo esplicitamente a `NestFactory.create` (stesso pattern di comunicaPA), sostituire i `console.log` residui con `Logger`.

## 6. CI/Process

- **semantic-release**: configurato nel backend (`.releaserc.json`, dipendenze `@semantic-release/*`, `CHANGELOG.md` con storico ereditato dal vecchio repo) ma nessun workflow lo esegue in CI; il frontend non lo ha affatto. Analizzato il funzionamento (versioning automatico da Conventional Commits, tag/changelog/release generati ad ogni merge) contro il pattern già in uso nel team (tag manuale `v*` che fa scattare la build&push GHCR): sono incompatibili — se semantic-release taggasse automaticamente, il workflow di release partirebbe ad ogni merge in main, senza controllo deliberato sul "quando" rilasciare. **Decisione: rimuovere** (`.releaserc.json`, dipendenze `@semantic-release/*`, script npm correlati). `CHANGELOG.md` resta come storico congelato, non più aggiornato automaticamente.
- **Dependabot**: documentato in `backend/docs/dependabot-auto-merge.md` e `backend/docs/github-rulesets.md`, ma `.github/dependabot.yml` non esiste (né in utenzepa né in comunicaPA — è uno scollamento doc/realtà specifico di utenzepa). **Decisione: aggiungerlo** — `.github/dependabot.yml` con update npm per `backend/`, npm per `frontend/`, e github-actions.

## 7. Pulizia dipendenze morte

Basso rischio, veloce, non tocca comportamento a runtime. Da `backend/package.json`, zero riferimenti nel codice (verificato via grep su `src/`, nessun `@InjectModel`/`MongooseModule`/uso di `ioredis`):
- `mongoose`, `@nestjs/mongoose`
- `ioredis`, `cache-manager`, `keyv`

## Fuori scope (note aperte, non affrontate in questa roadmap)

- CORS aperto a qualsiasi origine (`cors: true` hardcoded); `CORS_ORIGIN` in `.env.example` non è letta da nessun modulo.
- Doppio sistema email: `core/email/email.service.ts` (usato realmente) vs `common/mailer/mailer.service.ts` (generico, da verificare se è wired in `app.module.ts`).
- Bootstrap primo utente Admin: `POST /system-users` richiede già un Admin, nessuno script di seed. A differenza di comunicaPA (auth operatori delegata a LDAP/AD, il problema non esiste), qui gli account sono locali — serve un mini-wizard, subordinato a SMTP funzionante configurato via `.env`. Decisione rimandata.
- `backend/.env.example` non riflette le variabili realmente lette dal codice (elenca `MONGODB_URI`, `SMTP_HOST` ecc. non usati, non elenca `MYSQL_*`) — da riscrivere a parte.

## Prossimi passi

Ogni sezione numerata (1–7) diventa un plan di esecuzione separato (`superpowers:writing-plans`), in ordine di priorità: **1 e 7** (basso rischio, veloce) → **6** (process) → **5** (observability) → **3** (test) → **4** (frontend) → **2** (migration, coordinato con la ditta terza per ultimo, è il più delicato).

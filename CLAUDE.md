# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Panoramica progetto

Gestionale del patrimonio/utenze del Comune di Montesilvano (asset, utenze, fornitori, fatture). Sviluppato da terzi, in allineamento agli standard interni del team (rif. stile `comunicaPA`) tramite un primo giro "soft" — vedi sezione "Allineamento agli standard interni".

Monorepo semplice (nessun workspace tool): `backend/` (NestJS) + `frontend/` (Angular), orchestrati da Docker Compose (root).

| Servizio | Stack | Porta default |
|---|---|---|
| Backend API | NestJS 11 (Node ≥24) | 3000 (debug 9229) |
| Frontend | Angular 20 + PrimeNG 20 | 4300 |
| Database | MySQL 8 | 3307 |

**Versioni tool**: usare sempre Docker per lanciare comandi che richiedono versioni software specifiche (`npm install`, build, ecc.) — l'host locale può avere Node/npm diversi da quelli richiesti dal progetto (`backend/package.json` richiede Node ≥24, potrebbe non corrispondere alla versione installata sulla macchina). `docker exec` sul container `api` (avviato con l'override di sviluppo) garantisce la versione corretta.

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
npm run start:dev          # watch mode
npm run start:debug        # watch + debugger su 0.0.0.0:9229
npm run build && npm run start:prod

npm run test                # tutti gli unit test (jest)
npm run test:unit           # solo src/**/*.spec.ts
npm run test:e2e            # test/jest-e2e.json
npm run test:integration    # jest.integration.config.js, usa mongodb-memory-server
npm run test:cov            # con coverage
npx jest path/al/file.spec.ts          # singolo file
npx jest -t "nome del test"            # singolo test per nome

npm run lint                # eslint --fix
npm run format               # prettier --write
npm run type-check           # tsc --noEmit
```
Nota: gli script `docker:dev*` in `backend/package.json` referenziano `docker-compose-development.yml`, che non esiste nel repo — non funzionanti allo stato attuale, usare il `docker-compose.yml` di root o `npm run start:dev` in locale.

### Frontend (`frontend/`)
```
npm run start        # ng serve, porta 4300
npm run build         # ng build --configuration production
ng test               # Karma/Jasmine (non presente come script npm)
```
Nessun ESLint configurato sul frontend.

## Architettura

### Backend
- `src/apis/` — moduli di dominio, uno per risorsa REST: `auth`, `system-users`, `asset`, `asset-aggregators`, `utility`, `utility-types`, `utility-aggregators`, `invoices`, `suppliers`, `budget-chapters`, `consip-agreement`, `costs-borne-by`, `maintenance-managers`, `purpose`, `utilizer`, `utilizer-grant`, `health`.
- `src/core/` — infrastruttura trasversale (auth, database, cronjobs, email, exceptions).
- `src/common/`, `src/helpers/`, `src/utils/`, `src/data-importer/`.
- Persistenza: TypeORM su MySQL è lo stack effettivamente usato (vedi `docker-compose.yml` root e README). Il progetto include anche Mongoose/MongoDB come dipendenza e variabile `MONGODB_URI` nel compose — probabile residuo del template NestJS di partenza; non assumere che sia in uso reale senza verificare nei moduli specifici.
- Cache/sessioni: Redis (ioredis, cache-manager/keyv).
- Auth: JWT (access+refresh) con 2FA/TOTP (speakeasy, qrcode), bcrypt 12 rounds, blocco account dopo 5 tentativi falliti.
- Docs API: Swagger, gestione secrets opzionale via Infisical, error tracking opzionale via Sentry.
- Path alias Jest/TS: `@core`, `@apis`, `@common`, `@config`, `@modules`, `@utils` → rispettive cartelle in `src/`.
- Conventional Commits imposti via commitlint + husky/lint-staged (pre-commit).

### Frontend
- Angular standalone components (no NgModule-based feature modules), tema PrimeNG "Aura".
- `src/app/pages/` (viste), `src/app/core/` (components/directives/entities/helpers/interfaces/pipes/services/types/validators), `src/app/services/` (es. `auth.service.ts`), `src/app/guards/`.
- Nessuno state manager dedicato (no NgRx/Akita): stato gestito via Angular services + RxJS.
- Config ambiente in `src/environments/environment*.ts` (dev/stage/prod), non `.env` — contiene `apiUrl` del backend e DSN Sentry. Nessun proxy CLI: le chiamate HTTP vanno dirette all'`apiUrl` configurato.
- Dockerfile multi-stage: stage `dev` esegue `ng serve`, stage prod builda e serve via `nginx` (SPA fallback su `index.html`, config in `nginx.conf`).

### Docker Compose (root)
Pattern comunicaPA: `docker-compose.yml` = produzione (immagini `ghcr.io/comune-di-montesilvano/utenzepa-{backend,frontend}`, volumi named, secret obbligatori via `${VAR:?}`), `docker-compose.override.yml` = sviluppo (build locale da Dockerfile, bind mount, porta MySQL/debug esposte), attivato da `COMPOSE_FILE` in `.env`. `.env.example` in root documenta tutte le variabili.

## Allineamento agli standard interni

Primo giro (soft, da PR dedicata) per adeguare il repo alle convenzioni usate negli altri progetti del team (rif. `comunicaPA`): aggiunti `.github/workflows/` (`tests.yml` su push/PR verso main, `release.yml` build&push GHCR su tag `v*`, `publiccode-validate.yml`), split `docker-compose.yml`/`docker-compose.override.yml`, `.env.example` root, `publiccode.yml`.

**Bug corretto in questo giro** (`backend/src/core/database/mysql/mysql.module.ts`): il modulo TypeORM ignorava le variabili passate dal compose. In dev host/porta/user/password erano hardcoded (`mysql`/`3306`/`root`/`password`), in produzione leggeva `DB_HOST`/`DB_PORT`/`DB_USERNAME`/`DB_PASSWORD` (nomi diversi da quelli nel compose, `MYSQL_*`) — una `MYSQL_PASSWORD` forte in `.env` veniva quindi ignorata in silenzio e l'app ricadeva sulla password debole di default. Il nome del database era inoltre sempre hardcoded a `'mydatabase'`, ignorando `MYSQL_DB` in ogni ambiente. Ora il modulo legge sempre `MYSQL_HOST`/`MYSQL_PORT`/`MYSQL_USER`/`MYSQL_PASSWORD`/`MYSQL_DB`, stessi nomi in dev e prod, con gli stessi default di prima come fallback.

**Note aperte, non risolte in questo giro** (da valutare con la ditta terza):
- CORS aperto a qualsiasi origine (`cors: true` hardcoded in `main.ts`); la variabile `CORS_ORIGIN` presente in `backend/.env.example` non è letta da nessun modulo.
- Doppio sistema email: `core/email/email.service.ts` (usato realmente da `AuthMysqlModule`, legge `HOST_EMAIL`/`PORT_EMAIL`/`USERNAME_EMAIL`/`PASSWORD_EMAIL`/`SMTP_SECURE_PROTOCOL`) e `common/mailer/mailer.service.ts` (generico, legge `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASSWORD` — verificare se è effettivamente wired in `app.module.ts` prima di usarlo).
- Nessun meccanismo per creare il primo utente Admin: `POST /system-users` richiede già un Admin (`@Roles('Admin')`), e non esiste script di seed. A differenza di comunicaPA (dove l'auth operatori è delegata a LDAP/AD, quindi il problema non esiste), qui gli account sono locali (bcrypt+JWT) — serve un mini-wizard di bootstrap, subordinato a un SMTP funzionante configurato via `.env` (in discussione con l'utente, non ancora implementato).
- `Mongoose`/`MongoDB` restano dipendenza morta (nessun `@InjectModel`/`MongooseModule` nel codice) — candidati alla rimozione da `package.json` in un giro successivo.
- `backend/.env.example` non riflette le variabili realmente lette dal codice (elenca `MONGODB_URI`, `SMTP_HOST` ecc. non usati, non elenca `MYSQL_*`) — da riscrivere in un giro dedicato.

## Roadmap allineamento agli standard interni

Gap analysis completa vs comunicaPA (7 sottosistemi, decisioni prese) in `docs/superpowers/specs/2026-08-03-allineamento-standard-interni-design.md`.

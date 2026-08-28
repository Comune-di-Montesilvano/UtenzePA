# Migrazione npm → pnpm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire npm con pnpm come package manager in `backend/` e `frontend/`, senza toccare versioni di dipendenze applicative.

**Architecture:** pnpm via corepack (pin in `packageManager` in ciascun `package.json`, stesso pattern già usato per npm). Un `pnpm-lock.yaml` per progetto al posto di `package-lock.json`. Allowlist esplicita degli script di build nativi via `pnpm.onlyBuiltDependencies`/`pnpm.ignoredBuiltDependencies` in `package.json` (niente approvazione interattiva, necessaria per CI non presidiata). Dockerfile e CI aggiornati per usare `pnpm install`/`pnpm run` al posto di `npm ci`/`npm run`.

**Tech Stack:** pnpm 11.24.0 (via corepack, Node ≥16.9 già garantito da Node 24 in uso), Docker, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-28-npm-to-pnpm-migration-design.md`

## Global Constraints

- Nessun bump di dipendenze applicative in questa PR — solo cambio di tooling (dalla spec, sezione "Fuori scope").
- Nessun pnpm workspace — backend e frontend restano progetti indipendenti (dalla spec, sezione "Scope").
- pnpm version pin: `11.24.0` (verificata nello spike, build/lint/test verdi su entrambi i progetti).
- Tutti i comandi npm/pnpm vanno sempre eseguiti dentro Docker (Node ≥24 richiesto, l'host locale può avere una versione diversa — da CLAUDE.md).
- Su Windows/Git Bash, i comandi `docker run` con bind mount richiedono `MSYS_NO_PATHCONV=1` + `-w //app` (doppio slash) per evitare la riscrittura del path — da CLAUDE.md.

---

## File Structure

- `backend/package.json` — aggiungere `pnpm.onlyBuiltDependencies`/`pnpm.ignoredBuiltDependencies`, aggiornare `packageManager`.
- `backend/pnpm-lock.yaml` — nuovo, generato da `pnpm install`.
- `backend/package-lock.json` — rimosso.
- `backend/src/utils/compression/compressionConfig.ts` — annotazione tipo di ritorno esplicita (fix bug pnpm-strict trovato nello spike).
- `backend/Dockerfile` — sostituire gli step `npm install`/`npm ci` con `corepack enable` + `pnpm install`.
- `frontend/package.json` — aggiungere `packageManager`, `pnpm.onlyBuiltDependencies`.
- `frontend/pnpm-lock.yaml` — nuovo, generato da `pnpm install`.
- `frontend/package-lock.json` — rimosso.
- `frontend/Dockerfile` — sostituire gli step `npm install` con `corepack enable` + `pnpm install`.
- `.github/workflows/tests.yml` — sostituire cache/step npm con pnpm in entrambi i job (`backend`, `frontend`).
- `CLAUDE.md` — aggiornare i comandi documentati (`npm run X` → `pnpm run X`).
- `.github/workflows/release.yml` — **nessuna modifica** (builda solo via `docker/build-push-action`, delega tutto al Dockerfile — verificato leggendo il file, non invoca npm/pnpm direttamente).

---

## Task 1: Fix tipo di ritorno in compressionConfig.ts

Questo fix è indipendente dal package manager (annotare un tipo di ritorno esplicito è valido anche sotto npm) — lo isoliamo come primo task per poterlo verificare con la toolchain attuale (npm) prima di introdurre la variabile pnpm.

**Files:**
- Modify: `backend/src/utils/compression/compressionConfig.ts:19`
- Test: nessun nuovo test — verificato tramite `nest build` (type-check)

**Interfaces:**
- Consumes: `compression` (import esistente da `compression`, riga 2)
- Produces: `configureCompression(infisicalConfig: InfisicalConfigService): ReturnType<typeof compression> | null` — firma usata da chi chiama la funzione (nessun altro task tocca i chiamanti, la firma di chiamata resta identica)

- [ ] **Step 1: Verificare il problema esiste già sotto npm (baseline)**

Nota: sotto npm il build passa comunque (il problema emerge solo con la struttura di `node_modules` di pnpm). Questo step serve solo a confermare lo stato attuale prima della modifica.

Run (dentro il container, Node ≥24 richiesto):
```
cd backend
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd):/app" -w //app node:24 sh -c "npm install --ignore-scripts && npm run build"
```
Expected: `nest build` completa senza errori (baseline npm sempre verde).

- [ ] **Step 2: Annotare il tipo di ritorno esplicito**

In `backend/src/utils/compression/compressionConfig.ts`, riga 19, cambiare:

```typescript
export const configureCompression = (infisicalConfig: InfisicalConfigService) => {
```

in:

```typescript
export const configureCompression = (
  infisicalConfig: InfisicalConfigService,
): ReturnType<typeof compression> | null => {
```

- [ ] **Step 3: Rieseguire il build sotto npm per confermare che il fix non rompe nulla**

Run:
```
cd backend
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd):/app" -w //app node:24 sh -c "npm run build"
```
Expected: `nest build` completa senza errori, nessuna differenza rispetto allo Step 1.

- [ ] **Step 4: Commit**

```bash
git add backend/src/utils/compression/compressionConfig.ts
git commit -m "fix: annota tipo di ritorno esplicito in configureCompression

Necessario per compatibilità con la struttura node_modules di pnpm
(la prossima PR migra il package manager) - TypeScript non riesce a
inferire un nome di tipo portabile per il path annidato nello store
pnpm senza un'annotazione esplicita."
```

---

## Task 2: Migrazione backend a pnpm

**Files:**
- Modify: `backend/package.json`
- Create: `backend/pnpm-lock.yaml`
- Delete: `backend/package-lock.json`
- Modify: `backend/Dockerfile`

**Interfaces:**
- Consumes: nessuna dipendenza da altri task (Task 1 già mergiato/completato prima di questo)
- Produces: `backend/pnpm-lock.yaml` — usato dal Task 4 (CI) come `cache-dependency-path`

- [ ] **Step 1: Aggiungere config pnpm a package.json**

In `backend/package.json`, sostituire la riga:
```json
  "packageManager": "npm@11.6.2",
```
con:
```json
  "packageManager": "pnpm@11.24.0",
```

Aggiungere, dopo la chiusura dell'oggetto `"overrides"` (prima della chiusura finale del file, come sezione di primo livello allo stesso indent di `"dependencies"`/`"devDependencies"`):

```json
  "pnpm": {
    "onlyBuiltDependencies": [
      "bcrypt",
      "protobufjs",
      "@sentry/node-cpu-profiler",
      "unrs-resolver",
      "@scarf/scarf"
    ],
    "ignoredBuiltDependencies": [
      "@playwright/browser-chromium"
    ]
  }
```

Nota: `playwright` è presente in `overrides` solo come pin di sicurezza su una dipendenza transitiva (mai importato nel codice, verificato con `grep -rn "from 'playwright'" src/` → nessun risultato) — l'esclusione evita di scaricare ~300MB di Chromium ad ogni install, sia in locale sia in CI.

- [ ] **Step 2: Rimuovere package-lock.json e generare pnpm-lock.yaml**

Run (dentro il container — vedi Global Constraints):
```
cd backend
rm package-lock.json
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd):/app" -w //app node:24 sh -c "corepack enable && pnpm install"
```
Expected: `pnpm-lock.yaml` creato, `node_modules/` popolato, nessun errore `ERR_PNPM_IGNORED_BUILDS` (i pacchetti nell'allowlist vengono buildati automaticamente).

- [ ] **Step 3: Verificare build, lint, test**

Run:
```
cd backend
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd):/app" -w //app node:24 sh -c "corepack enable && pnpm run build && pnpm run lint && pnpm run test:unit -- --maxWorkers=2"
```
Expected: build completa senza errori (il fix del Task 1 rende il build pnpm-compatibile), lint 0 errori (i 7 warning `@typescript-eslint/no-explicit-any` preesistenti restano, non sono nello scope di questa migrazione), tutti i test passano (207 test al momento di scrittura di questo piano).

- [ ] **Step 4: Aggiornare il Dockerfile**

In `backend/Dockerfile`:

Sostituire (stage `base`):
```dockerfile
# Update npm to match host version for consistency
# This prevents package-lock.json discrepancies between dev and Docker
RUN npm install -g npm@${NPM_VERSION}
```
con:
```dockerfile
# Enable corepack per gestire pnpm (versione pinnata in package.json → "packageManager")
RUN corepack enable
```

Sostituire (stage `deps`):
```dockerfile
COPY --chown=node:node package*.json ./

# Install ALL dependencies (needed for building)
# Using npm install instead of npm ci to handle lock file sync issues
# Docker's layer caching still provides fast builds when dependencies don't change
# Skip scripts to avoid Husky installation in Docker (not needed in container)
RUN npm install --ignore-scripts
```
con:
```dockerfile
COPY --chown=node:node package.json pnpm-lock.yaml ./

# Install ALL dependencies (needed for building)
# --ignore-scripts salta husky (non serve in container); gli script di build
# nativi richiesti (bcrypt, ecc.) sono nell'allowlist "pnpm.onlyBuiltDependencies"
# in package.json e vengono comunque eseguiti da pnpm
RUN pnpm install --frozen-lockfile --ignore-scripts
```

Sostituire (stage `build`):
```dockerfile
COPY --chown=node:node package*.json ./
COPY --chown=node:node tsconfig*.json ./
COPY --chown=node:node nest-cli.json ./
COPY --chown=node:node src ./src

# Build the application
RUN npm run build
```
con:
```dockerfile
COPY --chown=node:node package.json pnpm-lock.yaml ./
COPY --chown=node:node tsconfig*.json ./
COPY --chown=node:node nest-cli.json ./
COPY --chown=node:node src ./src

# Build the application
RUN pnpm run build
```

Sostituire (stage `prod-deps`):
```dockerfile
COPY --chown=node:node package*.json ./

# Install ONLY production dependencies
# Install normalmente, il prepare script fallirà ma npm continuerà
RUN npm install --omit=dev || true && \
    npm cache clean --force && \
    rm -rf node_modules/.cache && \
    find node_modules -name '*.md' -delete && \
    find node_modules -name '*.ts' -not -name '*.d.ts' -delete && \
    find node_modules -name '*.map' -delete
```
con:
```dockerfile
COPY --chown=node:node package.json pnpm-lock.yaml ./

# Install ONLY production dependencies
RUN pnpm install --frozen-lockfile --prod --ignore-scripts=false && \
    rm -rf node_modules/.pnpm-store $HOME/.local/share/pnpm/store && \
    find node_modules -name '*.md' -delete && \
    find node_modules -name '*.ts' -not -name '*.d.ts' -delete && \
    find node_modules -name '*.map' -delete
```
(`--ignore-scripts=false` esplicito qui perché in produzione servono i binding nativi di `bcrypt` — a differenza dello stage `deps` che builda anche l'app, qui l'allowlist `onlyBuiltDependencies` in `package.json` resta l'unica fonte di verità su cosa buildare)

Sostituire (stage `development`):
```dockerfile
COPY --chown=nestjs:nodejs package*.json ./

# Install all dependencies (including dev)
# Using npm install to handle lock file sync issues in development
RUN npm install
```
con:
```dockerfile
COPY --chown=nestjs:nodejs package.json pnpm-lock.yaml ./

# Install all dependencies (including dev)
RUN corepack enable && pnpm install
```

E in fondo, sostituire:
```dockerfile
CMD ["npm", "run", "start:dev"]
```
con:
```dockerfile
CMD ["pnpm", "run", "start:dev"]
```

- [ ] **Step 5: Verificare la build Docker completa**

Run:
```
cd backend
docker build --target development -t utenzepa-backend-pnpm-test .
docker build --target production -t utenzepa-backend-pnpm-test-prod .
```
Expected: entrambi gli stage completano senza errori.

- [ ] **Step 6: Commit**

```bash
git add backend/package.json backend/pnpm-lock.yaml backend/Dockerfile
git rm backend/package-lock.json
git commit -m "chore: migra backend da npm a pnpm

- packageManager pinnato a pnpm@11.24.0 (corepack)
- allowlist esplicita script di build nativi (bcrypt, protobufjs,
  sentry-cpu-profiler, unrs-resolver, scarf); playwright escluso
  (mai usato, solo pin di sicurezza transitivo - risparmia ~300MB
  di download Chromium ad ogni install)
- Dockerfile aggiornato su tutti gli stage (base/deps/build/prod-deps/
  production/development)
- Nessun bump di dipendenze applicative"
```

---

## Task 3: Migrazione frontend a pnpm

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/pnpm-lock.yaml`
- Delete: `frontend/package-lock.json`
- Modify: `frontend/Dockerfile`

**Interfaces:**
- Consumes: nessuna dipendenza da altri task
- Produces: `frontend/pnpm-lock.yaml` — usato dal Task 4 (CI) come `cache-dependency-path`

- [ ] **Step 1: Aggiungere config pnpm a package.json**

In `frontend/package.json`, aggiungere subito dopo `"license": "EUPL-1.2",` (riga 3):

```json
  "packageManager": "pnpm@11.24.0",
  "pnpm": {
    "onlyBuiltDependencies": [
      "esbuild",
      "@parcel/watcher",
      "lmdb",
      "msgpackr-extract"
    ]
  },
```

- [ ] **Step 2: Rimuovere package-lock.json e generare pnpm-lock.yaml**

Run:
```
cd frontend
rm package-lock.json
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd):/app" -w //app node:24 sh -c "corepack enable && pnpm install"
```
Expected: `pnpm-lock.yaml` creato, nessun errore `ERR_PNPM_IGNORED_BUILDS`.

- [ ] **Step 3: Verificare la build**

Run:
```
cd frontend
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd):/app" -w //app node:24 sh -c "corepack enable && pnpm run build"
```
Expected: `Application bundle generation complete`, output in `dist/montesilvano-fe`. I warning esistenti (`isolatedModules`, `NG8113` su `FormatAmountPipe`, deprecazione `@import` Sass, `reflect-metadata` non-ESM) sono preesistenti e fuori scope — non bloccano il build.

- [ ] **Step 4: Aggiornare il Dockerfile**

In `frontend/Dockerfile`, sostituire (stage `base`):
```dockerfile
FROM node:24 AS base

WORKDIR /app

# Copia package.json e package-lock.json
COPY package*.json ./

RUN npm install
```
con:
```dockerfile
FROM node:24 AS base

WORKDIR /app

RUN corepack enable

# Copia package.json e pnpm-lock.yaml
COPY package.json pnpm-lock.yaml ./

RUN pnpm install
```

Sostituire (stage `dev`):
```dockerfile
# Installazione globale di Angular CLI
RUN npm install -g @angular/cli
```
con:
```dockerfile
# Installazione globale di Angular CLI
RUN pnpm install -g @angular/cli
```

Sostituire (stage `build`):
```dockerfile
RUN npm run build --configuration=production
```
con:
```dockerfile
RUN pnpm run build -- --configuration=production
```

- [ ] **Step 5: Verificare la build Docker completa**

Run:
```
cd frontend
docker build --target dev -t utenzepa-frontend-pnpm-test .
docker build --target prod -t utenzepa-frontend-pnpm-test-prod .
```
Expected: entrambi gli stage completano senza errori.

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml frontend/Dockerfile
git rm frontend/package-lock.json
git commit -m "chore: migra frontend da npm a pnpm

- packageManager pinnato a pnpm@11.24.0 (corepack)
- allowlist script di build nativi (esbuild, @parcel/watcher, lmdb,
  msgpackr-extract - tooling interno Angular CLI)
- Dockerfile aggiornato su tutti gli stage (base/dev/build)
- Nessun bump di dipendenze applicative"
```

---

## Task 4: Aggiornare CI (tests.yml)

**Files:**
- Modify: `.github/workflows/tests.yml`

**Interfaces:**
- Consumes: `backend/pnpm-lock.yaml` (Task 2), `frontend/pnpm-lock.yaml` (Task 3) — devono già esistere sul branch prima che questo task possa essere verificato in CI
- Produces: nessuna interfaccia consumata da altri task

- [ ] **Step 1: Sostituire lo step di setup Node/npm nel job backend**

In `.github/workflows/tests.yml`, sostituire (job `backend`):
```yaml
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: 'npm'
          cache-dependency-path: backend/package-lock.json

      - run: npm ci
      - run: npm run lint
      - run: npm run test:unit
      - run: npm run build
```
con:
```yaml
      - uses: pnpm/action-setup@v4
        with:
          version: 11.24.0

      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: 'pnpm'
          cache-dependency-path: backend/pnpm-lock.yaml

      - run: pnpm install --frozen-lockfile
      - run: pnpm run lint
      - run: pnpm run test:unit
      - run: pnpm run build
```

- [ ] **Step 2: Sostituire lo step di setup Node/npm nel job frontend**

Sostituire (job `frontend`):
```yaml
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json

      - run: npm ci
      - run: npm run build
```
con:
```yaml
      - uses: pnpm/action-setup@v4
        with:
          version: 11.24.0

      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: 'pnpm'
          cache-dependency-path: frontend/pnpm-lock.yaml

      - run: pnpm install --frozen-lockfile
      - run: pnpm run build
```

Nota: `actions/setup-node` con `cache: 'pnpm'` richiede che pnpm sia già disponibile sul PATH quando lo step viene eseguito — per questo `pnpm/action-setup` va sempre prima di `actions/setup-node` nello stesso job.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/tests.yml
git commit -m "ci: aggiorna tests.yml per usare pnpm invece di npm

pnpm/action-setup pinnato alla stessa versione 11.24.0 di
packageManager in backend/frontend, prima di actions/setup-node
(richiesto per cache: 'pnpm')."
```

Questo task si verifica solo aprendo la PR (Task 6) — non è testabile in isolamento senza eseguire l'intera pipeline CI di GitHub Actions.

---

## Task 5: Aggiornare CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nessuna
- Produces: nessuna

- [ ] **Step 1: Sostituire i comandi backend nella sezione "Comandi"**

Cercare in `CLAUDE.md` il blocco di comandi backend (sezione `### Backend (`backend/`)`) e sostituire ogni occorrenza di `npm run` con `pnpm run` e `npx jest` con `pnpm exec jest`. Esempio (adattare alle righe esatte presenti al momento dell'esecuzione, il contenuto esatto potrebbe essere leggermente diverso da quello letto in fase di design):

```
npm run start:dev          # watch mode
```
diventa:
```
pnpm run start:dev          # watch mode
```

(ripetere per tutte le righe `npm run ...`/`npx jest ...`/`npx ...` in quella sezione)

- [ ] **Step 2: Sostituire i comandi frontend nella sezione "Comandi"**

Stesso pattern nella sezione `### Frontend (`frontend/`)`:
```
npm run start        # ng serve, porta 4300
npm run build         # ng build --configuration production
```
diventa:
```
pnpm run start        # ng serve, porta 4300
pnpm run build         # ng build --configuration production
```

- [ ] **Step 3: Aggiornare la nota "Versioni tool" sul comando Docker ad-hoc**

Cercare la riga che inizia con `Se i container dev non sono su...` (sezione "Versioni tool") e sostituire l'esempio `npm install ...` con l'equivalente pnpm:

```
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd):/app" -w //app node:24 npm install ...
```
diventa:
```
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd):/app" -w //app node:24 sh -c "corepack enable && pnpm install ..."
```

- [ ] **Step 4: Aggiungere una nota sulla migrazione**

Nella sezione "Allineamento agli standard interni", aggiungere in fondo (prima di "## Roadmap allineamento agli standard interni"):

```markdown
**Migrazione npm → pnpm**: pnpm pinnato via `packageManager` in `package.json` (backend e frontend), niente pnpm workspace (progetti indipendenti). Script di build nativi (bcrypt, esbuild, ecc.) allowlisted esplicitamente in `pnpm.onlyBuiltDependencies`/`ignoredBuiltDependencies` — pnpm blocca gli script non presenti in lista per default (gate di sicurezza supply-chain), critico per `bcrypt` (hashing password) che richiede binding nativi compilati. `playwright` (solo pin di sicurezza transitivo in `overrides`, mai importato) escluso esplicitamente per evitare il download di ~300MB di Chromium ad ogni install. Trovato e corretto un bug di build reale durante la migrazione: `backend/src/utils/compression/compressionConfig.ts` richiedeva un'annotazione di tipo di ritorno esplicita, altrimenti TypeScript non riusciva a inferire un nome di tipo portabile per il path annidato nello store pnpm.
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: aggiorna CLAUDE.md per riflettere la migrazione a pnpm"
```

---

## Task 6: Aprire PR e verificare CI

**Files:** nessuno (task di integrazione)

**Interfaces:**
- Consumes: tutti i commit dei Task 1-5
- Produces: PR mergiata su `main`

- [ ] **Step 1: Push del branch e apertura PR**

```bash
git push origin <nome-branch>
gh pr create --title "chore: migra npm -> pnpm (backend + frontend)" --body "Vedi design: docs/superpowers/specs/2026-08-28-npm-to-pnpm-migration-design.md

Nessun bump di dipendenze applicative in questa PR - solo cambio di package manager. Fix incluso: annotazione tipo di ritorno esplicita in compressionConfig.ts (richiesta dalla struttura node_modules di pnpm)." --base main
```

- [ ] **Step 2: Verificare i check CI**

```bash
gh pr checks <numero-pr>
```
Expected: job `backend` e `frontend` entrambi verdi. Se falliscono, leggere il log (`gh run view <run-id> --log-failed`) — non procedere al merge finché non sono verdi.

- [ ] **Step 3: Merge**

```bash
gh pr merge <numero-pr> --squash --delete-branch
```

(Se il branch risulta `BEHIND` per merge di altre PR nel frattempo, aggiornare con `gh api repos/OWNER/REPO/pulls/<numero-pr>/update-branch -X PUT` e riattendere i check prima di ritentare — pattern documentato in CLAUDE.md.)

---

## Task 7: Verifica dependabot post-merge

**Files:** nessuno (verifica manuale)

**Interfaces:**
- Consumes: `main` aggiornato con `pnpm-lock.yaml` in entrambi i progetti (Task 6)
- Produces: conferma scritta (commento o nota) che dependabot riconosce il nuovo lockfile

Questo task richiede che sia passato il tempo di uno scan dependabot dopo il merge (schedule settimanale in `.github/dependabot.yml`, oppure trigger manuale se disponibile) — non è eseguibile subito dopo il merge del Task 6.

- [ ] **Step 1: Forzare uno scan dependabot (se possibile) o attendere lo schedule**

```bash
gh api repos/Comune-di-Montesilvano/UtenzePA/dependabot/updates -X POST 2>&1 || echo "trigger manuale non disponibile su questo piano GitHub, attendere lo schedule settimanale"
```

- [ ] **Step 2: Verificare che dependabot apra normalmente una PR basata su pnpm-lock.yaml**

```bash
gh pr list --state open --json number,title,author --jq '.[] | select(.author.login == "app/dependabot")'
```
Expected (dopo lo scan): almeno una PR dependabot aperta che modifica `pnpm-lock.yaml` (non più `package-lock.json`), a conferma che `package-ecosystem: npm` in `.github/dependabot.yml` riconosce nativamente il lockfile pnpm senza bisogno di modifiche di config.

- [ ] **Step 3: Documentare l'esito**

Se confermato, nessuna azione ulteriore necessaria. Se dependabot NON apre PR entro un ciclo di schedule ragionevole, aprire un task di follow-up per investigare (fuori scope di correzione automatica in questo piano — richiede giudizio umano su cosa sia "ragionevole" per lo schedule settimanale configurato).

---

## Self-Review (completato in fase di stesura)

**Copertura spec**: package manager (Task 2, 3) ✓, allowlist build script (Task 2, 3) ✓, fix compressionConfig.ts (Task 1) ✓, Docker (Task 2 Step 4, Task 3 Step 4) ✓, CI (Task 4) ✓, verifica dependabot esplicita (Task 7) ✓, documentazione (Task 5) ✓, release.yml verificato e correttamente escluso (nessuna modifica necessaria, delega tutto al Dockerfile) ✓, fuori scope rispettato (nessun bump dipendenze in nessun task) ✓.

**Placeholder scan**: nessun TBD/TODO. Il Task 5 Step 1 nota esplicitamente che il testo esatto va adattato alle righe presenti al momento (non un placeholder — è un'istruzione di ricerca-e-sostituzione su un file che può essere lievemente cambiato da altri merge nel frattempo, con l'esempio concreto di cosa cercare/sostituire).

**Coerenza tipi/nomi**: versione pnpm `11.24.0` coerente in tutti i task (package.json, Dockerfile via corepack, CI). Nomi pacchetti nell'allowlist coerenti con quanto trovato nello spike (bcrypt, protobufjs, @sentry/node-cpu-profiler, unrs-resolver, @scarf/scarf, @playwright/browser-chromium per backend; esbuild, @parcel/watcher, lmdb, msgpackr-extract per frontend).

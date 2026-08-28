# Migrazione da npm a pnpm — design

Data: 2026-08-28
Stato: approvato per implementazione

## Obiettivo

Sostituire npm con pnpm come package manager per `backend/` e `frontend/`, in un'unica PR che copre entrambi i progetti. Nessun bump di dipendenze applicative in questa PR — è un cambio di tooling isolato, testabile e revertibile indipendentemente da eventuali aggiornamenti di pacchetti (vedi "Fuori scope").

## Motivazione

Richiesta esplicita dell'utente. Vantaggi attesi: install più veloci (store content-addressable condiviso), meno spazio disco, rilevamento più severo di phantom dependencies (pacchetti importati nel codice ma non dichiarati direttamente — tollerati da npm via hoisting).

## Scope

Backend e frontend insieme, stessa PR. Non è previsto pnpm workspace (il repo resta "monorepo semplice" senza tool dedicato, come documentato in CLAUDE.md — backend e frontend non condividono codice).

## Verifica preliminare (spike)

Eseguito uno spike in un worktree isolato (`pnpm install` + `pnpm run build/lint/test` via container Docker ad-hoc, node:24) prima di scrivere questa spec, per sostituire rischi ipotetici con evidenza reale. Risultati:

- **Backend**: `pnpm install` blocca l'esecuzione degli script di build nativi per default (comportamento pnpm ≥10, gate di sicurezza supply-chain). Pacchetti coinvolti: `bcrypt` (bindings nativi — **critico**, senza binding compilato l'hashing password rischia di rompersi silenziosamente), `protobufjs`, `@sentry/node-cpu-profiler`, `unrs-resolver`, `@scarf/scarf`, e `@playwright/browser-chromium` (scarica ~300MB di Chromium).
- `playwright` in `backend/package.json` è presente solo in `overrides` (pin di sicurezza su una dipendenza transitiva) — mai importato nel codice. Il download di Chromium è puro spreco, va escluso esplicitamente.
- **Bug reale trovato**: `nest build` fallisce sotto pnpm — `backend/src/utils/compression/compressionConfig.ts`, la funzione `configureCompression` non ha un tipo di ritorno esplicito e TypeScript non riesce a inferire un nome portabile per il tipo (il path annidato nello store pnpm, es. `.pnpm/@types+express-serve-static-core@.../node_modules/...`, non è referenziabile in una `.d.ts` emessa). Fix verificato: annotare il tipo di ritorno esplicitamente (`ReturnType<typeof compression> | null`). Nessun altro file coinvolto.
- **Frontend**: stesso gate sugli script nativi, ma su pacchetti innocui (tooling interno Angular CLI: `esbuild`, `@parcel/watcher`, `lmdb`, `msgpackr-extract`). Build verificata verde senza modifiche al codice.

## Modifiche previste

### 1. Package manager

- `corepack enable` + campo `"packageManager": "pnpm@<versione>"` in `backend/package.json` e `frontend/package.json` (stesso pattern già usato per npm, vedi campo `packageManager`/`volta` esistente in `backend/package.json`).
- Sostituire `package-lock.json` con `pnpm-lock.yaml` in entrambi i progetti (generato da `pnpm install`, committato).

### 2. Allowlist script di build (esplicita, non interattiva)

Config in `pnpm.onlyBuiltDependencies` / `pnpm.ignoredBuiltDependencies` dentro ciascun `package.json` (pnpm li legge nativamente, nessun file di config aggiuntivo):

- **Backend** — `onlyBuiltDependencies`: `bcrypt`, `protobufjs`, `@sentry/node-cpu-profiler`, `unrs-resolver`, `@scarf/scarf`. `ignoredBuiltDependencies`: `@playwright/browser-chromium` (mai usato, risparmia il download in ogni run CI/dev).
- **Frontend** — `onlyBuiltDependencies`: `esbuild`, `@parcel/watcher`, `lmdb`, `msgpackr-extract`.

Questo evita che un `pnpm install` in CI si blocchi in attesa di un'approvazione interattiva mai data.

### 3. Fix di codice (backend)

`backend/src/utils/compression/compressionConfig.ts`: annotare esplicitamente il tipo di ritorno di `configureCompression`. Unico file toccato per rendere la build pnpm-compatibile.

### 4. Docker

- `backend/Dockerfile` e `frontend/Dockerfile`: `corepack enable` prima dell'install; sostituire `npm ci`/`npm install` con `pnpm install --frozen-lockfile` (stage prod) o `pnpm install` (stage dev, bind mount già gestito dal volume named `node_modules` esistente — nessuna modifica al mount, pnpm scrive comunque dentro `node_modules/`).

### 5. CI

- `.github/workflows/tests.yml`: aggiungere `corepack enable` prima degli step di install; sostituire `npm ci` → `pnpm install --frozen-lockfile`, `npm run X` → `pnpm run X`.
- `.github/workflows/release.yml`: stesso pattern se invoca npm direttamente (verificare in implementazione — potrebbe delegare tutto al Dockerfile, nel qual caso non serve toccarlo).

### 6. Verifica dependabot (esplicita, non assunta)

Dopo il merge, il piano di implementazione include un passaggio di verifica: aspettare (o forzare, se `gh` lo consente) un ciclo di scansione dependabot e confermare che apra normalmente una PR di aggiornamento basata su `pnpm-lock.yaml`, prima di considerare la migrazione conclusa. Nessuna modifica a `.github/dependabot.yml` prevista (`package-ecosystem: npm` copre nativamente i lockfile pnpm), ma va confermato con un test reale, non assunto.

### 7. Documentazione

- `CLAUDE.md`: sostituire i comandi `npm run X`/`npm install` con l'equivalente `pnpm` nelle sezioni Comandi; aggiungere una nota sul pattern Docker ad-hoc per pnpm (analoga a quella già presente per npm) se emerge la necessità durante l'implementazione.
- `README.md`: verificare se ci sono comandi npm espliciti da aggiornare.

## Fuori scope

- Nessun bump di dipendenze applicative in questa PR (deciso esplicitamente: separare il cambio di tooling da eventuali aggiornamenti major, per non mescolare due variabili di rischio nello stesso commit — pattern di rottura già visto ripetutamente in questo repo con bump isolati/multipli, vedi CLAUDE.md sezione Dependabot). Un giro di aggiornamento dipendenze (incluso l'upgrade a NestJS 12, TypeORM 1.x, ecc. se voluto) va pianificato separatamente dopo che questa migrazione è stabile in `main`.
- Nessuna introduzione di pnpm workspace (non necessario, i due progetti non condividono codice).

## Piano di validazione

1. Build + lint + test completi su backend e frontend in locale (container Docker, coerente con CLAUDE.md) prima di aprire la PR.
2. CI reale (`tests.yml`) verde sulla PR come conferma finale.
3. Verifica dependabot post-merge (vedi punto 6).

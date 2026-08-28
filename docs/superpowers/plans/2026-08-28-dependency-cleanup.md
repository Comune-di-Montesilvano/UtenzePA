# Pulizia dipendenze morte + TypeORM 1.x + frontend minor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rimuovere 14 dipendenze backend morte, aggiornare TypeORM 0.3→1.1, aggiornare axios frontend 1.19→1.20 e rimuovere `@types/axios` deprecato — tre PR indipendenti e sequenziali.

**Architecture:** Ogni PR isolata: rimozione pacchetti non usati (verificati con grep diretto nel codice, non solo tool automatici), bump TypeORM con fix mirati ai 2 soli file che usano sintassi rimossa più una rete di sicurezza sul cambio di comportamento null/undefined nelle where, bump frontend minor a rischio nullo. Nessun cambio a NestJS (bloccato, vedi spec).

**Tech Stack:** pnpm 11.24.0, NestJS 11 (invariato), TypeORM 1.1.0, Angular 22 (invariato), Docker per ogni comando (Node ≥24).

**Spec:** `docs/superpowers/specs/2026-08-28-dependency-cleanup-design.md`

## Global Constraints

- Nessun bump di NestJS in questo piano (bloccato — `@nestjs/typeorm` non ha release compatibile con NestJS 12).
- Ogni comando npm/pnpm va eseguito dentro Docker (Node ≥24 richiesto).
- Ogni `docker run`/`docker build` va limitato con `--cpus=2 --memory=4g`.
- Ogni comando va vincolato a un timeout di 10 minuti (`timeout 600 <comando>`); se scade, fermarsi e riportare, non ritentare identico.
- PR sequenziali: ogni PR va mergiata (o comunque completata la sua verifica CI) prima di iniziare la successiva.

---

## File Structure

- `backend/package.json` — rimozione 14 pacchetti (PR1), bump `typeorm` (PR2).
- `backend/pnpm-lock.yaml` — rigenerato in entrambe le PR1/PR2.
- `CLAUDE.md` — correzione nota 2FA/TOTP obsoleta (PR1).
- `backend/src/apis/auth/auth.service.ts` — sintassi `select` array→oggetto (PR2).
- `backend/src/apis/utility/utility.service.ts` — sintassi `relations` array→oggetto (PR2).
- `backend/src/core/database/mysql/mysql.module.ts` — aggiunta opzione `invalidWhereValuesBehavior` (PR2).
- `frontend/package.json` — bump `axios`, rimozione `@types/axios` (PR3).
- `frontend/pnpm-lock.yaml` — rigenerato (PR3).

---

## Task 1: Pulizia dead-dep backend (PR1)

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/pnpm-lock.yaml` (rigenerato da `pnpm install`)
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nessuna
- Produces: nessuna (nessun altro task dipende da questo, ma va mergiato prima del Task 2 per evitare conflitti di lockfile)

- [ ] **Step 1: Rimuovere le 14 dipendenze morte da package.json**

In `backend/package.json`, rimuovere queste righe esatte dalla sezione `"dependencies"`:
```json
    "@nestjs/mapped-types": "^2.1.0",
```
```json
    "axios": "^1.20.0",
```
```json
    "clean": "^4.0.2",
```
```json
    "dayjs": "^1.11.18",
```
```json
    "fast-csv": "^5.0.5",
```
```json
    "js-yaml": "^5.2.3",
```
```json
    "papaparse": "^5.5.3",
```
```json
    "passport-local": "^1.0.0",
```
```json
    "qrcode": "^1.5.4",
```
```json
    "speakeasy": "^2.0.0",
```
```json
    "uuid": "^14.0.2"
```

E dalla sezione `"devDependencies"`:
```json
    "@types/qrcode": "^1.5.5",
```
```json
    "@types/speakeasy": "^2.0.10",
```
```json
    "@types/passport-local": "^1.0.38",
```

Attenzione alle virgole finali: se una riga rimossa era l'ultima della sua sezione (termina senza virgola), la riga precedente rimasta va privata della virgola finale, o viceversa se la riga rimossa non era l'ultima — verificare che il JSON risultante sia sintatticamente valido (nessuna virgola pendente, nessuna virgola mancante) prima di procedere.

- [ ] **Step 2: Verificare che il JSON sia valido e rigenerare il lockfile**

Run (dentro il container — vedi Global Constraints):
```
cd backend
timeout 600 docker run --rm --cpus=2 --memory=4g -v "$(pwd):/app" -v <nome-volume>-store:/root/.local/share/pnpm/store -w //app node:24 sh -c "corepack enable && pnpm install"
```
(Usare `MSYS_NO_PATHCONV=1` se su Windows/Git Bash, come da CLAUDE.md.)
Expected: nessun errore di parsing JSON, `pnpm-lock.yaml` rigenerato senza le 14 dipendenze rimosse, nessun errore `ERR_PNPM_ABORTED` o simile.

- [ ] **Step 3: Verificare build, lint, test**

Run:
```
cd backend
timeout 600 docker run --rm --cpus=2 --memory=4g -v "$(pwd):/app" -v <stesso-nome-volume>-store:/root/.local/share/pnpm/store -w //app node:24 sh -c "corepack enable && pnpm run build && pnpm run lint && pnpm run test:unit -- --maxWorkers=2"
```
Expected: build exit 0, lint 0 errori (i 7 warning `@typescript-eslint/no-explicit-any` preesistenti restano, fuori scope), tutti i test passano (207 test al momento di scrittura di questo piano — se il numero è diverso, verificare che il delta sia spiegabile, es. nuovi test aggiunti da altre PR nel frattempo, non un regresso).

Se un test fallisce con un errore relativo a un modulo mancante (es. "Cannot find module 'speakeasy'"), significa che quella dipendenza NON era in realtà morta — fermarsi, NON rimuoverla, e riportare quale test l'ha rivelato (questo pianoè stato verificato con grep statico su `src/`, ma un test potrebbe esercitare un percorso che il grep non ha colto, es. tramite `require()` dinamico).

- [ ] **Step 4: Correggere la nota 2FA/TOTP obsoleta in CLAUDE.md**

Cercare in `CLAUDE.md` la riga (sezione Architettura → Backend) che menziona:
```
- Auth: JWT (access+refresh) con 2FA/TOTP (speakeasy, qrcode), bcrypt 12 rounds, blocco account dopo 5 tentativi falliti.
```
Sostituire con:
```
- Auth: JWT (access+refresh), bcrypt 12 rounds, blocco account dopo 5 tentativi falliti. OTP email-based (numero random via `crypto.randomInt`, `backend/src/apis/shared/otp.helper.ts`) per il flusso `/setup` e login — non è TOTP/2FA con app authenticator (nessun uso di `speakeasy`/`qrcode` nel codice attuale, rimossi come dead dependency in PR di pulizia dedicata).
```
(Il testo esatto della riga da cercare potrebbe differire leggermente da quello sopra se la sezione è cambiata nel frattempo — cercare la sottostringa "2FA/TOTP" per localizzarla.)

- [ ] **Step 5: Commit**

```bash
git add backend/package.json backend/pnpm-lock.yaml CLAUDE.md
git commit -m "chore: rimuove 14 dipendenze backend morte, mai importate nel codice

Verificate con grep diretto in src/ (non solo depcheck, che genera falsi
positivi su decoratori/import path-alias): @nestjs/mapped-types, axios,
clean, dayjs, fast-csv, js-yaml, papaparse, passport-local, qrcode,
speakeasy, uuid, @types/qrcode, @types/speakeasy, @types/passport-local.

@sentry/node mantenuto nonostante il flag depcheck: è peer dependency
reale di @sentry/nestjs, mai importato direttamente ma necessario.

Corretta anche una nota CLAUDE.md obsoleta: il 2FA documentato come
TOTP (speakeasy/qrcode) non esiste più nel codice, l'OTP reale è un
numero random via email."
```

- [ ] **Step 6: Aprire PR, verificare CI, merge**

```bash
git push origin <nome-branch>
gh pr create --title "chore: rimuove dipendenze backend morte" --body "Vedi design: docs/superpowers/specs/2026-08-28-dependency-cleanup-design.md (PR 1 di 3). Nessun bump di versione, solo rimozione di pacchetti mai importati nel codice." --base main
gh pr checks <numero-pr>
```
Expected: check `backend` e `frontend` verdi. Se falliscono, leggere il log prima di procedere.

```bash
gh pr merge <numero-pr> --squash --delete-branch
```
(Se il branch risulta `BEHIND`, aggiornare con `gh api repos/OWNER/REPO/pulls/<numero-pr>/update-branch -X PUT` e riattendere i check.)

---

## Task 2: TypeORM 0.3 → 1.1 (PR2)

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/pnpm-lock.yaml`
- Modify: `backend/src/apis/auth/auth.service.ts:22`
- Modify: `backend/src/apis/utility/utility.service.ts:204-214`
- Modify: `backend/src/core/database/mysql/mysql.module.ts`

**Interfaces:**
- Consumes: nessuna dipendenza diretta dal Task 1, ma va eseguito su un branch aggiornato da `main` dopo il merge del Task 1 (per evitare conflitti sul lockfile)
- Produces: nessuna interfaccia consumata da altri task

- [ ] **Step 1: Bump typeorm in package.json**

In `backend/package.json`, sostituire:
```json
    "typeorm": "^0.3.27",
```
con:
```json
    "typeorm": "^1.1.0",
```

- [ ] **Step 2: Rigenerare il lockfile**

Run:
```
cd backend
timeout 600 docker run --rm --cpus=2 --memory=4g -v "$(pwd):/app" -v <nome-volume>-store:/root/.local/share/pnpm/store -w //app node:24 sh -c "corepack enable && pnpm install"
```
Expected: `typeorm@1.1.0` risolto nel lockfile rigenerato, nessun errore di peer dependency con `@nestjs/typeorm` (già verificato compatibile: `@nestjs/typeorm@11.0.3` peer `typeorm: ^0.3.0 || ^1.0.0-dev`).

- [ ] **Step 3: Provare il build — atteso un fallimento TypeScript sui 2 file con sintassi rimossa**

Run:
```
cd backend
timeout 600 docker run --rm --cpus=2 --memory=4g -v "$(pwd):/app" -w //app node:24 sh -c "corepack enable && pnpm run build"
```
Expected: errore TypeScript su `auth.service.ts:22` e/o `utility.service.ts:204` relativo alla sintassi `select`/`relations` array (il tipo del find-options in TypeORM 1.0 non accetta più array per queste opzioni). Se il build passa senza errori qui, vuol dire che TypeORM ha mantenuto retrocompatibilità su questo punto oltre quanto documentato — procedere comunque con gli Step 4-5 per allinearsi alla sintassi raccomandata 1.0, poi passare allo Step 6.

- [ ] **Step 4: Correggere auth.service.ts**

In `backend/src/apis/auth/auth.service.ts`, riga 22, sostituire:
```typescript
      select: ['id', 'email', 'firstName', 'lastName', 'role', 'passwordHash', 'deleted'],
```
con:
```typescript
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        passwordHash: true,
        deleted: true,
      },
```

- [ ] **Step 5: Correggere utility.service.ts**

In `backend/src/apis/utility/utility.service.ts`, righe 204-214, sostituire:
```typescript
      relations: [
        'asset',
        'utilityType',
        'costsBorneBy',
        'maintenanceManager',
        'supplier',
        'utilityAggregator',
        'budgetChapter',
        'created_by',
        'updated_by',
      ],
```
con:
```typescript
      relations: {
        asset: true,
        utilityType: true,
        costsBorneBy: true,
        maintenanceManager: true,
        supplier: true,
        utilityAggregator: true,
        budgetChapter: true,
        created_by: true,
        updated_by: true,
      },
```

- [ ] **Step 6: Aggiungere invalidWhereValuesBehavior come rete di sicurezza**

In `backend/src/core/database/mysql/mysql.module.ts`, all'interno dell'oggetto ritornato da `useFactory` (subito dopo la riga `dropSchema: ...`), aggiungere:
```typescript
          // TypeORM 1.0 di default lancia un errore se null/undefined finiscono
          // in una condizione where (prima venivano ignorati silenziosamente).
          // Manteniamo il comportamento 0.3.x come rete di sicurezza: il codice
          // esistente non è stato scritto assumendo il nuovo comportamento, e un
          // caso limite non coperto dai test non deve causare un crash in prod.
          invalidWhereValuesBehavior: {
            null: 'ignore',
            undefined: 'ignore',
          },
```
(Verificare che questa opzione sia effettivamente accettata da `TypeOrmModuleOptions` di `@nestjs/typeorm@11.0.3` con `typeorm@1.1.0` — se TypeScript segnala un errore di tipo su questa proprietà, controllare la documentazione di TypeORM 1.1.0 per il nome/percorso esatto dell'opzione equivalente in quella versione specifica, potrebbe essere cambiato tra la 1.0.0 e la 1.1.0.)

- [ ] **Step 7: Rieseguire build, lint, test**

Run:
```
cd backend
timeout 600 docker run --rm --cpus=2 --memory=4g -v "$(pwd):/app" -v <stesso-nome-volume>-store:/root/.local/share/pnpm/store -w //app node:24 sh -c "corepack enable && pnpm run build && pnpm run lint && pnpm run test:unit -- --maxWorkers=2"
```
Expected: build exit 0, lint pulito, 207 test passano (o il numero corrente, verificato al Task 1 Step 3).

Se qualche test relativo a `AuthService.validateUser` o `UtilityService.findOne` fallisce, ispezionare l'assertion: la struttura dei dati ritornati da `select`/`relations` non dovrebbe cambiare (stessa forma dell'oggetto entity), solo la sintassi della query è cambiata — un fallimento qui indica un problema reale da investigare, non un test da aggiornare "per farlo passare".

- [ ] **Step 8: Verifica opzionale ma raccomandata — avvio reale con MySQL**

Se il tempo lo consente senza ripetere gli incidenti Docker di stanotte (vedi CLAUDE.md, sezione Docker/risorse): avviare `docker compose up -d` dalla root del progetto (con `.env` configurato, override dev attivo) e verificare via browser/curl che l'app si avvii, le migration girino senza errori, e almeno una chiamata a `/auth/login` e a un endpoint che usa `relations` (es. lista utenze) rispondano correttamente. Se questo step viene saltato per vincoli di tempo, annotarlo esplicitamente nel report come rischio residuo (stesso pattern della migrazione pnpm: uno skip qui va poi verificato con un giro di review finale prima del merge, non dimenticato).

- [ ] **Step 9: Commit**

```bash
git add backend/package.json backend/pnpm-lock.yaml backend/src/apis/auth/auth.service.ts backend/src/apis/utility/utility.service.ts backend/src/core/database/mysql/mysql.module.ts
git commit -m "chore: bump typeorm da 0.3.31 a 1.1.0

Primo major stabile di TypeORM. Verificato con grep che il codice non
usa nessuna delle API pesanti rimosse in 1.0 (findOneById, findByIds,
exist(), @EntityRepository, AbstractRepository, opzione join,
Connection/ConnectionOptions - il progetto usa già DataSource).

Fix richiesti: sintassi select/relations array -> oggetto in
auth.service.ts e utility.service.ts (soli 2 file interessati).

Aggiunta invalidWhereValuesBehavior: {null: 'ignore', undefined:
'ignore'} in mysql.module.ts come rete di sicurezza sul cambio di
default (null/undefined nelle where ora lanciano errore invece di
essere ignorati) - il codice esistente non è stato scritto assumendo
il nuovo comportamento.

@nestjs/typeorm resta a 11.0.3 (compatibile, peer ^0.3.0||^1.0.0-dev).
NestJS stesso resta a 11.x (12.x bloccato, @nestjs/typeorm non ha
ancora una release compatibile - vedi design doc)."
```

- [ ] **Step 10: Aprire PR, verificare CI, merge**

```bash
git push origin <nome-branch>
gh pr create --title "chore: bump typeorm a 1.1.0" --body "Vedi design: docs/superpowers/specs/2026-08-28-dependency-cleanup-design.md (PR 2 di 3). Verificato via grep che nessuna API rimossa in TypeORM 1.0 è usata nel codice. 2 file corretti per sintassi select/relations. Aggiunta rete di sicurezza su null/undefined nelle where." --base main
gh pr checks <numero-pr>
```
Expected: check verdi. Se falliscono, leggere il log — un fallimento qui è più probabile che nel Task 1 data la portata del bump, non ignorare nessun errore.

```bash
gh pr merge <numero-pr> --squash --delete-branch
```

---

## Task 3: Frontend minor — axios (PR3)

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/pnpm-lock.yaml`

**Interfaces:**
- Consumes: nessuna
- Produces: nessuna

- [ ] **Step 1: Bump axios, rimuovere @types/axios**

In `frontend/package.json`, sostituire:
```json
    "axios": "1.19.0",
```
con:
```json
    "axios": "1.20.0",
```

E rimuovere completamente la riga (in `devDependencies`):
```json
    "@types/axios": "^0.14.4",
```
(Attenzione alla virgola finale della riga precedente/successiva, come al Task 1 Step 1.)

- [ ] **Step 2: Rigenerare il lockfile**

Run:
```
cd frontend
timeout 600 docker run --rm --cpus=2 --memory=4g -v "$(pwd):/app" -v <nome-volume>-store:/root/.local/share/pnpm/store -w //app node:24 sh -c "corepack enable && pnpm install"
```
Expected: nessun errore, `axios@1.20.0` risolto, `@types/axios` assente dal lockfile.

- [ ] **Step 3: Verificare il build**

Run:
```
cd frontend
timeout 600 docker run --rm --cpus=2 --memory=4g -v "$(pwd):/app" -v <stesso-nome-volume>-store:/root/.local/share/pnpm/store -w //app node:24 sh -c "corepack enable && pnpm run build"
```
Expected: `Application bundle generation complete`, nessun errore TypeScript relativo ai tipi di `axios` (conferma che rimuovere `@types/axios` non rompe nulla — `axios` fornisce i propri tipi dalla v1).

Se il build fallisce con un errore relativo ai tipi di axios (es. "Cannot find module 'axios' or its corresponding type declarations"), NON procedere: significa che qualche import fa ancora affidamento sullo stub `@types/axios` in un modo inatteso — ripristinare la dipendenza e riportare l'errore esatto.

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml
git commit -m "chore: bump axios a 1.20.0, rimuove @types/axios deprecato

@types/axios è uno stub type ormai inutile: axios fornisce i propri
tipi dalla v1 in poi (warning di deprecazione già visto durante
l'audit fix di ieri). Bump minor axios, nessun breaking change atteso."
```

- [ ] **Step 5: Aprire PR, verificare CI, merge**

```bash
git push origin <nome-branch>
gh pr create --title "chore: bump axios frontend, rimuove @types/axios deprecato" --body "Vedi design: docs/superpowers/specs/2026-08-28-dependency-cleanup-design.md (PR 3 di 3, ultima)." --base main
gh pr checks <numero-pr>
```
Expected: check verdi.

```bash
gh pr merge <numero-pr> --squash --delete-branch
```

---

## Self-Review (completato in fase di stesura)

**Copertura spec**: PR1 pulizia dead-dep (14 pacchetti, inclusa la scoperta `@types/passport-local` compagno di `passport-local`) ✓, correzione nota CLAUDE.md 2FA obsoleta ✓, PR2 TypeORM bump con i 2 file esatti da correggere ✓, rete di sicurezza null/undefined ✓, PR3 frontend axios+rimozione @types/axios ✓, NestJS 12 esplicitamente fuori scope in ogni task ✓.

**Placeholder scan**: nessun TBD. Le note "verificare in fase di implementazione" (Task 2 Step 3 sul possibile fallimento diverso da atteso, Step 6 sul nome esatto dell'opzione se cambiato tra 1.0.0 e 1.1.0) sono istruzioni di gestione-imprevisti esplicite, non gap — danno all'implementer un percorso concreto sia se il comportamento atteso si conferma sia se no.

**Coerenza**: nomi file, numeri di riga e contenuto esatto di ogni modifica verificati leggendo i file reali durante la stesura di questo piano (non assunti dalla spec). Se altre PR hanno toccato questi stessi file nel frattempo, i numeri di riga potrebbero essere leggermente spostati — l'implementer dovrebbe cercare per contenuto (`select: ['id', 'email'...`, `relations: [\n  'asset'...`) piuttosto che fidarsi ciecamente del numero di riga.

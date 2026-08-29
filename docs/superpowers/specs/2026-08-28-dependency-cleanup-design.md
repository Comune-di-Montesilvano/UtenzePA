# Pulizia dipendenze morte + aggiornamenti sicuri — design

Data: 2026-08-28
Stato: approvato per implementazione

## Obiettivo

Tre PR indipendenti, sequenziali:

1. Rimozione di 13 dipendenze backend morte (mai importate nel codice, verificato con grep diretto, non solo `depcheck`).
2. Bump `typeorm` 0.3.31 → 1.1.0 (primo major stabile).
3. Bump minori frontend (`axios` 1.19.0 → 1.20.0) + rimozione `@types/axios` (stub type deprecato, `axios` fornisce i propri tipi dalla v1).

## Motivazione

Richiesta esplicita dell'utente dopo un giro di verifica `pnpm outdated`/`depcheck` post-migrazione pnpm. **NestJS 12 esplicitamente escluso da questo giro**: `@nestjs/typeorm` non ha ancora una release compatibile (ultima versione pubblicata 11.0.3, peer `@nestjs/common ^10||^11`) — bumpare gli altri pacchetti `@nestjs/*` a 12 romperebbe il peer con l'ORM wrapper. Nessuna soluzione pulita disponibile ora (via di uscita valutata e scartata: sostituire `@nestjs/typeorm` con cablaggio manuale di TypeORM nei moduli NestJS, o cambiare ORM — entrambe fuori scope, da rivalutare quando l'ecosistema si aggiorna).

## PR 1 — Pulizia dead-dep backend

Rimuovere da `backend/package.json` (verificate morte con grep diretto in `src/`, zero import in nessun formato/quoting):

**dependencies**: `axios`, `clean`, `dayjs`, `fast-csv`, `js-yaml`, `papaparse`, `passport-local`, `qrcode`, `speakeasy`, `uuid`, `@nestjs/mapped-types`
**devDependencies**: `@types/qrcode`, `@types/speakeasy`

Nota collaterale (solo documentazione, non codice): CLAUDE.md documenta un flusso 2FA/TOTP basato su `speakeasy`/`qrcode` che non esiste più nel codice attuale — l'OTP reale è un numero random via email (`otp.helper.ts`, `crypto.randomInt`). Aggiornare la nota in CLAUDE.md per riflettere lo stato reale, in questa stessa PR.

`@sentry/node` **non va rimosso** nonostante `depcheck` lo segnali come "unused": è peer dependency reale di `@sentry/nestjs` (usato indirettamente, mai importato direttamente nel codice applicativo — falso positivo di `depcheck`).

Verifica: `pnpm install` + build + lint + test (207 test attesi) dopo la rimozione, per confermare che nessuna delle 13 dipendenze fosse in realtà necessaria a runtime in un percorso non coperto dai test.

## PR 2 — TypeORM 0.3 → 1.1

### Compatibilità verificata
- `@nestjs/typeorm@11.0.3` (già pinnato) dichiara peer `typeorm: ^0.3.0 || ^1.0.0-dev` — compatibile con 1.1.0 senza bump del wrapper NestJS.
- `@nestjs/typeorm` v10 e v11.0.0 vanno in crash all'avvio con TypeORM 1.0 (tentano di registrare la classe `Connection` rimossa) — serve v11.0.1+. Il repo è già su 11.0.3, sopra la soglia minima.
- TypeORM 1.0 richiede Node 20+ — il repo è già su Node 24.

### Impatto nel codice (verificato con grep, non assunto)
- `backend/src/database/data-source.ts` già usa `DataSource` (non `Connection`, rinominata in 1.0) — nessun cambio necessario.
- `backend/src/database/migrations/1785746114643-InitialSchema.ts` usa solo `queryRunner.query()` con SQL raw — API stabile, nessun cambio necessario.
- Nessun uso nel codice di API rimosse in 1.0: `findOneById`, `findByIds`, `exist()`, `@EntityRepository`, `AbstractRepository`, opzione `join`, lock mode deprecati, `printSql()`, `onConflict()` — zero hit via grep su tutto `src/`.
- **2 file** usano la sintassi array (rimossa in 1.0, sostituita da sintassi a oggetto) e vanno aggiornati:
  - `backend/src/apis/auth/auth.service.ts:22` — `select: ['id', 'email', ...]` → `select: { id: true, email: true, ... }`
  - `backend/src/apis/utility/utility.service.ts:204` — `relations: [...]` → `relations: { ... }` (verificare contenuto esatto in fase di implementazione, l'elenco relazioni potrebbe essere annidato)

### Rischio principale: comportamento null/undefined nelle where
TypeORM 1.0 cambia il default: valori `null`/`undefined` in una condizione `where` **lanciano un errore** invece di essere ignorati silenziosamente (comportamento 0.3.x). Questo non è verificabile via grep (il rischio è runtime, su variabili che *potrebbero* essere null/undefined in fase di esecuzione, non su valori letterali nel codice sorgente).

Mitigazione a due livelli:
1. Configurare `invalidWhereValuesBehavior: 'warn'` (o equivalente opzione legacy-compatibile, da verificare nella documentazione TypeORM 1.0 in fase di implementazione) in `mysql.module.ts` — ripristina il comportamento permissivo di 0.3.x come rete di sicurezza, evitando crash in produzione su un caso limite non coperto dai test.
2. Eseguire la suite di test esistente (207 unit test) più, se disponibili ed eseguibili in tempi ragionevoli, i test di integrazione (`test:integration`, usa `mongodb-memory-server` — verificare se rilevante per TypeORM/MySQL o se testa altro) come rete aggiuntiva.

### Verifica
`pnpm install` (rigenera lockfile), build, lint, test:unit, e — se il tempo lo consente senza ripetere gli incidenti Docker di stanotte — un avvio reale del container `api` con DB MySQL per confermare che le migration girano e le query base (dashboard, liste) funzionano.

## PR 3 — Frontend minor

- `axios`: 1.19.0 → 1.20.0 (minor, nessun breaking change atteso).
- Rimuovere `@types/axios` da `devDependencies` — stub type deprecato (già segnalato come warning da `npm`/`pnpm` durante l'audit fix di stanotte), `axios` fornisce i propri tipi dalla v1 in poi, nessun `@types/axios` referenziato da alcun import (i tipi di axios sono globali via `declare module`, non richiedono import esplicito del pacchetto `@types`).
- `@angular/animations` risulta "Deprecated" su `pnpm outdated` (non è un problema di versione, è un flag di deprecazione dell'intera libreria da parte di Angular — v22 raccomanda `animate.enter`/`animate.leave` al posto delle animazioni imperative). **Fuori scope per questa PR**: è una migrazione di API, non un bump, richiede di rivedere ogni uso di `@Component({ animations: [...] })` nel codice — da valutare come task a sé se/quando serve.

Verifica: `pnpm install`, `ng build` (build reale, non solo lint).

## Fuori scope

- NestJS 11 → 12 (bloccato, vedi Motivazione).
- Migrazione dalle animazioni imperative Angular deprecate a `animate.enter`/`animate.leave`.
- Qualsiasi altro bump non elencato sopra.

## Piano di validazione

Ogni PR: build + lint + test reali (container Docker, coerente con CLAUDE.md) prima di aprire la PR, poi CI reale su GitHub Actions come conferma finale prima del merge. PR sequenziali — ognuna mergiata prima di iniziare la successiva, per isolare la causa di un eventuale problema.

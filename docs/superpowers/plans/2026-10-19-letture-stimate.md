# Letture stimate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** flag «Stimata» sulle rilevazioni di consumo, con il dato reale che prevale sullo stimato nel calcolo e nei controlli.

**Architecture:** colonna `is_estimated` su `utility_consumptions`; tutta la regola nelle funzioni pure di `consumption-calculator.ts` (letture valide, giornaliero a quattro livelli, rilevazioni superate, validazione); il service espone `superseded`; il tab Consumi lo mostra.

**Tech Stack:** NestJS 11 + TypeORM (MySQL 8), Angular 22 + Material.

**Spec:** `docs/superpowers/specs/2026-10-19-letture-stimate-design.md`

## Global Constraints

- Nome colonna/campo: `is_estimated` (`boolean NOT NULL DEFAULT false`); campo calcolato in risposta: `superseded: boolean`.
- Etichette UI: «Stimata», «Superata dal dato reale».
- Messaggi d'errore in italiano, sempre 400 (mai 409).
- Sorgenti CRLF: modifiche preservando `\r\n`.
- Migration: scratch path, poi `src/database/migrations/1794900000000-ConsumptionEstimated.ts`; verificare la riga in `migrations` e `schema:log` pulito sulla tabella.
- jest sempre `--maxWorkers=2`, solo i file rilevanti: `MSYS_NO_PATHCONV=1 docker exec utenzepa-api-1 pnpm exec jest <path> --maxWorkers=2`.
- Versione `publiccode.yml`: `v1.34.0`. Guida aggiornata con data in testa.
- Mai `git add .`/`-A`.

## Review Focus

- Stima più alta della lettura reale successiva (conguaglio): la reale va accettata e il consumo dei giorni si ricalcola dalla coppia reale-reale.
- Lettura reale e stimata nella stessa data e matricola: ammessa, conta la reale, la stimata è superata.
- Cambio contatore con stime sul vecchio contatore: la stima del vecchio non deve spezzare né alimentare le coppie del nuovo.
- Periodo stimato coperto solo in parte da letture reali: conta per i giorni scoperti, non è «superato».
- Modifica di una rilevazione esistente da stimata a reale (update con solo `is_estimated`): validazione rifatta col nuovo flag.

---

### Task 1: Regole di calcolo e validazione (funzioni pure)

**Files:**
- Modify: `backend/src/apis/utility-consumptions/consumption-calculator.ts`
- Test: `backend/src/apis/utility-consumptions/consumption-calculator.spec.ts`

**Interfaces:**
- Produces:
  - `ConsumptionRecord.is_estimated?: boolean | null` (assente/null = reale).
  - `export function supersededIds(records: ConsumptionRecord[]): Set<number>` — id delle stime che non contano più (letture con reale della stessa matricola a data ≥; periodi con tutti i giorni coperti da periodi reali o coppie di letture reali).
  - `readingPairs`, `readingDeltas`, `currentMeterReading`: lavorano sulle letture valide (reali + stimate non superate); delta `null` per le letture superate.
  - `buildDailyConsumption` / `buildDailyBands`: stesse firme, giornaliero a quattro livelli (periodi reali → coppie reali → periodi stimati → coppie con un estremo stimato); ogni livello riempie solo i giorni scoperti dai precedenti.
  - `validateConsumption`: stessa firma, regole della spec.

- [ ] **Step 1: test che falliscono** in `consumption-calculator.spec.ts`, `describe('letture stimate')`:
  - `stimata tra due reali: ignorata` — R(01-01, 100), E(02-01, 300, stimata), R(03-01, 200) stessa matricola: `readingDeltas` → E `null`, seconda R `100`; giornaliero di febbraio = (200-100)/59 al giorno, nessun giorno con quota da E; `supersededIds` = {E}.
  - `stime dopo l'ultima reale contano a catena` — R(01-01,100), E1(02-01,130), E2(03-01,160): delta E1 30, E2 30; `supersededIds` vuoto.
  - `reale e stimata stessa data` — R(01-01,100), E(02-01,150), R(02-01,140): E superata, delta della R = 40.
  - `cambio contatore con stime` — matricola A: R(01-01,10), E(02-01,50); matricola B: R(02-15,0), R(03-15,30): coppie solo A R→E (stimata) e B R→R; E non superata (nessuna reale di A dopo).
  - `priorità dei livelli` — periodo stimato 01-01…01-31 (310) e coppia reale 01-11…01-21 (100): giorni 12–21 = 10/giorno, gli altri 10/giorno dal periodo stimato; periodo reale sovrapposto a coppia reale: vince il periodo (comportamento attuale invariato).
  - `periodo stimato superato del tutto / in parte` — coperto interamente da coppia reale → in `supersededIds`; coperto in parte → assente.
  - `fasce con stime` — `buildDailyBands` con stessa priorità (totalizzatori F1 su R/E/R come il primo caso).
  - Validazione: `reale più bassa della stima precedente accettata` (R100, E300, nuova R200 → null); `stimata più bassa della valida precedente rifiutata` (messaggio «Lettura inferiore alla precedente (…)»); `stessa data: reale+stimata ok, reale+reale e stimata+stimata rifiutate` («Lettura già presente per questa matricola in questa data.»); `periodi: reale+stimato sovrapposti ok, stimato+stimato rifiutati` («Il periodo si sovrappone a un periodo già inserito (…)»); `modifica da stimata a reale rivalidata` (candidato con stesso id e `is_estimated: false` più basso della reale precedente → errore).

- [ ] **Step 2:** `MSYS_NO_PATHCONV=1 docker exec utenzepa-api-1 pnpm exec jest src/apis/utility-consumptions/consumption-calculator.spec.ts --maxWorkers=2` → FAIL sui nuovi test.

- [ ] **Step 3: implementazione.** Helper interno `validReadings(records)` (letture ordinate escluse le stimate superate) usato da `readingPairs` (anche per il controllo d'interruzione), `currentMeterReading`, validazione. `buildDailyConsumption`/`buildDailyBands` riscritte a livelli con un `Set` di giorni coperti; coppie classificate reali/stimate. Validazione letture: reale confrontata solo con reali (precedente/successiva e totalizzatori); stimata solo con l'ultima valida precedente (dopo aver escluso il candidato stesso); duplicato di data solo a parità di `is_estimated`. Periodi: sovrapposizione solo a parità di `is_estimated`. Commenti come quelli esistenti.

- [ ] **Step 4:** stesso comando → PASS; poi `src/apis/utility-consumptions` intero → PASS (nessuna regressione).

- [ ] **Step 5: commit** `feat(consumi): letture e periodi stimati nel calcolo e nei controlli` con i due file.

### Task 2: Colonna, DTO e risposta del service

**Files:**
- Create: `backend/src/database/migrations/1794900000000-ConsumptionEstimated.ts`
- Modify: `backend/src/apis/utility-consumptions/entity/utility-consumption.entity.ts`, `dto/create-utility-consumption.dto.ts`, `dto/update-utility-consumption.dto.ts`, `utility-consumptions.service.ts` (`findByUtility`, tipo `UtilityConsumptionRow`, candidato di `update` con `is_estimated` dell'esistente se assente)
- Test: `utility-consumptions.service.spec.ts`, `dto/create-utility-consumption.dto.spec.ts`

**Interfaces:**
- Consumes: `supersededIds` (Task 1).
- Produces: API rilevazioni con `is_estimated: boolean` e `superseded: boolean`; body create/update accetta `is_estimated?: boolean`.

- [ ] **Step 1: test che falliscono:** DTO — `is_estimated: 'x'` rifiutato, `true` accettato, assente = undefined; service — `findByUtility` su R/E/R restituisce `superseded: true` solo per E e `computed_consumption: null` per E; `update` con solo `{ notes }` su una stimata passa al validatore un candidato con `is_estimated: true`.
- [ ] **Step 2:** jest su `src/apis/utility-consumptions` → FAIL.
- [ ] **Step 3:** entity `@Column({ type: 'boolean', default: false }) is_estimated: boolean;` (commento: «Valore stimato dal fornitore: conta finché non arriva il dato reale»); DTO `@IsOptional() @IsBoolean() is_estimated?: boolean;`; service come da Interfaces. Migration in scratch: `ALTER TABLE \`utility_consumptions\` ADD \`is_estimated\` tinyint NOT NULL DEFAULT 0` / down `DROP COLUMN`; spostarla, controllare riga in `migrations`, `schema:log` senza statement su `utility_consumptions`.
- [ ] **Step 4:** jest su `src/apis/utility-consumptions` → PASS; `GET` rilevazioni di un'utenza reale (login via API, utente temporaneo) mostra `is_estimated:false, superseded:false`.
- [ ] **Step 5: commit** `feat(consumi): colonna is_estimated e rilevazioni superate in risposta`.

### Task 3: Frontend, guida, versione

**Files:**
- Modify: `frontend/src/app/pages/utilities/consumptions/consumption.model.ts`, `consumption-edit-dialog.component.ts`, `utility-consumptions-tab.component.ts`, `frontend/public/guida/guida.md`, `docs/roadmap-patrimonio.md` (voce 23 fatta, parser resta in voce 6), `publiccode.yml` (`v1.34.0`, `2026-10-19`)

**Interfaces:**
- Consumes: campi `is_estimated`, `superseded` (Task 2).

- [ ] **Step 1:** model: `is_estimated: boolean; superseded: boolean` in `UtilityConsumption`, `is_estimated: boolean` in `ConsumptionPayload`.
- [ ] **Step 2:** dialog: `mat-checkbox` «Stimata» per entrambi i tipi (controllo `is_estimated`, default dall'item o `false`), inviato nel payload.
- [ ] **Step 3:** tab: badge «Stimata» (token `--tone-warn-*` o equivalente esistente) accanto al tipo; riga `superseded` con testo in `--app-text-muted` (o token grigio esistente) e dicitura «Superata dal dato reale» (anche `matTooltip`).
- [ ] **Step 4:** guida: sottosezione nella parte consumi «Letture e consumi stimati» (cos'è, regola del conguaglio, riga superata, ricalcolo dopo import) + FAQ «Ho inserito la lettura reale e il consumo stimato non conta più»; data in testa. Roadmap e publiccode.
- [ ] **Step 5:** `docker exec utenzepa-frontend-1 pnpm run build` (include `check-guida`) → build ok; prova in browser (Playwright, `?selectedId=` di un'utenza con letture): inserire una stimata e poi una reale, badge e riga superata visibili, poi cancellare le due rilevazioni di prova.
- [ ] **Step 6: commit** `feat(frontend): rilevazioni stimate nel tab Consumi (v1.34.0)` con i file elencati.

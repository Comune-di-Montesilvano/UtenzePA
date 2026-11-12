# Fabbisogno della convenzione — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** per ogni convenzione CONSIP, dire capitolo per capitolo ed esercizio per esercizio quanto si spenderà, quanto è impegnato e quanto manca, e segnalare già in corso d'anno gli impegni che non basteranno.

**Architecture:** funzioni pure in `backend/src/apis/spending/agreement-forecast.ts` (giorno per giorno: fatturato reale oppure consumo atteso × prezzo), un modulo `apis/agreement-forecast/` che carica i dati, calcola, scrive una cache per (convenzione, capitolo, esercizio) e salva il prezzo a mano; le segnalazioni leggono solo la cache. Frontend: tab «Fabbisogno» nella scheda della convenzione, due segnalazioni nuove.

**Tech Stack:** NestJS 11, TypeORM su MySQL 8, jest; Angular 22 + Material, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-11-fabbisogno-convenzione-design.md` (sezioni da «Il calcolo» in poi; «Ordine in bozza» è già in `main`, v1.55.0).

## Global Constraints

- Versione **v1.56.0** (minor, c'è una migration). `publiccode.yml`: `softwareVersion` e `releaseDate` del giorno del merge.
- Tabella della convenzione: `consip_agreement` (singolare); tipi di utenza `HardTypeEnum`: `WATER`, `LIGHT`, `GAS`, `INTERNET`. Si calcolano solo `LIGHT` e `GAS`: le utenze di altro tipo sotto una convenzione sono escluse ed elencate negli avvisi del tab.
- Nessun calcolo passa dal CIG. «Ordine» = contratto di fornitura non cancellato con `consip_agreement_id`, **bozze comprese**.
- La funzione non crea né modifica impegni. Scritture di sistema: nessun audit, `update_date` della convenzione invariata.
- Fatture: sempre `NOT_REJECTED_SQL` e `NOT_OFFSET_SQL` (`invoices/sdi-status.ts`, `spending/chapter-year.ts`).
- Soglie, costanti esportate dal file del calcolo: `SHORTFALL_MIN_RATIO = 0.05`, `SHORTFALL_MIN_AMOUNT = 200`, `MIN_ALERT_COVERAGE = 0.6`, `TREND_DAYS = 90`, `TREND_MIN = 0.7`, `TREND_MAX = 1.5`, `PRICE_DAYS = 92`.
- `GET /anomalies` non calcola proiezioni: legge la cache. Query nuove in fondo a `getAnomalies()`, `toHaveBeenCalledTimes` da 47 a 49.
- Conflitti = 400, mai 409. `invalidWhereValuesBehavior = 'throw'`: niente `undefined` nelle where.
- Lib TS < ES2022: niente `Array.prototype.at()`. Colonne stringa nullable: `type: 'varchar'`.
- Entity nuove registrate con `TypeOrmModule.forFeature` nel modulo che le usa.
- Migration: scritta in uno scratch path, spostata a contenuto finale; poi `rm -rf dist tsconfig.build.tsbuildinfo` e `docker restart utenzepa-api-1`; ciclo up → down → up; `schema:log` pulito sulle tabelle nuove.
- Frontend: solo token colore di `styles.scss`; tab con `aria-label` = etichetta e `app-tab-label`; elenchi lunghi in `app-sheet-groups`; date `'AAAA-MM-GG'` lette con `new Date(y, m - 1, d)`; importi con `toLocaleString('it-IT')`.
- Nessun dato dell'ente nel codice, nei test, nei commit: solo id o nomi fittizi.
- Guida (`frontend/public/guida/guida.md`) aggiornata nella stessa PR, data in testa; `node scripts/check-guida.mjs` verde.
- jest sempre `--maxWorkers=2`, solo i file toccati; comandi Docker uno alla volta; sorgenti CRLF modificati con Edit o Python `newline=''`.

## Review Focus

Casi che la spec implica e che è facile sbagliare; ognuno ha il suo test nel task indicato.

1. **29 febbraio**: il «giorno dell'anno prima» di un 29/2 non esiste → si usa il 28/2; nessun giorno perso né contato due volte (Task 1).
2. **Utenza con spesa ma consumo zero** (quote fisse) e **prezzo con consumo zero**: ripiego sulla spesa, mai divisione per zero, prezzo proposto `null` e non `Infinity` (Task 1).
3. **Note di credito e righe negative** su giorni già fatturati: il giorno resta «fatturato», l'importo si somma col segno; il previsto non ricompare su quei giorni (Task 2).
4. **Utenza senza capitolo** e **annualità senza importo**: riga «Senza capitolo» con `chapter_id = null`; impegnato 0 senza errore; nessuna delle due rompe la cache né le segnalazioni (Task 2 e Task 4).
5. **Utenza sotto due ordini della stessa convenzione negli stessi giorni** e **utenza cessata o volturata a metà orizzonte**: i giorni doppi contano una volta, i giorni non a carico del Comune non contano (Task 1).

---

### Task 1: perimetro, consumo atteso, andamento e prezzo (funzioni pure)

**Files:**
- Create: `backend/src/apis/spending/agreement-forecast.ts`
- Create: `backend/src/apis/spending/agreement-forecast.spec.ts`
- Modify: `backend/src/apis/spending/chapter-utility-stats.ts` (esportare `spendOnDays`, nessun altro cambio)

**Interfaces:**
- Consumes: `StatsLine`, `DayWindow`, `lineShare`, `spendOnDays` (`chapter-utility-stats.ts`); `ConsumptionRecord`, `buildDailyConsumption`, `toDay`, `fromDay` (`utility-consumptions/consumption-calculator.ts`); `SupplyEventLike`, `DayInterval`, `inChargeIntervals` (`utility-supply/supply-state.ts`); `HardTypeEnum`.
- Produces:

```ts
export interface ForecastOrder {
  id: number;
  draft: boolean;
  closed: boolean;
  start: string | null; // supply_start_date
  end: string | null;   // supply_expiry_date
  utility_ids: number[];
}
export interface ForecastUtility {
  id: number;
  utility_code: string | null;
  hard_type: HardTypeEnum | null;
  chapter_id: number | null;
  estimated_annual_consumption: number | null;
  lines: StatsLine[];
  consumptions: ConsumptionRecord[];
  events: SupplyEventLike[];
}
export type ForecastSource = 'history' | 'annual' | 'spend' | 'none';

// Giorni (epoch) in cui l'utenza conta: unione dei periodi degli ordini che
// la contengono, meno i giorni non a carico del Comune. Ordini senza una
// delle due date: ignorati.
export function utilityDays(orders: ForecastOrder[], utility: ForecastUtility): number[];

// Stesso giorno dell'anno prima; 29/2 → 28/2.
export function sameDayLastYear(day: number): number;

// Consumo reale degli ultimi TREND_DAYS giorni con dati (fino a today) diviso
// per quello degli stessi giorni dell'anno prima, sommato sulle utenze date;
// limitato a [TREND_MIN, TREND_MAX]; 1 se uno dei due è 0 o mancano dati.
export function consumptionTrend(dailies: Map<number, number>[], today: number): number;

// Spesa / consumo sugli ultimi PRICE_DAYS giorni che finiscono all'ultimo
// giorno coperto da una riga, contando solo i giorni con consumo. null se
// non ci sono righe o il consumo è 0.
export function proposedPrice(
  utilities: { lines: StatsLine[]; daily: Map<number, number> }[],
): number | null;

// Spesa media giornaliera dalle righe degli ultimi 365 giorni (fino a today).
// null senza righe in quel periodo.
export function dailySpend(lines: StatsLine[], today: number): number | null;

// Origine della stima dell'utenza e funzione che dà il costo previsto di un
// giorno. Ordine: storico (consumo dello stesso giorno dell'anno prima ×
// trend × price), presunto annuo (/365 × price), sola spesa (dailySpend),
// nessun dato. Con price null o storico tutto a zero ma spesa presente:
// sola spesa.
export function expectedDayCost(
  utility: ForecastUtility,
  daily: Map<number, number>,
  ctx: { today: number; trend: number; price: number | null },
): { source: ForecastSource; cost: (day: number) => number; consumption: (day: number) => number | null };
```

Scelta del piano: il prezzo proposto si calcola su tutte le righe delle utenze della convenzione, qualunque sia il contratto della fattura. La spec prevede prima le sole fatture della convenzione e poi il ripiego; ma il calcolo conta già «le righe di qualunque fattura dell'utenza», e un solo criterio evita che il prezzo cambi regola da un giorno all'altro. Costo se sbagliato: nei primi mesi di una convenzione nuova il prezzo proposto risente ancora del fornitore precedente (si corregge col prezzo a mano).

- [ ] **Step 1: test (falliscono: il file non esiste)**

In `agreement-forecast.spec.ts`, con dati fittizi (date ISO, importi tondi):

- `utilityDays`: un ordine `2026-01-01`–`2026-01-10` → 10 giorni; due ordini sovrapposti `01-01`–`01-10` e `01-05`–`01-20` → 20 giorni, nessun doppione; ordine con `end: null` → ignorato; utenza non in `utility_ids` → `[]`; evento CESSATION effettivo `2026-01-06` → giorni fino al 6 compreso (il giorno di confine resta, come in `subtractIntervals`); TRANSFER effettivo `01-04` e RETURN `01-08` → esclusi i giorni strettamente tra i due.
- `sameDayLastYear`: `2026-03-10` → `2025-03-10`; `2028-02-29` → `2027-02-28`; `2029-02-28` → `2028-02-28`.
- `consumptionTrend`: 10/giorno negli ultimi 90 giorni e 8/giorno un anno prima → `1.25`; 30 contro 10 → `1.5` (limite); 1 contro 10 → `0.7`; nessun dato l'anno prima → `1`; nessun dato recente → `1`.
- `proposedPrice`: riga da 300 su 30 giorni con consumo 10/giorno → `1`; stessa riga con consumo solo su 15 giorni → 150 / 150 = `1`; consumo zero → `null`; nessuna riga → `null`; riga più vecchia di `PRICE_DAYS` rispetto all'ultima → non conta.
- `dailySpend`: righe per 365 su 365 giorni → `1`; nessuna riga nell'ultimo anno → `null`.
- `expectedDayCost`: con storico → `source: 'history'`, costo = consumo dell'anno prima × 1.25 × 0.5; senza storico ma `estimated_annual_consumption = 3650` → `'annual'`, 10 × prezzo; senza consumi ma con righe → `'spend'`; storico a zero e righe presenti → `'spend'`; `price: null` con storico → `'spend'` se ci sono righe, altrimenti `'none'`; niente di niente → `'none'`, costo 0.

- [ ] **Step 2: eseguire, vedere il fallimento**

Run: `docker exec utenzepa-api-1 sh -c "cd /usr/src/app && pnpm exec jest src/apis/spending/agreement-forecast --maxWorkers=2"`
Expected: FAIL, «Cannot find module './agreement-forecast'».

- [ ] **Step 3: esportare `spendOnDays`** in `chapter-utility-stats.ts` (solo la parola `export`).

- [ ] **Step 4: implementare le funzioni** con le firme sopra e le costanti delle Global Constraints.

- [ ] **Step 5: eseguire**

Run: stesso comando più `src/apis/spending/chapter-utility-stats`.
Expected: PASS, nessun test preesistente rotto.

- [ ] **Step 6: commit**

`feat(spending): consumo atteso, andamento e prezzo per il fabbisogno`

---

### Task 2: fabbisogno per capitolo ed esercizio e regola dell'avviso (funzioni pure)

**Files:**
- Modify: `backend/src/apis/spending/agreement-forecast.ts`
- Modify: `backend/src/apis/spending/agreement-forecast.spec.ts`

**Interfaces:**
- Consumes: Task 1; `lineFiscalYear` (`spending/line-year.ts`).
- Produces:

```ts
export interface ForecastCommitted {
  chapter_id: number | null;
  year: number;
  committed: number;        // somma delle annualità con importo
  remaining: number;        // committed − quote già spese (COMMITMENT_SPENT)
  without_amount: number;   // annualità senza importo
}
export interface ForecastInput {
  today: number;
  orders: ForecastOrder[];
  utilities: ForecastUtility[];
  committed: ForecastCommitted[];
  manualPrices: Partial<Record<HardTypeEnum, number>>;
}
export interface ForecastUtilityRow {
  id: number;
  utility_code: string | null;
  hard_type: HardTypeEnum | null;
  chapter_id: number | null;
  source: ForecastSource;
  from_draft: boolean;            // conta solo grazie a ordini in bozza
  lines_without_period: boolean;
  years: { year: number; invoiced: number; to_invoice: number; expected_consumption: number | null }[];
}
export interface ForecastRow {
  chapter_id: number | null;
  year: number;
  utilities: number;
  invoiced: number;
  to_invoice: number;
  total: number;
  committed: number;
  remaining: number;
  difference: number;       // remaining − to_invoice
  coverage: number;         // 0..1
  shortfall: number | null; // importo mancante se scatta l'avviso
  alert: 'short' | 'insufficient_data' | null;
}
export interface ForecastPrice {
  hard_type: HardTypeEnum;
  proposed: number | null;
  manual: number | null;
  used: number | null;
  trend: number;
}
export interface AgreementForecast {
  horizon: { start: string; end: string } | null;
  prices: ForecastPrice[];
  rows: ForecastRow[];
  utilities: ForecastUtilityRow[];
  warnings: { orders_without_dates: number[]; utilities_without_data: number[] };
}

export function shortfall(
  row: Pick<ForecastRow, 'committed' | 'difference' | 'coverage' | 'to_invoice'>,
): { shortfall: number | null; alert: ForecastRow['alert'] };

export function agreementForecast(input: ForecastInput): AgreementForecast;
```

Regole (dalla spec, qui solo ciò che i test fissano):

- Per utenza e per giorno di `utilityDays`: se il giorno è coperto da almeno una riga con periodo completo → «fatturato», importo = somma delle quote giornaliere delle righe che lo coprono (col segno); altrimenti «previsto» = `expectedDayCost(...).cost(day)`.
- Righe senza periodo completo: importo nel fatturato dell'esercizio di `lineFiscalYear`, non coprono giorni, `lines_without_period = true`.
- Esercizi chiusi (anno < anno di `today`): `to_invoice = 0`, `shortfall = null`, `alert = null`.
- `coverage` della riga = giorni dell'esercizio fatturati o stimati da `history`/`annual`, diviso tutti i giorni dell'esercizio delle utenze del capitolo (giorni di utenze `spend`/`none` e giorni di utenze con righe senza periodo non contano al numeratore).
- `shortfall`: con `difference < 0`, mancante = `−difference`. Scatta (`alert: 'short'`) se mancante > `SHORTFALL_MIN_AMOUNT` **e** mancante > `SHORTFALL_MIN_RATIO × committed` **e** `coverage ≥ MIN_ALERT_COVERAGE`. Se le prime due valgono ma la copertura no: `alert: 'insufficient_data'`, `shortfall: null`. `committed = 0` e `to_invoice > 0` rientra (manca tutto).
- Righe di capitolo presenti anche solo per l'impegnato (capitolo con impegni e nessuna utenza): `utilities: 0`, `to_invoice: 0`.
- Importi arrotondati a 2 decimali, `coverage` a 4.
- `from_draft`: l'utenza non sta in nessun ordine non in bozza.
- `prices`: uno per `hard_type` presente; `used = manual ?? proposed`; `trend` per tipo.

- [ ] **Step 1: test (falliscono: le funzioni non esistono)**

- `shortfall`: mancante 150 su impegnato 10.000 → `null` (sotto 200 €); mancante 400 su 10.000 → `null` (sotto il 5 %); mancante 600 su 10.000, copertura 0,9 → `{shortfall: 600, alert: 'short'}`; stesso con copertura 0,5 → `{shortfall: null, alert: 'insufficient_data'}`; impegnato 0, previsto 500, copertura 1 → `short`, 500; differenza positiva → `null`.
- `agreementForecast`, caso base: un ordine `2026-01-01`–`2026-12-31`, un'utenza sul capitolo 7 con consumo 10/giorno per tutto il 2025, una riga da 310 su gennaio 2026, prezzo a mano 1, `today = 2026-01-31`, impegnato 3.000 e rimanenza 2.690 → riga (7, 2026): `invoiced 310`, `to_invoice 3340` (334 giorni × 10 × 1, andamento 1), `total 3650`, `difference −650`, `alert 'short'`, `shortfall 650`.
- Review Focus 3: nota di credito da −31 sullo stesso gennaio → `invoiced 279`, `to_invoice` invariato.
- Review Focus 4: utenza con `chapter_id: null` → riga con `chapter_id: null`; `committed` con `without_amount: 1` e importo 0 → nessun errore, `committed 0`.
- Esercizio a cavallo: ordine `2026-07-01`–`2027-06-30` → due righe, una per anno, con i giorni giusti (184 e 181).
- Ingresso a metà orizzonte: seconda utenza solo in un ordine che parte il `2026-07-01` → conta 184 giorni nel 2026.
- Esercizio chiuso: `today` nel 2027 → riga 2026 con `to_invoice 0` e `alert null` anche se mancano fatture.
- Riga senza periodo: importo nel fatturato dell'anno della data fattura, giorno non coperto (il previsto di quel giorno resta), `lines_without_period: true`.
- `warnings`: ordine senza `end` → in `orders_without_dates`; utenza `'none'` → in `utilities_without_data` e fuori dal previsto.
- `from_draft`: utenza solo in un ordine `draft: true` → `true`.
- Nessun ordine con date → `horizon: null`, `rows` solo dall'impegnato.

- [ ] **Step 2: eseguire, vedere il fallimento.** Run: come Task 1. Expected: FAIL sui test nuovi.
- [ ] **Step 3: implementare** `shortfall` e `agreementForecast`.
- [ ] **Step 4: eseguire.** Expected: PASS.
- [ ] **Step 5: commit** `feat(spending): fabbisogno per capitolo ed esercizio e regola dell'avviso`

---

### Task 3: tabelle, servizio, endpoint

**Files:**
- Create: `backend/src/database/migrations/1796700000000-AgreementForecast.ts` (scritta prima nello scratch path)
- Create: `backend/src/apis/agreement-forecast/entity/agreement-forecast.entity.ts`, `entity/agreement-price.entity.ts`
- Create: `backend/src/apis/agreement-forecast/agreement-forecast.service.ts` (+ `.spec.ts`)
- Create: `backend/src/apis/agreement-forecast/agreement-forecast.controller.ts` (+ `.spec.ts`)
- Create: `backend/src/apis/agreement-forecast/agreement-forecast.sql.ts` (+ `.spec.ts`)
- Create: `backend/src/apis/agreement-forecast/dto/agreement-price.dto.ts`
- Create: `backend/src/apis/agreement-forecast/agreement-forecast.module.ts`
- Modify: `backend/src/app.module.ts` (import del modulo)

**Schema:**

`consip_agreement_forecasts`: `id` PK, `consip_agreement_id_fk` int NOT NULL (FK `FK_agreement_forecasts_agreement`, ON DELETE CASCADE), `budget_chapter_id_fk` int NULL (FK `FK_agreement_forecasts_chapter`, ON DELETE CASCADE), `fiscal_year` int NOT NULL, `utilities` int NOT NULL, `invoiced`, `to_invoice`, `committed`, `remaining`, `difference` decimal(14,2) NOT NULL, `coverage` decimal(5,4) NOT NULL, `shortfall` decimal(14,2) NULL, `alert` varchar(20) NULL, `computed_at` timestamp NOT NULL. Indice `IDX_agreement_forecasts_agreement_year` su (`consip_agreement_id_fk`, `fiscal_year`). Nessun vincolo unique (il capitolo può essere null): le righe di una convenzione si sostituiscono in blocco.

`consip_agreement_prices`: `id` PK, `consip_agreement_id_fk` int NOT NULL (FK `FK_agreement_prices_agreement`, CASCADE), `hard_type` varchar(30) NOT NULL, `unit_price` decimal(12,6) NOT NULL, `updated_by_user_id` int NULL, `update_date` timestamp NOT NULL. Unique `UQ_agreement_prices_agreement_type` su (`consip_agreement_id_fk`, `hard_type`).

**Interfaces:**
- Consumes: Task 1 e 2; `COMMITMENT_SPENT`, `COMMITMENTS`, `NOT_OFFSET_SQL` (`spending/chapter-year.ts`); `NOT_REJECTED_SQL`; `todayDay`.
- Produces:

```ts
// agreement-forecast.sql.ts — costanti esportate, parametri posizionali
export const ORDERS_SQL: string;      // (agreementId) → id, draft, closed, start, end, utility_ids (GROUP_CONCAT)
export const UTILITIES_SQL: string;   // (ids) → id, utility_code, hard_type, chapter_id, estimated_annual_consumption
export const LINES_SQL: string;       // (ids) → utility_id, amount, period_start, period_end, invoice_date
export const CONSUMPTIONS_SQL: string;// (ids) → come chapterUtilityStats in spending.service.ts
export const EVENTS_SQL: string;      // (ids) → colonne di SupplyEventLike + utility_id
export const COMMITTED_SQL: string;   // (agreementId) → chapter_id, year, committed, remaining, without_amount
export const SHARED_COMMITMENTS_SQL: string; // (agreementId, agreementId) → id, label parts degli impegni legati anche a un'altra convenzione
export const SHARES_WITHOUT_LINES_SQL: string; // (agreementId) → year, amount: quote su fatture senza righe
export const OPEN_AGREEMENTS_SQL: string;      // () → id delle convenzioni con almeno un ordine non chiuso
export const AGREEMENTS_OF_CONTRACTS_SQL: string; // (contractIds) → id convenzione

// agreement-forecast.service.ts
export interface ForecastResponse extends AgreementForecast {
  computed_at: string;
  chapters: { id: number; label: string }[];
  shared_commitments: { id: number; label: string }[];
  shares_without_lines: { year: number; amount: number }[];
}
class AgreementForecastService {
  compute(agreementId: number, opts?: { asOf?: string }): Promise<ForecastResponse>; // con asOf non scrive la cache
  setPrice(agreementId: number, hardType: HardTypeEnum, price: number | null, userId: number): Promise<ForecastResponse>;
  refreshAgreements(ids: number[]): Promise<void>;      // in coda, deduplicati; un fallimento non blocca gli altri
  refreshForContracts(contractIds: number[]): Promise<void>;
  refreshAll(): Promise<{ processed: number; failed: number }>;
}
```

Endpoint (controller con prefisso `consip-agreement`, `JwtAuthGuard` + `RolesGuard` come `ConsipAgreementController`):

- `GET /consip-agreement/:id/forecast` — tutti i ruoli; calcola, riscrive la cache della convenzione, risponde `ForecastResponse`. `?as_of=AAAA-MM-GG` solo Admin (altri ruoli 400 «Solo un amministratore può calcolare a una data passata.»): ignora righe con data fattura dopo `as_of` e rilevazioni dopo `as_of`, usa `as_of` come oggi, non scrive la cache. Serve alla verifica del Task 7; non ha interfaccia.
- `PUT /consip-agreement/:id/forecast/prices/:hardType` — Admin, Operatore; body `{ unit_price: number | null }` (`@IsOptional`, `@IsNumber`, `@Min(0.000001)`, null = «Torna al proposto» ed elimina la riga); risponde il `ForecastResponse` ricalcolato. `hardType` non valido → 400 «Tipo di utenza non valido.»; convenzione inesistente → 400 «Convenzione non trovata».

Regole di scrittura: `compute` senza `asOf` cancella e reinserisce in transazione le righe di cache della convenzione, con lo stesso `computed_at`. Nessun audit. `refreshAgreements` usa una catena di promesse come `CommitmentReconcileService.reconcileContracts` e logga gli errori per convenzione.

Perimetro delle query: `ORDERS_SQL` = contratti `deleted = 0` della convenzione (bozze e chiusi compresi: l'orizzonte comprende gli ordini conclusi); `LINES_SQL` join `invoices` con `deleted = 0`, `NOT_REJECTED_SQL`, `NOT_OFFSET_SQL`; `COMMITTED_SQL` = annualità di impegni `deleted = 0` collegati (`budget_commitment_contracts`) ad almeno un contratto della convenzione, raggruppate per capitolo dell'impegno ed esercizio, ogni impegno contato una volta; `OPEN_AGREEMENTS_SQL` = convenzioni non cancellate con un contratto `deleted = 0 AND closed = 0`.

- [ ] **Step 1: test del SQL (falliscono: file assente).** In `agreement-forecast.sql.spec.ts`, sul testo delle costanti: `ORDERS_SQL` contiene `c.deleted = 0` e **non** contiene `draft = 0`; `LINES_SQL` contiene i due frammenti di `NOT_REJECTED_SQL('i')` e `NOT_OFFSET_SQL('i')`; `COMMITTED_SQL` contiene `COMMITMENT_SPENT` e `budget_commitment_contracts`; `OPEN_AGREEMENTS_SQL` contiene `closed = 0`; nessuna costante contiene `cig`.
- [ ] **Step 2: test del servizio (falliscono).** Con `dataSource.query` simulato che risponde per costante SQL: `compute` scrive in transazione delete + insert con una riga per `ForecastRow` e `computed_at` uguale; `compute(id, { asOf })` non apre transazioni e taglia righe e rilevazioni successive; `setPrice(..., null)` elimina la riga del prezzo, `setPrice(..., 0.3)` fa upsert con `updated_by_user_id`; `refreshAgreements([1, 2])` con il primo che fallisce calcola comunque il secondo; `refreshForContracts` risolve le convenzioni con `AGREEMENTS_OF_CONTRACTS_SQL` e non calcola nulla se nessuna.
- [ ] **Step 3: test del controller (falliscono).** `as_of` con ruolo Operatore → 400; `hardType` sconosciuto → 400; `PUT` chiama `setPrice` con l'id dell'utente.
- [ ] **Step 4: eseguire.** Run: `docker exec utenzepa-api-1 sh -c "cd /usr/src/app && pnpm exec jest src/apis/agreement-forecast --maxWorkers=2"`. Expected: FAIL (moduli mancanti).
- [ ] **Step 5: entity, migration (scratch path), SQL, servizio, DTO, controller, modulo;** modulo importato in `app.module.ts`. Il modulo importa `TypeOrmModule.forFeature([AgreementForecast, AgreementPrice])`.
- [ ] **Step 6: spostare la migration** in `src/database/migrations/`, fermare il container, `rm -rf dist tsconfig.build.tsbuildinfo`, riavviare; verificare la riga in `migrations`.
- [ ] **Step 7: eseguire i test.** Expected: PASS.
- [ ] **Step 8: migration e schema.** `migration:revert` poi riavvio (up → down → up); `schema:log` (comando in `docs/claude/backend.md`). Expected: nessuno statement su `consip_agreement_forecasts` e `consip_agreement_prices`.
- [ ] **Step 9: prova sul DB locale.** Con un utente temporaneo (`docs/claude/testing-e2e.md`) `GET /consip-agreement/<id>/forecast` su una convenzione luce e una gas del DB locale: risposta 200, tempo di risposta annotato nel ledger (atteso sotto 5 s; oltre → ottimizzare il caricamento prima di proseguire), righe in cache = `rows`. Utente e righe di audit eliminati subito dopo.
- [ ] **Step 10: commit** `feat(agreement-forecast): cache del fabbisogno, prezzo a mano, endpoint`

---

### Task 4: ricalcolo automatico e segnalazioni

**Files:**
- Modify: `backend/src/apis/budget-commitments/commitment-reconcile.service.ts` (+ spec)
- Modify: `backend/src/apis/agreement-forecast/agreement-forecast.module.ts` (cron e aggancio)
- Modify: `backend/src/apis/anomalies/anomalies.service.ts` (+ spec)
- Modify: `.env.example`, `docker-compose.yml` (variabile `AGREEMENT_FORECAST_CRON`, forma `${VAR:-}` come le altre)

**Interfaces:**
- Consumes: `AgreementForecastService.refreshForContracts`, `refreshAll` (Task 3).
- Produces:

```ts
// commitment-reconcile.service.ts
onReconciled(listener: (contractIds: number[]) => void): void;
// chiamato alla fine di ogni giro riuscito di run(), con i contratti della chiusura

// anomalies.service.ts — chiavi nuove della risposta
agreements_commitments_short: AnomalyList<{
  id: number; label: string;              // convenzione
  missing: number;                         // somma degli ammanchi
  chapters: { id: number | null; label: string; missing: number }[];
  commitment_ids: number[];                // impegni della convenzione su quei capitoli, esercizio in corso
}>;
chapters_variation_needed: AnomalyList<{ id: number; label: string; missing: number; available: number }>;
```

Scelta del piano: il ricalcolo si aggancia alla fine della riconciliazione degli impegni, che gira già dopo ogni salvataggio di impegno, dopo l'import della contabilità (`reconcileAll`), dopo l'import PEC e all'avvio. Copre i due inneschi chiesti dalla spec e in più aggiorna il fatturato dopo una fattura nuova. Costo se sbagliato: calcoli in più dopo ogni fattura salvata; la coda li deduplica, e se il tempo misurato nel Task 3 è alto si restringe l'aggancio ai soli `reconcileAll` e salvataggi di impegno.

Cron: `AGREEMENT_FORECAST_CRON`, default `30 4 * * *`, fuso `Europe/Rome`, registrato come in `BudgetCommitmentsModule.onModuleInit`; chiama `refreshAll()` e logga «Fabbisogno convenzioni: N aggiornate, M errori». Viene dopo consumi (3:00), storico utenze (3:30) e impegni (3:45).

Query delle segnalazioni, in fondo a `getAnomalies()`, solo esercizio in corso (`YEAR(CURDATE())`), solo dalla cache:

- `/* agreements_commitments_short */`: righe di `consip_agreement_forecasts` con `shortfall > 0`, join convenzione non cancellata con almeno un contratto `deleted = 0 AND closed = 0`, `LEFT JOIN budget_chapters`; una riga per (convenzione, capitolo), raggruppate in TypeScript; `commitment_ids` da una sottoquery `GROUP_CONCAT` sugli impegni della convenzione con quel capitolo e un'annualità dell'esercizio.
- `/* chapters_variation_needed */`: per capitolo, somma degli `shortfall` delle convenzioni; solo capitoli con `budget_chapter_spending.adjusted_budget` dell'esercizio non null e `SUM(shortfall) > adjusted_budget − impegnato` (impegnato = somma delle annualità dell'esercizio, da `COMMITMENTS`). Capitolo null escluso.

- [ ] **Step 1: test (falliscono).**
  - `commitment-reconcile.service.spec.ts`: un listener registrato riceve i contratti dopo `reconcileContracts([1])`; non viene chiamato se il giro fallisce; un listener che lancia non fa fallire la riconciliazione.
  - `anomalies.service.spec.ts`: `toHaveBeenCalledTimes(49)`; con righe simulate alle posizioni 47 e 48 → `agreements_commitments_short` raggruppa due capitoli della stessa convenzione, somma `missing`, converte `commitment_ids` da stringa a numeri, capitolo null → `label: 'Senza capitolo'` (Review Focus 4); `chapters_variation_needed` converte i numeri; le due SQL contengono `consip_agreement_forecasts`, `YEAR(CURDATE())` e nessun riferimento a `invoice_lines` o `utility_consumptions`.
  - Aggiornare i `run()` di utilità delle describe esistenti che contano i mock posizionali (46 → stesse posizioni, due in più in coda).
- [ ] **Step 2: eseguire.** Run: `... pnpm exec jest src/apis/budget-commitments/commitment-reconcile src/apis/anomalies --maxWorkers=2`. Expected: FAIL sui test nuovi.
- [ ] **Step 3: implementare** `onReconciled`, registrazione del listener e cron nel modulo, le due query e le due chiavi.
- [ ] **Step 4: eseguire.** Expected: PASS.
- [ ] **Step 5: prova sul DB locale.** Riavvio del container; nel log compare il giro all'avvio; `SELECT COUNT(*), MAX(computed_at) FROM consip_agreement_forecasts` > 0; `GET /anomalies` (utente temporaneo) risponde in meno di 1 s e contiene le due chiavi. Tempo annotato nel ledger.
- [ ] **Step 6: commit** `feat(agreement-forecast): ricalcolo automatico e segnalazioni`

---

### Task 5: tab «Fabbisogno» nella scheda della convenzione

**Files:**
- Create: `frontend/src/app/pages/consip-agreement/agreement-forecast.model.ts`
- Create: `frontend/src/app/pages/consip-agreement/agreement-forecast.helpers.ts` (+ `.spec.ts`)
- Create: `frontend/src/app/pages/consip-agreement/agreement-forecast-tab.component.ts` (template e stili in linea, come `budget-chapter-utilities-tab.component.ts`)
- Modify: `frontend/src/app/pages/consip-agreement/consip-agreement.service.ts`
- Modify: `frontend/src/app/pages/consip-agreement/consip-agreement-sheet.component.ts` e `.html`

**Interfaces:**
- Consumes: endpoint del Task 3.
- Produces:

```ts
// agreement-forecast.model.ts: gemelli di ForecastResponse, ForecastRow, ForecastUtilityRow, ForecastPrice
// consip-agreement.service.ts
forecast(id: number): Observable<AgreementForecast>;
setForecastPrice(id: number, hardType: string, unitPrice: number | null): Observable<AgreementForecast>;

// agreement-forecast.helpers.ts
export const SOURCE_LABEL: Record<ForecastSource, string>;
// 'history' → 'Storico dei consumi', 'annual' → 'Presunto annuo',
// 'spend' → 'Stima dalla sola spesa', 'none' → 'Senza dati'
export function unitLabel(hardType: string): string; // LIGHT → '€/kWh', GAS → '€/Smc', altrimenti '€/unità'
export function yearGroups(rows: ForecastRow[], currentYear: number):
  { year: number; open: boolean; rows: ForecastRow[]; totals: ForecastRow }[]; // anni decrescenti, aperto quello in corso
export function differenceTone(row: ForecastRow): 'danger' | 'warning' | null;
// 'danger' con alert 'short', 'warning' con 'insufficient_data'
```

Contenuto del tab (etichette esatte):

- Intestazione: per ogni tipo, **Costo unitario** con «Proposto: 0,2794 €/kWh», campo «A mano», pulsante «Torna al proposto» (visibile solo con un valore a mano), «Andamento dei consumi sull'anno prima: +4 %»; «Ultimo calcolo: gg/mm/aaaa hh:mm»; pulsante **Ricalcola**. Campo e pulsanti del prezzo solo per Admin e Operatore.
- Avvisi (riquadro, solo se presenti): «Ordini senza date di fornitura: N», «Utenze senza dati: N», «Impegni condivisi con un'altra convenzione: …», «Dati insufficienti per l'avviso» (righe con `insufficient_data`), «Quote su fatture senza righe per utenza: … €» per esercizio.
- `app-sheet-groups` per esercizio, tabella con colonne: Capitolo, Utenze, Fatturato, Previsto da fatturare, Totale previsto, Impegnato, Differenza, Copertura; riga dei totali; export come le altre tabelle della scheda.
- Clic su un capitolo: sotto la riga, le sue utenze con Codice, Consumo atteso, Costo previsto, Origine della stima, «Bozza» se `from_draft`; clic sull'utenza → `EntityNavigatorService`.
- Differenza negativa col token di tono esistente; nessun esadecimale.
- Nella scheda: `<mat-tab aria-label="Fabbisogno">` con `app-tab-label` (icona `query_stats`), dopo «Impegni», solo per convenzioni salvate; caricamento alla prima apertura del tab. Badge in intestazione «Impegni insufficienti» quando almeno una riga dell'esercizio in corso ha `alert: 'short'` (tramite `core/helpers/entity-status.ts`, con test).

- [ ] **Step 1: test degli helper (falliscono: file assente).** `yearGroups`: anni decrescenti, `open` solo sull'anno in corso, totali = somma delle colonne e `coverage` media pesata sulle utenze; `differenceTone` sui tre casi; `unitLabel` sui tre casi; `SOURCE_LABEL` completo. Test del badge in `entity-status.spec.ts`.
- [ ] **Step 2: eseguire.** Run: `docker exec utenzepa-frontend-1 sh -c "pnpm exec ng test --watch=false --include=src/app/pages/consip-agreement/agreement-forecast.helpers.spec.ts"`. Expected: FAIL.
- [ ] **Step 3: implementare** modello, helper, metodi del servizio, componente, tab e badge.
- [ ] **Step 4: eseguire i test** (helper ed `entity-status.spec.ts`). Expected: PASS.
- [ ] **Step 5: build.** Run: `docker exec utenzepa-frontend-1 sh -c "pnpm exec ng build --configuration production"`. Expected: «Application bundle generation complete», nessun errore; `pnpm exec eslint` sui file toccati senza errori.
- [ ] **Step 6: commit** `feat(consip-agreement): tab Fabbisogno`

---

### Task 6: segnalazioni negli elenchi e in dashboard

**Files:**
- Modify: `frontend/src/app/core/services/anomalies.service.ts` (tipi delle due chiavi)
- Modify: `frontend/src/app/pages/consip-agreement/consip-agreement-filters.ts`, `consip-agreement.component.ts` e `.html`
- Modify: `frontend/src/app/pages/commitments/commitments-filters.ts`
- Modify: `frontend/src/app/pages/budget-chapters/budget-chapters-filters.ts`
- Modify: `frontend/src/app/pages/dashboard/anomalies-card.component.ts`

**Interfaces:**
- Consumes: chiavi del Task 4.
- Produces: `CONSIP_AGREEMENT_SIGNALS: SignalDef[]` (nuovo) con `agreements_commitments_short` → «Impegni insufficienti», id = `item.id`; in `COMMITMENT_SIGNALS` la stessa chiave → «Convenzione con impegni insufficienti», id = `commitment_ids` appiattiti; in `CHAPTER_SIGNALS` `chapters_variation_needed` → «Variazione di bilancio da chiedere», id = `item.id`.

L'elenco Convenzioni CONSIP oggi non ha `app-list-signals`: aggiungerlo come negli altri elenchi (stesso schema di `pages/contracts/`), con ricalcolo dopo ogni salvataggio.

Dashboard, due riquadri: «Convenzioni con impegni che non basteranno» (riga: convenzione, mancante, capitoli; clic apre la scheda della convenzione) e «Capitoli da variare» (riga: capitolo, mancante, da impegnare; clic apre la scheda del capitolo). Servono perché il totale della dashboard somma tutte le chiavi.

- [ ] **Step 1: test (falliscono).** Spec nuova `consip-agreement-filters.spec.ts`: `CONSIP_AGREEMENT_SIGNALS` estrae gli id; in `commitments-filters` la chiave nuova appiattisce `commitment_ids` senza doppioni (spec esistente o nuova accanto al file).
- [ ] **Step 2: eseguire.** Expected: FAIL.
- [ ] **Step 3: implementare.**
- [ ] **Step 4: eseguire i test e la build di produzione.** Expected: PASS, build pulita, eslint senza errori sui file toccati.
- [ ] **Step 5: commit** `feat(anomalies): segnalazioni del fabbisogno in elenchi e dashboard`

---

### Task 7: guida, roadmap, versione, verifica reale, PR

**Files:**
- Modify: `frontend/public/guida/guida.md`, `docs/roadmap-patrimonio.md`, `publiccode.yml`, `CLAUDE.md` (paragrafo «Fabbisogno della convenzione» nel Dominio; variabile del cron)

- [ ] **Step 1: guida.** Data in testa. In «Gestire una convenzione CONSIP»: il tab Fabbisogno, come leggere Differenza e Copertura, il costo unitario proposto e a mano, l'ordine in bozza per le utenze che entreranno. In «Segnalazioni per elenco»: le due righe nuove. In «Problemi frequenti»: «La convenzione risulta con impegni insufficienti» (Causa / Soluzione / Apri un ticket se). I «Limiti dichiarati» della spec, in parole dell'operatore. Run: `docker exec utenzepa-frontend-1 sh -c "node scripts/check-guida.mjs"`. Expected: `check-guida: ok`.
- [ ] **Step 2: roadmap** voce 24 (fatta in v1.56.0; cosa resta: pattern mancanti, canoni a corpo) **e versione** `v1.56.0`.
- [ ] **Step 3: prova di validità sul DB locale.** Per la convenzione luce chiusa a metà 2026 (id nel ledger, non nel repo): `GET /consip-agreement/<id>/forecast?as_of=2025-12-31` e confronto tra il «Previsto da fatturare» 2026 limitato al primo semestre e il fatturato vero dello stesso semestre (dalla risposta senza `as_of`). Scarto percentuale, per capitolo e totale, scritto nella PR. Se lo scarto totale supera il 15 %: tarare andamento o finestra del prezzo, dichiarandolo nella PR come Ruling.
- [ ] **Step 4: prova a schermo (Playwright dall'host, utente temporaneo).** Scheda di una convenzione → tab Fabbisogno: tabella visibile; prezzo a mano salvato → i numeri cambiano; «Torna al proposto»; **Ricalcola**; clic su un capitolo apre le utenze; clic su un'utenza apre la scheda; elenco Convenzioni CONSIP mostra la segnalazione se presente; dashboard coi due riquadri. Tema scuro controllato sul tab. Screenshot solo in `.playwright-mcp/`. Pulizia: prezzi a mano di prova eliminati, utente temporaneo e righe di audit eliminati.
- [ ] **Step 5: lint backend sui file toccati** (`eslint` nel container, filtrando `␍`).
- [ ] **Step 6: commit** `docs: guida e versione per il fabbisogno della convenzione (v1.56.0)`, push, PR con: cosa cambia, scarto della prova del Step 3, tempi misurati (calcolo per convenzione, `GET /anomalies`), limiti dichiarati, cosa non è stato provato.

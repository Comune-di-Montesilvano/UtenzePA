# Consumi utenze, utenze per capitolo, selezione capitolo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Storico consumi per utenza (letture contatore / consumi periodo) con effettivo 12 mesi e stima stagionale persistiti, tab "Utenze associate" con totali nel dialog capitolo, selezione capitolo leggibile nel dialog utenza.

**Architecture:** Nuovo modulo backend `apis/utility-consumptions/` con calcolatore a funzioni pure (`consumption-calculator.ts`), service CRUD (estende `BaseService`, audit incluso), service di ricalcolo che persiste i valori su `utilities` (su evento + cron notturno via `SchedulerRegistry`). Frontend: tab "Consumi" nel dialog utenza (riepilogo, grafico SVG, tabella rilevazioni, dialog rilevazione), tab "Utenze associate" nel dialog capitolo (riuso `DataTableUtilitiesComponent`), `FilterableSelectComponent` esteso con riga secondaria per il capitolo.

**Tech Stack:** NestJS 11 + TypeORM (MySQL 8), class-validator, jest; Angular 22 standalone + Angular Material.

**Spec:** `docs/superpowers/specs/2026-09-29-consumi-utenze-design.md`

## Global Constraints

- Tutti i comandi pnpm/jest/ng **dentro i container Docker** (`docker exec utenzepa-api-1 ...`, `docker exec utenzepa-frontend-1 ...`), mai sull'host. Comandi Docker **uno alla volta**, mai in parallelo/background multipli.
- jest sempre con `--maxWorkers=2`, mai la suite intera in locale (instabilità Docker Desktop): solo i file spec toccati. Suite completa = CI.
- Migration: scritta in scratch (`backend/tools/scratch/`, fuori da `src/database/migrations/`), spostata nel path definitivo solo a contenuto finale (il watcher la esegue appena appare).
- `git add` sempre con elenco file esplicito (mai `git add .`/`-A`); dopo `pnpm run lint` scartare file con `git diff --numstat` `0 0`.
- Unità: `LIGHT` → `kWh`, `GAS` → `Smc`, `WATER` → `m³`, `INTERNET` → nessuna (escluse dai consumi).
- Finestra effettivo: `(today − 365, today]` = giorni `today−364 … today` (365 giorni). Stima manuale valida 12 mesi da `estimated_consumption_set_at`.
- Totali capitolo raggruppati per `hard_type`, mai somme miste.
- Il ricalcolo automatico scrive via `repository.update` diretto (niente audit log) e **non** deve spostare `update_date` (`update_date: () => 'update_date'`).
- Frontend: service nuovi che non estendono `AbstractService` devono mettere a mano l'header `Authorization: Bearer <token>`.
- Frontend: niente stile inline sull'host `<mat-option>` (contenuto custom in `<span>` interno); `MatDialog` sempre con `width` + `maxWidth`.
- `ValidationPipe` ha `forbidNonWhitelisted: true`: il frontend non deve inviare campi assenti dai DTO (es. `actual_consumption` dopo la rimozione).
- Commit Conventional Commits, messaggi terminano con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Salvataggio dialog utenza dopo ricalcolo**: se la tab Consumi ricalcola la stima e il form ha ancora il vecchio valore, "Salva" lo rimanderebbe come "modificato" e marcherebbe la stima come MANUAL. Atteso: form aggiornato col valore ricalcolato (se il campo non è stato toccato) e nessun cambio di origine. Test: `UtilitiesService` — stima invariata nel DTO → origine non toccata (Task 5).
2. **Valori decimal come stringa da MySQL** (`"123.450"`): somme/confronti su stringhe concatenano invece di sommare. Atteso: tutto convertito con `Number()`. Test: calcolatore alimentato con stringhe (Task 1), summary capitolo con `SUM` stringa (Task 6).
3. **Lettura con matricola che differisce solo per spazi/maiuscole** (`" ab12 "` vs `"AB12"`): atteso stesso contatore, nessun "nuovo contatore" spurio, conflitto univocità rilevato. Test: calcolatore (Task 1) e service rilevazioni (Task 4).
4. **Cron notturno che sposta "Ultima modifica"** di tutte le utenze: atteso `update_date` invariato dopo ricalcolo. Test: `ConsumptionRecalcService` verifica che `update` riceva `update_date` come funzione (Task 3).
5. **PATCH rilevazione che cambia `kind`** (da lettura a periodo): atteso campi dell'altro tipo azzerati e validazione sul record risultante. Test: service rilevazioni (Task 4).

---

## File Structure

Backend (nuovi):
- `backend/src/apis/utility-consumptions/enum/consumption-kind.enum.ts` — `ConsumptionKind`, `ConsumptionSource`
- `backend/src/apis/utility-consumptions/enum/estimate-source.enum.ts` — `EstimateSource`
- `backend/src/apis/utility-consumptions/consumption-unit.ts` — unità per hard type
- `backend/src/apis/utility-consumptions/consumption-calculator.ts` (+ `.spec.ts`) — funzioni pure
- `backend/src/apis/utility-consumptions/entity/utility-consumption.entity.ts`
- `backend/src/apis/utility-consumptions/dto/create-utility-consumption.dto.ts`, `update-utility-consumption.dto.ts`
- `backend/src/apis/utility-consumptions/consumption-recalc.service.ts` (+ `.spec.ts`)
- `backend/src/apis/utility-consumptions/utility-consumptions.service.ts` (+ `.spec.ts`)
- `backend/src/apis/utility-consumptions/utility-consumptions.controller.ts`
- `backend/src/apis/utility-consumptions/utility-consumptions.module.ts` — cron
- `backend/src/apis/utility/meter-number.helper.ts` — check univocità matricola
- `backend/src/database/migrations/1790500000000-UtilityConsumptions.ts`

Backend (modificati): `utility.entity.ts`, `create-utility.dto.ts`, `update-utility.dto.ts`, `utility.service.ts` (+spec), `utility.module.ts`, `app.module.ts`, `budget-chapters.service.ts` (+spec), `budget-chapters.controller.ts`, `budget-chapters.module.ts`.

Frontend (nuovi, in `frontend/src/app/pages/utilities/consumptions/`):
- `consumption.model.ts`, `utility-consumption.service.ts`, `consumption-chart.component.ts`, `consumption-edit-dialog.component.ts`, `utility-consumptions-tab.component.ts`
- `frontend/src/app/pages/budget-chapters/budget-chapter-utilities-tab.component.ts`

Frontend (modificati): `core/types/option.interface.ts`, `core/components/filterable-select.component.ts`, `pages/utilities/entity/utility.entity.ts`, `pages/utilities/utility.service.ts`, `pages/utilities/utility-edit-dialog.component.{ts,html}`, `pages/budget-chapters/budget-chapter-edit-dialog.component.{ts,html}`.

---

### Task 1: Calcolatore consumi (funzioni pure)

**Files:**
- Create: `backend/src/apis/utility-consumptions/enum/consumption-kind.enum.ts`
- Create: `backend/src/apis/utility-consumptions/enum/estimate-source.enum.ts`
- Create: `backend/src/apis/utility-consumptions/consumption-unit.ts`
- Create: `backend/src/apis/utility-consumptions/consumption-calculator.ts`
- Test: `backend/src/apis/utility-consumptions/consumption-calculator.spec.ts`

**Interfaces:**
- Produces:
  - `enum ConsumptionKind { READING='READING', PERIOD='PERIOD' }`, `enum ConsumptionSource { MANUAL, INVOICE, IMPORT, API }` (valori stringa uguali ai nomi), `enum EstimateSource { MANUAL, HISTORY, NONE }`
  - `CONSUMPTION_UNIT: Record<HardTypeEnum, string | null>`
  - `interface ConsumptionRecord { id?: number; kind: ConsumptionKind; reading_date?: string|null; reading_value?: number|string|null; meter_number?: string|null; period_start?: string|null; period_end?: string|null; consumption?: number|string|null }`
  - `toDay(iso: string): number`, `fromDay(day: number): string`, `todayDay(now?: Date): number`, `normalizeMeter(m?: string|null): string`
  - `sortedReadings(records): ConsumptionRecord[]`
  - `readingDeltas(records): Map<number, number | null>` (chiave = id)
  - `buildDailyConsumption(records): Map<number, number>`
  - `computeActual(daily, today): { actual: number; coverageDays: number }`
  - `computeSeasonalEstimate(daily, today): number | null`
  - `interface MonthlyPoint { month: string; actual: number; covered_days: number; days: number; estimated: number }`, `computeMonthlySeries(daily, today): MonthlyPoint[]` (36 punti: 24 passati incluso corrente + 12 futuri)
  - `manualValidUntil(setAt: Date): Date`, `decideEstimate(state: { source: EstimateSource; setAt: Date|null }, historyEstimate: number|null, now: Date): { estimated_annual_consumption: number; estimated_consumption_source: EstimateSource.HISTORY; estimated_consumption_set_at: null } | null`
  - `normalizeByKind(record: ConsumptionRecord & { notes?: string|null }): ConsumptionRecord & { notes: string|null }`
  - `validateConsumption(candidate: ConsumptionRecord, others: ConsumptionRecord[], today: number): string | null`

- [ ] **Step 1: Enum e unità**

`backend/src/apis/utility-consumptions/enum/consumption-kind.enum.ts`:
```ts
export enum ConsumptionKind {
  READING = 'READING',
  PERIOD = 'PERIOD',
}

// Origine della rilevazione: oggi solo MANUAL, gli altri valori sono
// predisposti per l'import futuro da fatture/tracciati/API.
export enum ConsumptionSource {
  MANUAL = 'MANUAL',
  INVOICE = 'INVOICE',
  IMPORT = 'IMPORT',
  API = 'API',
}
```

`backend/src/apis/utility-consumptions/enum/estimate-source.enum.ts`:
```ts
// Origine di utilities.estimated_annual_consumption.
export enum EstimateSource {
  MANUAL = 'MANUAL',
  HISTORY = 'HISTORY',
  NONE = 'NONE',
}
```

`backend/src/apis/utility-consumptions/consumption-unit.ts`:
```ts
import { HardTypeEnum } from '@apis/utility-types/enum/hard-type.enum';

// INTERNET non ha contatore: escluso da consumi e totali.
export const CONSUMPTION_UNIT: Record<HardTypeEnum, string | null> = {
  [HardTypeEnum.LIGHT]: 'kWh',
  [HardTypeEnum.GAS]: 'Smc',
  [HardTypeEnum.WATER]: 'm³',
  [HardTypeEnum.INTERNET]: null,
};
```

- [ ] **Step 2: Scrivere il test (fallisce)**

`backend/src/apis/utility-consumptions/consumption-calculator.spec.ts`:
```ts
import {
  buildDailyConsumption,
  computeActual,
  computeMonthlySeries,
  computeSeasonalEstimate,
  ConsumptionRecord,
  decideEstimate,
  fromDay,
  normalizeByKind,
  readingDeltas,
  toDay,
  validateConsumption,
} from './consumption-calculator';
import { ConsumptionKind } from './enum/consumption-kind.enum';
import { EstimateSource } from './enum/estimate-source.enum';

const TODAY = toDay('2026-09-29');

const reading = (id: number, date: string, value: number | string, meter = 'M1'): ConsumptionRecord => ({
  id,
  kind: ConsumptionKind.READING,
  reading_date: date,
  reading_value: value,
  meter_number: meter,
});

const period = (id: number, start: string, end: string, consumption: number | string): ConsumptionRecord => ({
  id,
  kind: ConsumptionKind.PERIOD,
  period_start: start,
  period_end: end,
  consumption,
});

describe('consumption-calculator', () => {
  describe('toDay/fromDay', () => {
    it('round-trip su date di calendario', () => {
      expect(fromDay(toDay('2026-02-28'))).toBe('2026-02-28');
      expect(toDay('2026-03-01') - toDay('2026-02-28')).toBe(1);
    });
  });

  describe('buildDailyConsumption + computeActual', () => {
    it('letture consecutive stessa matricola: consumo distribuito sui giorni (a, b]', () => {
      const daily = buildDailyConsumption([reading(1, '2026-01-01', 1000), reading(2, '2026-01-11', 1100)]);
      expect(daily.get(toDay('2026-01-01'))).toBeUndefined();
      expect(daily.get(toDay('2026-01-02'))).toBeCloseTo(10);
      expect(daily.get(toDay('2026-01-11'))).toBeCloseTo(10);
      expect(computeActual(daily, TODAY)).toEqual({ actual: 100, coverageDays: 10 });
    });

    it('valori decimal come stringa (mysql2) sommati come numeri', () => {
      const daily = buildDailyConsumption([reading(1, '2026-01-01', '1000.000'), reading(2, '2026-01-11', '1100.500')]);
      expect(computeActual(daily, TODAY).actual).toBeCloseTo(100.5);
    });

    it('intervallo a cavallo della finestra: solo la quota dentro', () => {
      // finestra = 2025-09-30 .. 2026-09-29; intervallo 2025-09-21..2025-10-10, 10/giorno
      const daily = buildDailyConsumption([reading(1, '2025-09-20', 0), reading(2, '2025-10-10', 200)]);
      expect(computeActual(daily, TODAY)).toEqual({ actual: 110, coverageDays: 11 });
    });

    it('cambio matricola: nessun intervallo tra contatori diversi', () => {
      const daily = buildDailyConsumption([
        reading(1, '2026-01-01', 1000, 'A'),
        reading(2, '2026-01-11', 5, 'B'),
        reading(3, '2026-01-21', 105, 'B'),
      ]);
      expect(computeActual(daily, TODAY)).toEqual({ actual: 100, coverageDays: 10 });
    });

    it('matricola uguale a meno di spazi/maiuscole: stesso contatore', () => {
      const daily = buildDailyConsumption([reading(1, '2026-01-01', 0, ' ab12 '), reading(2, '2026-01-11', 100, 'AB12')]);
      expect(computeActual(daily, TODAY).actual).toBe(100);
    });

    it('periodo ha precedenza sulle letture nei giorni in comune', () => {
      const daily = buildDailyConsumption([
        reading(1, '2026-01-01', 0),
        reading(2, '2026-01-11', 100),
        period(3, '2026-01-05', '2026-01-06', 50),
      ]);
      expect(daily.get(toDay('2026-01-05'))).toBeCloseTo(25);
      expect(computeActual(daily, TODAY)).toEqual({ actual: 130, coverageDays: 10 });
    });

    it('nessun dato: effettivo 0, copertura 0', () => {
      expect(computeActual(buildDailyConsumption([]), TODAY)).toEqual({ actual: 0, coverageDays: 0 });
    });
  });

  describe('computeSeasonalEstimate', () => {
    it('anno precedente coperto: stima = profilo stagionale', () => {
      // 2025-09-30..2026-03-29 = 181 giorni a 2/giorno; 2026-03-30..2026-09-29 = 184 giorni a 1/giorno
      const daily = buildDailyConsumption([
        period(1, '2025-09-30', '2026-03-29', 362),
        period(2, '2026-03-30', '2026-09-29', 184),
      ]);
      expect(computeSeasonalEstimate(daily, TODAY)).toBe(546);
    });

    it('copertura parziale: giorni scoperti con media giornaliera', () => {
      const daily = buildDailyConsumption([period(1, '2026-07-01', '2026-07-10', 100)]);
      expect(computeSeasonalEstimate(daily, TODAY)).toBe(3650);
    });

    it('solo storico vecchio: media su tutto lo storico', () => {
      const daily = buildDailyConsumption([period(1, '2024-01-01', '2024-01-10', 50)]);
      expect(computeActual(daily, TODAY)).toEqual({ actual: 0, coverageDays: 0 });
      expect(computeSeasonalEstimate(daily, TODAY)).toBe(1825);
    });

    it('nessun dato: null', () => {
      expect(computeSeasonalEstimate(buildDailyConsumption([]), TODAY)).toBeNull();
    });
  });

  describe('computeMonthlySeries', () => {
    it('36 punti: 24 mesi fino al corrente + 12 futuri, stima stagionale sui futuri', () => {
      const daily = buildDailyConsumption([
        period(1, '2025-09-30', '2026-03-29', 362),
        period(2, '2026-03-30', '2026-09-29', 184),
      ]);
      const series = computeMonthlySeries(daily, TODAY);
      expect(series).toHaveLength(36);
      expect(series[0].month).toBe('2024-10');
      expect(series[23].month).toBe('2026-09');
      expect(series[35].month).toBe('2027-09');

      const jan26 = series.find((p) => p.month === '2026-01');
      expect(jan26).toEqual({ month: '2026-01', actual: 62, covered_days: 31, days: 31, estimated: 0 });

      const oct26 = series.find((p) => p.month === '2026-10');
      expect(oct26).toEqual({ month: '2026-10', actual: 0, covered_days: 0, days: 31, estimated: 62 });
      expect(series.find((p) => p.month === '2027-01')?.estimated).toBe(62);
    });

    it('nessun dato: stime future a 0', () => {
      const series = computeMonthlySeries(buildDailyConsumption([]), TODAY);
      expect(series.every((p) => p.actual === 0 && p.estimated === 0)).toBe(true);
    });
  });

  describe('readingDeltas', () => {
    it('delta dalla lettura precedente stessa matricola, null su prima lettura e nuovo contatore', () => {
      const deltas = readingDeltas([
        reading(1, '2026-01-01', 1000, 'A'),
        reading(2, '2026-01-11', 1100, 'A'),
        reading(3, '2026-01-21', 5, 'B'),
        period(4, '2026-02-01', '2026-02-10', 30),
      ]);
      expect(deltas.get(1)).toBeNull();
      expect(deltas.get(2)).toBe(100);
      expect(deltas.get(3)).toBeNull();
      expect(deltas.has(4)).toBe(false);
    });
  });

  describe('decideEstimate', () => {
    const now = new Date('2026-09-29T10:00:00');

    it('manuale ancora valida: non toccata', () => {
      expect(decideEstimate({ source: EstimateSource.MANUAL, setAt: new Date('2026-01-01') }, 500, now)).toBeNull();
    });

    it('manuale scaduta con storico: passa a HISTORY', () => {
      expect(decideEstimate({ source: EstimateSource.MANUAL, setAt: new Date('2025-06-01') }, 500, now)).toEqual({
        estimated_annual_consumption: 500,
        estimated_consumption_source: EstimateSource.HISTORY,
        estimated_consumption_set_at: null,
      });
    });

    it('manuale scaduta senza storico: invariata', () => {
      expect(decideEstimate({ source: EstimateSource.MANUAL, setAt: new Date('2025-06-01') }, null, now)).toBeNull();
    });

    it('NONE con storico: HISTORY', () => {
      expect(decideEstimate({ source: EstimateSource.NONE, setAt: null }, 300, now)?.estimated_annual_consumption).toBe(300);
    });

    it('HISTORY: aggiornata col nuovo valore', () => {
      expect(decideEstimate({ source: EstimateSource.HISTORY, setAt: null }, 400, now)?.estimated_annual_consumption).toBe(400);
    });
  });

  describe('normalizeByKind', () => {
    it('READING: azzera i campi periodo e trimma la matricola', () => {
      expect(
        normalizeByKind({ kind: ConsumptionKind.READING, reading_date: '2026-01-01', reading_value: 5, meter_number: ' M1 ', period_start: '2026-01-01', consumption: 3 }),
      ).toEqual({
        kind: ConsumptionKind.READING,
        reading_date: '2026-01-01',
        reading_value: 5,
        meter_number: 'M1',
        period_start: null,
        period_end: null,
        consumption: null,
        notes: null,
      });
    });

    it('PERIOD: azzera i campi lettura', () => {
      const r = normalizeByKind({ kind: ConsumptionKind.PERIOD, period_start: '2026-01-01', period_end: '2026-01-31', consumption: 10, reading_value: 99, meter_number: 'X', notes: 'n' });
      expect(r.reading_value).toBeNull();
      expect(r.meter_number).toBeNull();
      expect(r.reading_date).toBeNull();
      expect(r.notes).toBe('n');
    });
  });

  describe('validateConsumption', () => {
    const others = [reading(1, '2026-01-01', 1000), reading(2, '2026-03-01', 1300), period(3, '2026-05-01', '2026-05-31', 50)];

    it('lettura valida tra due letture', () => {
      expect(validateConsumption(reading(9, '2026-02-01', 1100), others, TODAY)).toBeNull();
    });

    it('lettura futura rifiutata', () => {
      expect(validateConsumption(reading(9, '2026-10-01', 2000), others, TODAY)).toMatch(/futura/);
    });

    it('lettura inferiore alla precedente stessa matricola rifiutata', () => {
      expect(validateConsumption(reading(9, '2026-02-01', 900), others, TODAY)).toMatch(/precedente/);
    });

    it('lettura superiore alla successiva stessa matricola rifiutata', () => {
      expect(validateConsumption(reading(9, '2026-02-01', 1400), others, TODAY)).toMatch(/successiva/);
    });

    it('lettura inferiore ma con altra matricola ammessa (nuovo contatore)', () => {
      expect(validateConsumption(reading(9, '2026-02-01', 3, 'NEW'), others, TODAY)).toBeNull();
    });

    it('stessa data e stessa matricola rifiutata', () => {
      expect(validateConsumption(reading(9, '2026-01-01', 1000), others, TODAY)).toMatch(/già presente/);
    });

    it('il record in modifica non è confrontato con se stesso', () => {
      expect(validateConsumption(reading(1, '2026-01-01', 1050), others, TODAY)).toBeNull();
    });

    it('lettura senza matricola rifiutata', () => {
      expect(validateConsumption({ ...reading(9, '2026-02-01', 1100), meter_number: '  ' }, others, TODAY)).toMatch(/obbligatori/);
    });

    it('periodo sovrapposto a un altro periodo rifiutato', () => {
      expect(validateConsumption(period(9, '2026-05-31', '2026-06-10', 10), others, TODAY)).toMatch(/sovrappone/);
    });

    it('periodo con fine prima dell’inizio rifiutato', () => {
      expect(validateConsumption(period(9, '2026-06-10', '2026-06-01', 10), others, TODAY)).toMatch(/inizio/);
    });

    it('periodo adiacente ammesso', () => {
      expect(validateConsumption(period(9, '2026-06-01', '2026-06-30', 10), others, TODAY)).toBeNull();
    });
  });
});
```

- [ ] **Step 3: Eseguire il test, verificare che fallisca**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/utility-consumptions/consumption-calculator.spec.ts --maxWorkers=2`
Expected: FAIL — `Cannot find module './consumption-calculator'`.

- [ ] **Step 4: Implementare il calcolatore**

`backend/src/apis/utility-consumptions/consumption-calculator.ts`:
```ts
import { ConsumptionKind } from './enum/consumption-kind.enum';
import { EstimateSource } from './enum/estimate-source.enum';

// Funzioni pure, nessun accesso DB: tutto il calcolo consumi passa di qui
// ed è testato in isolamento. Le date sono giorni di calendario
// ('YYYY-MM-DD'), rappresentati internamente come numero di giorni
// dall'epoch UTC — niente orari/timezone.

export interface ConsumptionRecord {
  id?: number;
  kind: ConsumptionKind;
  reading_date?: string | null;
  // number | string: le colonne decimal arrivano da mysql2 come stringa.
  reading_value?: number | string | null;
  meter_number?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  consumption?: number | string | null;
}

export interface MonthlyPoint {
  month: string;
  actual: number;
  covered_days: number;
  days: number;
  estimated: number;
}

const MS_PER_DAY = 86_400_000;
export const WINDOW_DAYS = 365;
const PAST_MONTHS = 24;
const FUTURE_MONTHS = 12;

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function toDay(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

export function fromDay(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

export function todayDay(now: Date = new Date()): number {
  return Math.round(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / MS_PER_DAY);
}

export function normalizeMeter(meter?: string | null): string {
  return (meter ?? '').trim().toLowerCase();
}

export function sortedReadings(records: ConsumptionRecord[]): ConsumptionRecord[] {
  return records
    .filter((r) => r.kind === ConsumptionKind.READING && r.reading_date && r.reading_value != null)
    .sort((a, b) => toDay(a.reading_date) - toDay(b.reading_date) || (a.id ?? 0) - (b.id ?? 0));
}

// Consumo di ogni lettura rispetto alla precedente (per data) con la stessa
// matricola adiacente; null per la prima lettura e per un nuovo contatore.
export function readingDeltas(records: ConsumptionRecord[]): Map<number, number | null> {
  const result = new Map<number, number | null>();
  let prev: ConsumptionRecord | null = null;
  for (const r of sortedReadings(records)) {
    const sameMeter = prev && normalizeMeter(prev.meter_number) === normalizeMeter(r.meter_number);
    if (r.id !== undefined) {
      result.set(r.id, sameMeter ? round2(Number(r.reading_value) - Number(prev.reading_value)) : null);
    }
    prev = r;
  }
  return result;
}

// Mappa sparsa giorno -> consumo. I periodi hanno precedenza: un giorno
// coperto da un periodo ignora la quota da letture (non redistribuita).
export function buildDailyConsumption(records: ConsumptionRecord[]): Map<number, number> {
  const daily = new Map<number, number>();

  for (const r of records) {
    if (r.kind !== ConsumptionKind.PERIOD || !r.period_start || !r.period_end || r.consumption == null) continue;
    const start = toDay(r.period_start);
    const end = toDay(r.period_end);
    const days = end - start + 1;
    if (days <= 0) continue;
    const rate = Number(r.consumption) / days;
    for (let d = start; d <= end; d++) daily.set(d, (daily.get(d) ?? 0) + rate);
  }

  const periodDays = new Set(daily.keys());
  const readings = sortedReadings(records);
  for (let i = 1; i < readings.length; i++) {
    const a = readings[i - 1];
    const b = readings[i];
    if (normalizeMeter(a.meter_number) !== normalizeMeter(b.meter_number)) continue;
    const from = toDay(a.reading_date);
    const to = toDay(b.reading_date);
    if (to <= from) continue;
    const rate = (Number(b.reading_value) - Number(a.reading_value)) / (to - from);
    if (rate < 0) continue;
    for (let d = from + 1; d <= to; d++) {
      if (!periodDays.has(d)) daily.set(d, (daily.get(d) ?? 0) + rate);
    }
  }

  return daily;
}

export function computeActual(daily: Map<number, number>, today: number): { actual: number; coverageDays: number } {
  let actual = 0;
  let coverageDays = 0;
  for (let d = today - WINDOW_DAYS + 1; d <= today; d++) {
    const v = daily.get(d);
    if (v !== undefined) {
      actual += v;
      coverageDays++;
    }
  }
  return { actual: round2(actual), coverageDays };
}

// Media giornaliera di riferimento: giorni coperti nella finestra, se
// nessuno tutto lo storico coperto (fino a oggi), altrimenti null.
function meanDaily(daily: Map<number, number>, today: number): number | null {
  const average = (days: number[]) => days.reduce((sum, d) => sum + daily.get(d), 0) / days.length;
  const all = [...daily.keys()].filter((d) => d <= today);
  const inWindow = all.filter((d) => d > today - WINDOW_DAYS);
  if (inWindow.length) return average(inWindow);
  if (all.length) return average(all);
  return null;
}

// Stima di un giorno futuro: stesso giorno dell'anno precedente (ripiegando
// di 365 giorni finché si cade in un giorno passato), altrimenti media.
function estimatedDay(daily: Map<number, number>, day: number, today: number, mean: number): number {
  let source = day - WINDOW_DAYS;
  while (source > today) source -= WINDOW_DAYS;
  return daily.get(source) ?? mean;
}

export function computeSeasonalEstimate(daily: Map<number, number>, today: number): number | null {
  const mean = meanDaily(daily, today);
  if (mean === null) return null;
  let total = 0;
  for (let d = today + 1; d <= today + WINDOW_DAYS; d++) total += estimatedDay(daily, d, today, mean);
  return round2(total);
}

export function computeMonthlySeries(daily: Map<number, number>, today: number): MonthlyPoint[] {
  const mean = meanDaily(daily, today);
  const t = new Date(today * MS_PER_DAY);
  const year = t.getUTCFullYear();
  const month = t.getUTCMonth();
  const points: MonthlyPoint[] = [];

  for (let offset = -(PAST_MONTHS - 1); offset <= FUTURE_MONTHS; offset++) {
    const first = Math.round(Date.UTC(year, month + offset, 1) / MS_PER_DAY);
    const next = Math.round(Date.UTC(year, month + offset + 1, 1) / MS_PER_DAY);
    let actual = 0;
    let covered = 0;
    let estimated = 0;
    for (let d = first; d < next; d++) {
      if (d <= today) {
        const v = daily.get(d);
        if (v !== undefined) {
          actual += v;
          covered++;
        }
      } else if (mean !== null) {
        estimated += estimatedDay(daily, d, today, mean);
      }
    }
    points.push({
      month: fromDay(first).slice(0, 7),
      actual: round2(actual),
      covered_days: covered,
      days: next - first,
      estimated: round2(estimated),
    });
  }

  return points;
}

export function manualValidUntil(setAt: Date): Date {
  const limit = new Date(setAt);
  limit.setMonth(limit.getMonth() + 12);
  return limit;
}

// null = stima persistita da non toccare.
export function decideEstimate(
  state: { source: EstimateSource; setAt: Date | null },
  historyEstimate: number | null,
  now: Date,
): {
  estimated_annual_consumption: number;
  estimated_consumption_source: EstimateSource.HISTORY;
  estimated_consumption_set_at: null;
} | null {
  const manualValid =
    state.source === EstimateSource.MANUAL && state.setAt !== null && manualValidUntil(state.setAt) > now;
  if (manualValid || historyEstimate === null) return null;
  return {
    estimated_annual_consumption: historyEstimate,
    estimated_consumption_source: EstimateSource.HISTORY,
    estimated_consumption_set_at: null,
  };
}

// Tiene solo i campi del tipo di rilevazione, azzera gli altri.
export function normalizeByKind(
  record: ConsumptionRecord & { notes?: string | null },
): ConsumptionRecord & { notes: string | null } {
  const isReading = record.kind === ConsumptionKind.READING;
  return {
    kind: record.kind,
    reading_date: isReading ? (record.reading_date ?? null) : null,
    reading_value: isReading ? (record.reading_value ?? null) : null,
    meter_number: isReading ? (record.meter_number?.trim() ?? null) : null,
    period_start: isReading ? null : (record.period_start ?? null),
    period_end: isReading ? null : (record.period_end ?? null),
    consumption: isReading ? null : (record.consumption ?? null),
    notes: record.notes ?? null,
  };
}

// Messaggio d'errore (italiano, mostrato all'utente) o null se valida.
// `others` = altre rilevazioni non cancellate della stessa utenza; il record
// con lo stesso id del candidato (modifica) viene ignorato.
export function validateConsumption(
  candidate: ConsumptionRecord,
  others: ConsumptionRecord[],
  today: number,
): string | null {
  const rest = others.filter((o) => candidate.id === undefined || o.id !== candidate.id);

  if (candidate.kind === ConsumptionKind.READING) {
    if (!candidate.reading_date || candidate.reading_value == null || !normalizeMeter(candidate.meter_number)) {
      return 'Data, valore lettura e matricola sono obbligatori.';
    }
    const day = toDay(candidate.reading_date);
    if (day > today) return 'La data della lettura non può essere futura.';
    const meter = normalizeMeter(candidate.meter_number);
    const value = Number(candidate.reading_value);
    const sameMeter = sortedReadings(rest).filter((r) => normalizeMeter(r.meter_number) === meter);
    if (sameMeter.some((r) => toDay(r.reading_date) === day)) {
      return 'Esiste già una lettura per questa matricola in questa data.';
    }
    const prev = sameMeter.filter((r) => toDay(r.reading_date) < day).at(-1);
    if (prev && value < Number(prev.reading_value)) {
      return `Lettura inferiore alla precedente (${Number(prev.reading_value)} del ${prev.reading_date}) per la stessa matricola.`;
    }
    const next = sameMeter.find((r) => toDay(r.reading_date) > day);
    if (next && value > Number(next.reading_value)) {
      return `Lettura superiore alla successiva (${Number(next.reading_value)} del ${next.reading_date}) per la stessa matricola.`;
    }
    return null;
  }

  if (!candidate.period_start || !candidate.period_end || candidate.consumption == null) {
    return 'Inizio, fine periodo e consumo sono obbligatori.';
  }
  const start = toDay(candidate.period_start);
  const end = toDay(candidate.period_end);
  if (end < start) return 'La fine del periodo non può precedere l’inizio.';
  if (end > today) return 'Il periodo non può terminare nel futuro.';
  const overlap = rest.find(
    (o) =>
      o.kind === ConsumptionKind.PERIOD &&
      o.period_start &&
      o.period_end &&
      !(end < toDay(o.period_start) || start > toDay(o.period_end)),
  );
  if (overlap) {
    return `Il periodo si sovrappone a un periodo già inserito (${overlap.period_start} – ${overlap.period_end}).`;
  }
  return null;
}
```

- [ ] **Step 5: Eseguire il test, verificare che passi**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/utility-consumptions/consumption-calculator.spec.ts --maxWorkers=2`
Expected: PASS, tutti i test verdi.

- [ ] **Step 6: Commit**

```bash
git add backend/src/apis/utility-consumptions/enum/consumption-kind.enum.ts backend/src/apis/utility-consumptions/enum/estimate-source.enum.ts backend/src/apis/utility-consumptions/consumption-unit.ts backend/src/apis/utility-consumptions/consumption-calculator.ts backend/src/apis/utility-consumptions/consumption-calculator.spec.ts
git commit -m "feat(consumi): calcolatore consumi effettivi e stima stagionale"
```

---

### Task 2: Entity, colonne utenza, migration

**Files:**
- Create: `backend/src/apis/utility-consumptions/entity/utility-consumption.entity.ts`
- Modify: `backend/src/apis/utility/entity/utility.entity.ts` (dopo `estimated_annual_consumption`, riga ~60)
- Create: `backend/src/database/migrations/1790500000000-UtilityConsumptions.ts` (via scratch)

**Interfaces:**
- Consumes: enum Task 1.
- Produces: entity `UtilityConsumption` (colonne come spec; `reading_value`/`consumption` tipizzati `number` ma a runtime stringa); su `Utility`: `estimated_consumption_source: EstimateSource`, `estimated_consumption_set_at: Date | null`, `actual_consumption_coverage_days: number`.

- [ ] **Step 1: Entity rilevazione**

`backend/src/apis/utility-consumptions/entity/utility-consumption.entity.ts`:
```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Utility } from '@apis/utility/entity/utility.entity';
import { SystemUser } from '@apis/system-users/entity/system-user.entity';
import { ConsumptionKind, ConsumptionSource } from '../enum/consumption-kind.enum';

// Rilevazione consumo di un'utenza: lettura contatore (valore cumulativo a
// una data, con matricola) oppure consumo di un periodo. I campi dell'altro
// tipo restano null.
@Entity('utility_consumptions')
@Index(['utility_id_fk', 'deleted'])
export class UtilityConsumption {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int' })
  utility_id_fk: number;

  @Column({ type: 'enum', enum: ConsumptionKind })
  kind: ConsumptionKind;

  @Column({ type: 'date', nullable: true })
  reading_date: string | null;

  @Column({ type: 'decimal', precision: 14, scale: 3, nullable: true })
  reading_value: number | null;

  @Column({ length: 255, nullable: true })
  meter_number: string | null;

  @Column({ type: 'date', nullable: true })
  period_start: string | null;

  @Column({ type: 'date', nullable: true })
  period_end: string | null;

  @Column({ type: 'decimal', precision: 14, scale: 3, nullable: true })
  consumption: number | null;

  @Column({ type: 'enum', enum: ConsumptionSource, default: ConsumptionSource.MANUAL })
  source: ConsumptionSource;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  create_date: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  update_date: Date;

  @Column({ name: 'created_by_user_id' })
  created_by_user_id: number;

  @Column({ name: 'updated_by_user_id' })
  updated_by_user_id: number;

  @Column({ type: 'boolean', default: false })
  deleted: boolean;

  @ManyToOne(() => Utility, { nullable: false })
  @JoinColumn({ name: 'utility_id_fk' })
  utility: Utility;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'created_by_user_id' })
  created_by: SystemUser;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'updated_by_user_id' })
  updated_by: SystemUser;
}
```

- [ ] **Step 2: Colonne su Utility**

In `backend/src/apis/utility/entity/utility.entity.ts` aggiungere l'import:
```ts
import { EstimateSource } from '@apis/utility-consumptions/enum/estimate-source.enum';
```
e subito dopo la colonna `estimated_annual_consumption`:
```ts
  // Origine della stima annua: MANUAL (inserita dall'utente, valida 12 mesi
  // da estimated_consumption_set_at), HISTORY (calcolata dallo storico
  // consumi), NONE (nessun dato). Vedi ConsumptionRecalcService.
  @Column({ type: 'enum', enum: EstimateSource, default: EstimateSource.NONE })
  estimated_consumption_source: EstimateSource;

  @Column({ type: 'datetime', nullable: true })
  estimated_consumption_set_at: Date | null;

  // Giorni degli ultimi 365 coperti da dati reali: actual_consumption è
  // parziale se < 365.
  @Column({ type: 'int', default: 0 })
  actual_consumption_coverage_days: number;
```

- [ ] **Step 3: Generare la migration grezza per ricavare nomi indici/FK**

Run (container api attivo con override dev):
```bash
docker exec -u root utenzepa-api-1 node -r ts-node/register -r tsconfig-paths/register node_modules/typeorm/cli.js migration:generate tools/scratch/Raw -d src/database/data-source.ts
docker exec -u root utenzepa-api-1 chown -R 1000:1000 tools/scratch
```
Expected: file `backend/tools/scratch/<timestamp>-Raw.ts` (fuori da `src/`, il watcher non lo esegue). Contiene anche drift preesistente non correlato (vedi CLAUDE.md): **tenere solo** `CREATE TABLE utility_consumptions`, i suoi `CREATE INDEX`/`ADD CONSTRAINT FK`, e i tre `ALTER TABLE utilities ADD ...`. Annotare i nomi generati di indice composito e delle tre FK.

- [ ] **Step 4: Scrivere la migration finale in scratch**

`backend/tools/scratch/1790500000000-UtilityConsumptions.ts` — sostituire `IDX_…`/`FK_…` con i nomi esatti annotati allo step 3 (servono identici, altrimenti il prossimo `migration:generate` li vede come drift):
```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

// Storico consumi utenze + colonne di stato stima/copertura su utilities.
// Le stime già presenti (import storico) vengono trattate come manuali,
// con data = ultima modifica dell'utenza: scadono 12 mesi dopo.
export class UtilityConsumptions1790500000000 implements MigrationInterface {
  name = 'UtilityConsumptions1790500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`utility_consumptions\` (\`id\` int NOT NULL AUTO_INCREMENT, \`utility_id_fk\` int NOT NULL, \`kind\` enum ('READING', 'PERIOD') NOT NULL, \`reading_date\` date NULL, \`reading_value\` decimal(14,3) NULL, \`meter_number\` varchar(255) NULL, \`period_start\` date NULL, \`period_end\` date NULL, \`consumption\` decimal(14,3) NULL, \`source\` enum ('MANUAL', 'INVOICE', 'IMPORT', 'API') NOT NULL DEFAULT 'MANUAL', \`notes\` text NULL, \`create_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`update_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`created_by_user_id\` int NOT NULL, \`updated_by_user_id\` int NOT NULL, \`deleted\` tinyint NOT NULL DEFAULT 0, INDEX \`IDX_<da_generate>\` (\`utility_id_fk\`, \`deleted\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`utility_consumptions\` ADD CONSTRAINT \`FK_<utility_da_generate>\` FOREIGN KEY (\`utility_id_fk\`) REFERENCES \`utilities\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`utility_consumptions\` ADD CONSTRAINT \`FK_<created_by_da_generate>\` FOREIGN KEY (\`created_by_user_id\`) REFERENCES \`system_users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`utility_consumptions\` ADD CONSTRAINT \`FK_<updated_by_da_generate>\` FOREIGN KEY (\`updated_by_user_id\`) REFERENCES \`system_users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`utilities\` ADD \`estimated_consumption_source\` enum ('MANUAL', 'HISTORY', 'NONE') NOT NULL DEFAULT 'NONE'`,
    );
    await queryRunner.query(`ALTER TABLE \`utilities\` ADD \`estimated_consumption_set_at\` datetime NULL`);
    await queryRunner.query(
      `ALTER TABLE \`utilities\` ADD \`actual_consumption_coverage_days\` int NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `UPDATE \`utilities\` SET \`estimated_consumption_source\` = 'MANUAL', \`estimated_consumption_set_at\` = \`update_date\`, \`update_date\` = \`update_date\` WHERE \`estimated_annual_consumption\` > 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`utilities\` DROP COLUMN \`actual_consumption_coverage_days\``);
    await queryRunner.query(`ALTER TABLE \`utilities\` DROP COLUMN \`estimated_consumption_set_at\``);
    await queryRunner.query(`ALTER TABLE \`utilities\` DROP COLUMN \`estimated_consumption_source\``);
    await queryRunner.query(`ALTER TABLE \`utility_consumptions\` DROP FOREIGN KEY \`FK_<updated_by_da_generate>\``);
    await queryRunner.query(`ALTER TABLE \`utility_consumptions\` DROP FOREIGN KEY \`FK_<created_by_da_generate>\``);
    await queryRunner.query(`ALTER TABLE \`utility_consumptions\` DROP FOREIGN KEY \`FK_<utility_da_generate>\``);
    await queryRunner.query(`DROP TABLE \`utility_consumptions\``);
  }
}
```
Le colonne DDL (tipi, default, `timestamp(6)`) vanno confrontate con l'output di generate e allineate se differiscono. Nel file finale **non devono restare** segnaposto `<…>`.

- [ ] **Step 5: Spostare la migration nel path definitivo e verificare**

```bash
mv backend/tools/scratch/1790500000000-UtilityConsumptions.ts backend/src/database/migrations/
rm backend/tools/scratch/*-Raw.ts
docker restart utenzepa-api-1
```
Poi (password da `.env`):
```bash
docker exec utenzepa-mysql-1 mysql -uroot -p'<MYSQL_PASSWORD>' mydatabase -e "SELECT name FROM migrations ORDER BY id DESC LIMIT 1; SHOW CREATE TABLE utility_consumptions\G; SELECT estimated_consumption_source, COUNT(*) FROM utilities GROUP BY 1;"
```
Expected: ultima migration `UtilityConsumptions1790500000000`; tabella presente; conteggi `MANUAL`/`NONE` coerenti con le utenze che hanno stima > 0. Log api senza errori (`docker logs --tail 50 utenzepa-api-1`).

Poi rigenerare per controllo drift:
```bash
docker exec -u root utenzepa-api-1 node -r ts-node/register -r tsconfig-paths/register node_modules/typeorm/cli.js migration:generate tools/scratch/Check -d src/database/data-source.ts
```
Expected: il file generato non contiene statement su `utility_consumptions` né sulle tre colonne nuove (solo drift preesistente). Cancellarlo.

- [ ] **Step 6: Commit**

```bash
git add backend/src/apis/utility-consumptions/entity/utility-consumption.entity.ts backend/src/apis/utility/entity/utility.entity.ts backend/src/database/migrations/1790500000000-UtilityConsumptions.ts
git commit -m "feat(consumi): tabella utility_consumptions e stato stima su utenze"
```

---

### Task 3: Servizio di ricalcolo

**Files:**
- Create: `backend/src/apis/utility-consumptions/consumption-recalc.service.ts`
- Test: `backend/src/apis/utility-consumptions/consumption-recalc.service.spec.ts`

**Interfaces:**
- Consumes: Task 1 (`buildDailyConsumption`, `computeActual`, `computeSeasonalEstimate`, `decideEstimate`, `todayDay`), Task 2 entity.
- Produces:
  - `ConsumptionRecalcService.recalcUtility(utilityId: number, now?: Date): Promise<void>`
  - `ConsumptionRecalcService.recalcAll(now?: Date): Promise<{ processed: number; failed: number }>`
  - `ConsumptionRecalcService.handleNightlyRecalc(): Promise<void>` (chiamata dal cron)
  - costruttore `(consumptionRepo: Repository<UtilityConsumption>, utilityRepo: Repository<Utility>)`

- [ ] **Step 1: Test (fallisce)**

`backend/src/apis/utility-consumptions/consumption-recalc.service.spec.ts`:
```ts
import { ConsumptionRecalcService } from './consumption-recalc.service';
import { ConsumptionKind } from './enum/consumption-kind.enum';
import { EstimateSource } from './enum/estimate-source.enum';
import { HardTypeEnum } from '@apis/utility-types/enum/hard-type.enum';

const NOW = new Date('2026-09-29T10:00:00');

describe('ConsumptionRecalcService', () => {
  let service: ConsumptionRecalcService;
  let consumptionRepo: { find: jest.Mock };
  let utilityRepo: { findOne: jest.Mock; update: jest.Mock; createQueryBuilder: jest.Mock };
  let qb: { innerJoin: jest.Mock; select: jest.Mock; where: jest.Mock; andWhere: jest.Mock; getRawMany: jest.Mock };

  const utility = (overrides: Record<string, unknown> = {}) => ({
    id: 7,
    estimated_annual_consumption: '0.00',
    estimated_consumption_source: EstimateSource.NONE,
    estimated_consumption_set_at: null,
    utilityType: { hard_type: HardTypeEnum.LIGHT },
    ...overrides,
  });

  // 2026-07-01..2026-07-10, 100 totali: effettivo 100, copertura 10, stima 3650
  const julyPeriod = [
    { id: 1, kind: ConsumptionKind.PERIOD, period_start: '2026-07-01', period_end: '2026-07-10', consumption: '100.000' },
  ];

  beforeEach(() => {
    qb = {
      innerJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    consumptionRepo = { find: jest.fn().mockResolvedValue(julyPeriod) };
    utilityRepo = {
      findOne: jest.fn().mockResolvedValue(utility()),
      update: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };
    service = new ConsumptionRecalcService(consumptionRepo as never, utilityRepo as never);
  });

  it('NONE con storico: scrive effettivo, copertura e stima HISTORY senza toccare update_date', async () => {
    await service.recalcUtility(7, NOW);
    const [id, patch] = utilityRepo.update.mock.calls[0];
    expect(id).toBe(7);
    expect(patch).toMatchObject({
      actual_consumption: 100,
      actual_consumption_coverage_days: 10,
      estimated_annual_consumption: 3650,
      estimated_consumption_source: EstimateSource.HISTORY,
      estimated_consumption_set_at: null,
    });
    expect(typeof patch.update_date).toBe('function');
    expect(patch.update_date()).toBe('`update_date`');
  });

  it('manuale valida: aggiorna solo effettivo e copertura', async () => {
    utilityRepo.findOne.mockResolvedValue(
      utility({ estimated_consumption_source: EstimateSource.MANUAL, estimated_consumption_set_at: new Date('2026-03-01') }),
    );
    await service.recalcUtility(7, NOW);
    const patch = utilityRepo.update.mock.calls[0][1];
    expect(patch.actual_consumption).toBe(100);
    expect(patch).not.toHaveProperty('estimated_annual_consumption');
  });

  it('manuale scaduta con storico: passa a HISTORY', async () => {
    utilityRepo.findOne.mockResolvedValue(
      utility({ estimated_consumption_source: EstimateSource.MANUAL, estimated_consumption_set_at: new Date('2025-01-01') }),
    );
    await service.recalcUtility(7, NOW);
    expect(utilityRepo.update.mock.calls[0][1].estimated_consumption_source).toBe(EstimateSource.HISTORY);
  });

  it('manuale scaduta senza storico: stima invariata', async () => {
    consumptionRepo.find.mockResolvedValue([]);
    utilityRepo.findOne.mockResolvedValue(
      utility({ estimated_consumption_source: EstimateSource.MANUAL, estimated_consumption_set_at: new Date('2025-01-01') }),
    );
    await service.recalcUtility(7, NOW);
    const patch = utilityRepo.update.mock.calls[0][1];
    expect(patch).toMatchObject({ actual_consumption: 0, actual_consumption_coverage_days: 0 });
    expect(patch).not.toHaveProperty('estimated_consumption_source');
  });

  it('utenza INTERNET o inesistente: nessuna scrittura', async () => {
    utilityRepo.findOne.mockResolvedValue(utility({ utilityType: { hard_type: HardTypeEnum.INTERNET } }));
    await service.recalcUtility(7, NOW);
    utilityRepo.findOne.mockResolvedValue(null);
    await service.recalcUtility(8, NOW);
    expect(utilityRepo.update).not.toHaveBeenCalled();
  });

  it('recalcAll: continua dopo un errore su una utenza', async () => {
    qb.getRawMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    utilityRepo.findOne.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(utility({ id: 2 }));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(service.recalcAll(NOW)).resolves.toEqual({ processed: 1, failed: 1 });
    expect(utilityRepo.update).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Verificare che fallisca**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/utility-consumptions/consumption-recalc.service.spec.ts --maxWorkers=2`
Expected: FAIL — modulo `./consumption-recalc.service` non trovato.

- [ ] **Step 3: Implementare**

`backend/src/apis/utility-consumptions/consumption-recalc.service.ts`:
```ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Utility } from '@apis/utility/entity/utility.entity';
import { HardTypeEnum } from '@apis/utility-types/enum/hard-type.enum';
import { UtilityConsumption } from './entity/utility-consumption.entity';
import {
  buildDailyConsumption,
  computeActual,
  computeSeasonalEstimate,
  decideEstimate,
  todayDay,
} from './consumption-calculator';

// Persiste su utilities i valori calcolati dallo storico consumi.
// Scrittura via repository.update diretto: è un ricalcolo di sistema, non
// una modifica utente — niente audit log e update_date lasciato invariato
// (altrimenti il cron notturno sposterebbe "Ultima modifica" di ogni utenza).
@Injectable()
export class ConsumptionRecalcService {
  private readonly logger = new Logger(ConsumptionRecalcService.name);

  constructor(
    @InjectRepository(UtilityConsumption)
    private readonly consumptionRepo: Repository<UtilityConsumption>,
    @InjectRepository(Utility)
    private readonly utilityRepo: Repository<Utility>,
  ) {}

  async recalcUtility(utilityId: number, now: Date = new Date()): Promise<void> {
    const utility = await this.utilityRepo.findOne({
      where: { id: utilityId },
      relations: { utilityType: true },
    });
    if (!utility || utility.utilityType?.hard_type === HardTypeEnum.INTERNET) return;

    const records = await this.consumptionRepo.find({ where: { utility_id_fk: utilityId, deleted: false } });
    const daily = buildDailyConsumption(records);
    const today = todayDay(now);
    const { actual, coverageDays } = computeActual(daily, today);
    const estimate = decideEstimate(
      {
        source: utility.estimated_consumption_source,
        setAt: utility.estimated_consumption_set_at ? new Date(utility.estimated_consumption_set_at) : null,
      },
      computeSeasonalEstimate(daily, today),
      now,
    );

    await this.utilityRepo.update(utilityId, {
      actual_consumption: actual,
      actual_consumption_coverage_days: coverageDays,
      ...(estimate ?? {}),
      update_date: () => '`update_date`',
    } as never);
  }

  async recalcAll(now: Date = new Date()): Promise<{ processed: number; failed: number }> {
    const rows: { id: number }[] = await this.utilityRepo
      .createQueryBuilder('u')
      .innerJoin('u.utilityType', 'ut')
      .select('u.id', 'id')
      .where('u.deleted = 0')
      .andWhere('ut.hard_type <> :internet', { internet: HardTypeEnum.INTERNET })
      .getRawMany();

    let processed = 0;
    let failed = 0;
    for (const { id } of rows) {
      try {
        await this.recalcUtility(Number(id), now);
        processed++;
      } catch (error) {
        failed++;
        console.error(`[ConsumptionRecalcService] Ricalcolo fallito per utenza ${id}`, error);
      }
    }
    return { processed, failed };
  }

  async handleNightlyRecalc(): Promise<void> {
    const { processed, failed } = await this.recalcAll();
    this.logger.log(`Ricalcolo consumi notturno: ${processed} utenze aggiornate, ${failed} errori`);
  }
}
```

- [ ] **Step 4: Verificare che passi**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/utility-consumptions/consumption-recalc.service.spec.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/apis/utility-consumptions/consumption-recalc.service.ts backend/src/apis/utility-consumptions/consumption-recalc.service.spec.ts
git commit -m "feat(consumi): ricalcolo effettivo e stima persistiti su utenza"
```

---

### Task 4: CRUD rilevazioni, endpoint, modulo e cron

**Files:**
- Create: `backend/src/apis/utility/meter-number.helper.ts`
- Create: `backend/src/apis/utility-consumptions/dto/create-utility-consumption.dto.ts`
- Create: `backend/src/apis/utility-consumptions/dto/update-utility-consumption.dto.ts`
- Create: `backend/src/apis/utility-consumptions/utility-consumptions.service.ts`
- Create: `backend/src/apis/utility-consumptions/utility-consumptions.controller.ts`
- Create: `backend/src/apis/utility-consumptions/utility-consumptions.module.ts`
- Modify: `backend/src/app.module.ts` (import + array `imports`, accanto a `UtilitiesModule`)
- Test: `backend/src/apis/utility-consumptions/utility-consumptions.service.spec.ts`

**Interfaces:**
- Consumes: Task 1–3.
- Produces:
  - `findMeterConflict(utilityRepo: Repository<Utility>, meterNumber: string | null | undefined, excludeUtilityId: number | null): Promise<Utility | null>`
  - `UtilityConsumptionsService.findByUtility(utilityId): Promise<UtilityConsumptionRow[]>` dove `UtilityConsumptionRow = UtilityConsumption & { computed_consumption: number | null }` con decimal convertiti a number
  - `createForUtility(utilityId, dto, userId)`, `update(id, dto, userId)`, `remove(id, userId)`
  - `getSummary(utilityId): Promise<UtilityConsumptionSummary>` = `{ unit: string|null; actual_consumption: number; coverage_days: number; estimated_annual_consumption: number; estimated_source: EstimateSource; estimated_valid_until: string|null; monthly: MonthlyPoint[] }`
  - Route (prefisso globale `/api/v1`): `GET utilities/:utilityId/consumptions`, `GET utilities/:utilityId/consumption-summary`, `POST utilities/:utilityId/consumptions`, `PATCH utility-consumptions/:id`, `DELETE utility-consumptions/:id`
  - Modulo `UtilityConsumptionsModule` esporta `ConsumptionRecalcService`

- [ ] **Step 1: Helper univocità matricola**

`backend/src/apis/utility/meter-number.helper.ts`:
```ts
import { Repository } from 'typeorm';
import { Utility } from './entity/utility.entity';

// Matricola contatore univoca tra utenze non cancellate (trim,
// case-insensitive). Check applicativo, non indice DB: soft delete e
// duplicati già presenti in produzione lo impediscono.
export async function findMeterConflict(
  utilityRepo: Repository<Utility>,
  meterNumber: string | null | undefined,
  excludeUtilityId: number | null,
): Promise<Utility | null> {
  const normalized = (meterNumber ?? '').trim().toLowerCase();
  if (!normalized) return null;
  const qb = utilityRepo
    .createQueryBuilder('u')
    .where('u.deleted = 0')
    .andWhere('LOWER(TRIM(u.meter_number)) = :meter', { meter: normalized });
  if (excludeUtilityId !== null) {
    qb.andWhere('u.id <> :excludeId', { excludeId: excludeUtilityId });
  }
  return qb.getOne();
}
```

- [ ] **Step 2: DTO**

`backend/src/apis/utility-consumptions/dto/create-utility-consumption.dto.ts`:
```ts
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateIf } from 'class-validator';
import { ConsumptionKind } from '../enum/consumption-kind.enum';

const isReading = (o: CreateUtilityConsumptionDto) => o.kind === ConsumptionKind.READING;
const isPeriod = (o: CreateUtilityConsumptionDto) => o.kind === ConsumptionKind.PERIOD;

// I campi dell'altro tipo possono arrivare null (il form li invia sempre):
// ValidateIf li salta, normalizeByKind li azzera comunque.
export class CreateUtilityConsumptionDto {
  @IsEnum(ConsumptionKind)
  kind: ConsumptionKind;

  @ValidateIf(isReading)
  @IsDateString()
  reading_date?: string | null;

  @ValidateIf(isReading)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  reading_value?: number | null;

  @ValidateIf(isReading)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  meter_number?: string | null;

  @ValidateIf(isPeriod)
  @IsDateString()
  period_start?: string | null;

  @ValidateIf(isPeriod)
  @IsDateString()
  period_end?: string | null;

  @ValidateIf(isPeriod)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  consumption?: number | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}
```

`backend/src/apis/utility-consumptions/dto/update-utility-consumption.dto.ts`:
```ts
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ConsumptionKind } from '../enum/consumption-kind.enum';

// PATCH parziale: la completezza del record risultante (merge con quello
// persistito) è verificata da validateConsumption nel service.
export class UpdateUtilityConsumptionDto {
  @IsOptional()
  @IsEnum(ConsumptionKind)
  kind?: ConsumptionKind;

  @IsOptional()
  @IsDateString()
  reading_date?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  reading_value?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  meter_number?: string | null;

  @IsOptional()
  @IsDateString()
  period_start?: string | null;

  @IsOptional()
  @IsDateString()
  period_end?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  consumption?: number | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}
```

- [ ] **Step 3: Test service (fallisce)**

`backend/src/apis/utility-consumptions/utility-consumptions.service.spec.ts`:
```ts
import { BadRequestException } from '@nestjs/common';
import { UtilityConsumptionsService } from './utility-consumptions.service';
import { ConsumptionKind } from './enum/consumption-kind.enum';
import { EstimateSource } from './enum/estimate-source.enum';
import { HardTypeEnum } from '@apis/utility-types/enum/hard-type.enum';

describe('UtilityConsumptionsService', () => {
  let service: UtilityConsumptionsService;
  let repo: { find: jest.Mock; findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let utilityRepo: { findOne: jest.Mock; update: jest.Mock; createQueryBuilder: jest.Mock };
  let meterQb: { where: jest.Mock; andWhere: jest.Mock; getOne: jest.Mock };
  let recalc: { recalcUtility: jest.Mock };

  const lightUtility = { id: 7, utility_id: 'IT001', meter_number: 'M1', utilityType: { hard_type: HardTypeEnum.LIGHT } };
  const existing = [
    { id: 1, utility_id_fk: 7, kind: ConsumptionKind.READING, reading_date: '2026-01-01', reading_value: '1000.000', meter_number: 'M1', deleted: false },
    { id: 2, utility_id_fk: 7, kind: ConsumptionKind.READING, reading_date: '2026-03-01', reading_value: '1300.000', meter_number: 'M1', deleted: false },
  ];

  beforeEach(() => {
    meterQb = { where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), getOne: jest.fn().mockResolvedValue(null) };
    repo = {
      find: jest.fn().mockResolvedValue(existing),
      findOne: jest.fn(),
      create: jest.fn((data) => data),
      save: jest.fn(async (data) => ({ id: 99, ...data })),
    };
    utilityRepo = {
      findOne: jest.fn().mockResolvedValue(lightUtility),
      update: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn().mockReturnValue(meterQb),
    };
    recalc = { recalcUtility: jest.fn().mockResolvedValue(undefined) };
    service = new UtilityConsumptionsService(repo as never, utilityRepo as never, recalc as never);
  });

  const readingDto = (date: string, value: number, meter = 'M1') => ({
    kind: ConsumptionKind.READING,
    reading_date: date,
    reading_value: value,
    meter_number: meter,
    period_start: null,
    period_end: null,
    consumption: null,
  });

  it('crea una lettura valida e ricalcola l’utenza', async () => {
    await service.createForUtility(7, readingDto('2026-04-01', 1400), 3);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ utility_id_fk: 7, kind: ConsumptionKind.READING, reading_value: 1400, created_by_user_id: 3 }),
    );
    expect(recalc.recalcUtility).toHaveBeenCalledWith(7);
  });

  it('rifiuta una lettura inferiore alla precedente stessa matricola', async () => {
    await expect(service.createForUtility(7, readingDto('2026-02-01', 900), 3)).rejects.toThrow(BadRequestException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rifiuta matricola già associata ad altra utenza', async () => {
    meterQb.getOne.mockResolvedValue({ id: 8, utility_id: 'IT002' });
    await expect(service.createForUtility(7, readingDto('2026-04-01', 5, 'OTHER'), 3)).rejects.toThrow(/IT002/);
  });

  it('rifiuta utenze INTERNET', async () => {
    utilityRepo.findOne.mockResolvedValue({ ...lightUtility, utilityType: { hard_type: HardTypeEnum.INTERNET } });
    await expect(service.createForUtility(7, readingDto('2026-04-01', 1400), 3)).rejects.toThrow(BadRequestException);
  });

  it('lettura più recente con nuova matricola aggiorna la matricola dell’utenza', async () => {
    repo.find
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce([
        ...existing,
        { id: 99, utility_id_fk: 7, kind: ConsumptionKind.READING, reading_date: '2026-04-01', reading_value: '5.000', meter_number: 'M2', deleted: false },
      ]);
    await service.createForUtility(7, readingDto('2026-04-01', 5, ' M2 '), 3);
    expect(utilityRepo.update).toHaveBeenCalledWith(7, { meter_number: 'M2' });
  });

  it('matricola uguale a meno di maiuscole/spazi: nessun aggiornamento matricola', async () => {
    repo.find
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce([
        ...existing,
        { id: 99, utility_id_fk: 7, kind: ConsumptionKind.READING, reading_date: '2026-04-01', reading_value: '1400.000', meter_number: 'm1', deleted: false },
      ]);
    await service.createForUtility(7, readingDto('2026-04-01', 1400, 'm1'), 3);
    expect(utilityRepo.update).not.toHaveBeenCalled();
  });

  it('PATCH che cambia tipo: campi lettura azzerati, validato come periodo', async () => {
    repo.findOne.mockResolvedValue({ ...existing[1] });
    await service.update(2, { kind: ConsumptionKind.PERIOD, period_start: '2026-05-01', period_end: '2026-05-31', consumption: 40 }, 3);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ kind: ConsumptionKind.PERIOD, reading_value: null, reading_date: null, meter_number: null, consumption: 40 }),
    );
    expect(recalc.recalcUtility).toHaveBeenCalledWith(7);
  });

  it('PATCH su rilevazione inesistente: 400', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.update(123, { notes: 'x' }, 3)).rejects.toThrow(BadRequestException);
  });

  it('findByUtility: decimal convertiti e consumo calcolato per riga', async () => {
    const rows = await service.findByUtility(7);
    const second = rows.find((r) => r.id === 2);
    expect(second.reading_value).toBe(1300);
    expect(second.computed_consumption).toBe(300);
    expect(rows.find((r) => r.id === 1).computed_consumption).toBeNull();
  });

  it('getSummary: unità, stato stima e serie mensile', async () => {
    utilityRepo.findOne.mockResolvedValue({
      ...lightUtility,
      actual_consumption: '300.00',
      actual_consumption_coverage_days: 59,
      estimated_annual_consumption: '1800.00',
      estimated_consumption_source: EstimateSource.MANUAL,
      estimated_consumption_set_at: new Date('2026-02-10T00:00:00'),
    });
    const summary = await service.getSummary(7);
    expect(summary.unit).toBe('kWh');
    expect(summary.actual_consumption).toBe(300);
    expect(summary.estimated_annual_consumption).toBe(1800);
    expect(summary.estimated_valid_until).toBe('2027-02-10');
    expect(summary.monthly).toHaveLength(36);
  });
});
```

- [ ] **Step 4: Verificare che fallisca**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/utility-consumptions/utility-consumptions.service.spec.ts --maxWorkers=2`
Expected: FAIL — modulo `./utility-consumptions.service` non trovato.

- [ ] **Step 5: Implementare il service**

`backend/src/apis/utility-consumptions/utility-consumptions.service.ts`:
```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseService } from '@apis/shared/base.service';
import { Utility } from '@apis/utility/entity/utility.entity';
import { findMeterConflict } from '@apis/utility/meter-number.helper';
import { HardTypeEnum } from '@apis/utility-types/enum/hard-type.enum';
import { UtilityConsumption } from './entity/utility-consumption.entity';
import { CreateUtilityConsumptionDto } from './dto/create-utility-consumption.dto';
import { UpdateUtilityConsumptionDto } from './dto/update-utility-consumption.dto';
import { ConsumptionRecalcService } from './consumption-recalc.service';
import { ConsumptionKind } from './enum/consumption-kind.enum';
import { EstimateSource } from './enum/estimate-source.enum';
import { CONSUMPTION_UNIT } from './consumption-unit';
import {
  buildDailyConsumption,
  computeMonthlySeries,
  ConsumptionRecord,
  manualValidUntil,
  MonthlyPoint,
  normalizeByKind,
  normalizeMeter,
  readingDeltas,
  sortedReadings,
  todayDay,
  validateConsumption,
} from './consumption-calculator';

export type UtilityConsumptionRow = UtilityConsumption & { computed_consumption: number | null };

export interface UtilityConsumptionSummary {
  unit: string | null;
  actual_consumption: number;
  coverage_days: number;
  estimated_annual_consumption: number;
  estimated_source: EstimateSource;
  estimated_valid_until: string | null;
  monthly: MonthlyPoint[];
}

const toNumber = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

const toLocalIsoDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

@Injectable()
export class UtilityConsumptionsService extends BaseService<
  UtilityConsumption,
  CreateUtilityConsumptionDto,
  UpdateUtilityConsumptionDto
> {
  protected readonly entityName = 'utility_consumptions';
  protected readonly relations = ['created_by', 'updated_by'];

  constructor(
    @InjectRepository(UtilityConsumption)
    protected readonly repo: Repository<UtilityConsumption>,
    @InjectRepository(Utility)
    private readonly utilityRepo: Repository<Utility>,
    private readonly recalc: ConsumptionRecalcService,
  ) {
    super();
  }

  async findByUtility(utilityId: number): Promise<UtilityConsumptionRow[]> {
    const rows = await this.repo.find({ where: { utility_id_fk: utilityId, deleted: false } });
    const deltas = readingDeltas(rows);
    const sortKey = (r: UtilityConsumption) => r.reading_date ?? r.period_end ?? '';
    return rows
      .map((r) => ({
        ...r,
        reading_value: toNumber(r.reading_value),
        consumption: toNumber(r.consumption),
        computed_consumption:
          r.kind === ConsumptionKind.PERIOD ? toNumber(r.consumption) : (deltas.get(r.id) ?? null),
      }))
      .sort((a, b) => sortKey(b).localeCompare(sortKey(a)) || b.id - a.id);
  }

  async getSummary(utilityId: number): Promise<UtilityConsumptionSummary> {
    const utility = await this.loadUtility(utilityId);
    const records = await this.repo.find({ where: { utility_id_fk: utilityId, deleted: false } });
    const setAt = utility.estimated_consumption_set_at ? new Date(utility.estimated_consumption_set_at) : null;
    return {
      unit: CONSUMPTION_UNIT[utility.utilityType?.hard_type] ?? null,
      actual_consumption: Number(utility.actual_consumption ?? 0),
      coverage_days: Number(utility.actual_consumption_coverage_days ?? 0),
      estimated_annual_consumption: Number(utility.estimated_annual_consumption ?? 0),
      estimated_source: utility.estimated_consumption_source,
      estimated_valid_until:
        utility.estimated_consumption_source === EstimateSource.MANUAL && setAt
          ? toLocalIsoDate(manualValidUntil(setAt))
          : null,
      monthly: computeMonthlySeries(buildDailyConsumption(records), todayDay()),
    };
  }

  async createForUtility(
    utilityId: number,
    dto: CreateUtilityConsumptionDto,
    userId: number,
  ): Promise<UtilityConsumption> {
    const utility = await this.loadUtility(utilityId);
    const candidate = normalizeByKind(dto as ConsumptionRecord & { notes?: string | null });
    await this.validate(utility, candidate);
    const saved = await super.create({ ...candidate, utility_id_fk: utilityId } as never, userId);
    await this.afterChange(utility);
    return saved;
  }

  async update(id: number, dto: UpdateUtilityConsumptionDto, userId?: number): Promise<UtilityConsumption> {
    const current = await this.repo.findOne({ where: { id, deleted: false } });
    if (!current) throw new BadRequestException('Rilevazione non trovata');
    const utility = await this.loadUtility(current.utility_id_fk);
    const merged = normalizeByKind({ ...current, ...dto } as ConsumptionRecord & { notes?: string | null });
    await this.validate(utility, { ...merged, id });
    const saved = await super.update(id, merged as never, userId);
    await this.afterChange(utility);
    return saved;
  }

  async remove(id: number, userId: number): Promise<void> {
    const current = await this.repo.findOne({ where: { id, deleted: false } });
    if (!current) throw new BadRequestException('Rilevazione non trovata');
    await super.remove(id, userId);
    await this.recalc.recalcUtility(current.utility_id_fk);
  }

  private async loadUtility(utilityId: number): Promise<Utility> {
    const utility = await this.utilityRepo.findOne({
      where: { id: utilityId, deleted: false },
      relations: { utilityType: true },
    });
    if (!utility) throw new BadRequestException('Utenza non trovata');
    return utility;
  }

  private async validate(utility: Utility, candidate: ConsumptionRecord): Promise<void> {
    if (utility.utilityType?.hard_type === HardTypeEnum.INTERNET) {
      throw new BadRequestException('Le utenze Internet non hanno consumi.');
    }
    const others = await this.repo.find({ where: { utility_id_fk: utility.id, deleted: false } });
    const error = validateConsumption(candidate, others, todayDay());
    if (error) throw new BadRequestException(error);
    if (candidate.kind === ConsumptionKind.READING) {
      const conflict = await findMeterConflict(this.utilityRepo, candidate.meter_number, utility.id);
      if (conflict) {
        throw new BadRequestException(
          `Matricola ${candidate.meter_number} già associata all'utenza ${conflict.utility_id}.`,
        );
      }
    }
  }

  // Matricola attuale = quella dell'ultima lettura; poi ricalcolo valori.
  private async afterChange(utility: Utility): Promise<void> {
    const records = await this.repo.find({ where: { utility_id_fk: utility.id, deleted: false } });
    const latest = sortedReadings(records).at(-1);
    if (latest && normalizeMeter(latest.meter_number) !== normalizeMeter(utility.meter_number)) {
      await this.utilityRepo.update(utility.id, { meter_number: latest.meter_number.trim() });
    }
    await this.recalc.recalcUtility(utility.id);
  }
}
```

Nota: `BaseService.remove` usa `this.findOne(id)` che fa `findOne({ where: { id }, relations })` sul repo — nel test di `remove` non coperto qui; il flusso reale è verificato end-to-end al Task 10.

- [ ] **Step 6: Verificare che passi**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/utility-consumptions/utility-consumptions.service.spec.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 7: Controller**

`backend/src/apis/utility-consumptions/utility-consumptions.controller.ts`:
```ts
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { Roles } from '@/core/auth/decorators/roles.decorator';
import { CurrentUser, ICurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { UtilityConsumptionsService, UtilityConsumptionRow, UtilityConsumptionSummary } from './utility-consumptions.service';
import { CreateUtilityConsumptionDto } from './dto/create-utility-consumption.dto';
import { UpdateUtilityConsumptionDto } from './dto/update-utility-consumption.dto';
import { UtilityConsumption } from './entity/utility-consumption.entity';

// Route annidate sotto utilities/:utilityId (lista/creazione/riepilogo) e
// dirette su utility-consumptions/:id (modifica/eliminazione).
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class UtilityConsumptionsController {
  constructor(private readonly service: UtilityConsumptionsService) {}

  @Get('utilities/:utilityId/consumptions')
  list(@Param('utilityId', ParseIntPipe) utilityId: number): Promise<UtilityConsumptionRow[]> {
    return this.service.findByUtility(utilityId);
  }

  @Get('utilities/:utilityId/consumption-summary')
  summary(@Param('utilityId', ParseIntPipe) utilityId: number): Promise<UtilityConsumptionSummary> {
    return this.service.getSummary(utilityId);
  }

  @Roles('Admin', 'Operatore')
  @Post('utilities/:utilityId/consumptions')
  create(
    @Param('utilityId', ParseIntPipe) utilityId: number,
    @Body() dto: CreateUtilityConsumptionDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<UtilityConsumption> {
    return this.service.createForUtility(utilityId, dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Patch('utility-consumptions/:id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUtilityConsumptionDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<UtilityConsumption> {
    return this.service.update(id, dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Delete('utility-consumptions/:id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ICurrentUser): Promise<void> {
    return this.service.remove(id, user.id);
  }
}
```

- [ ] **Step 8: Modulo con cron**

`backend/src/apis/utility-consumptions/utility-consumptions.module.ts`:
```ts
import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CronJob } from 'cron';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Utility } from '@apis/utility/entity/utility.entity';
import { UtilityConsumption } from './entity/utility-consumption.entity';
import { UtilityConsumptionsService } from './utility-consumptions.service';
import { UtilityConsumptionsController } from './utility-consumptions.controller';
import { ConsumptionRecalcService } from './consumption-recalc.service';

// Cron registrato qui (non @Cron nel service): @nestjs/schedule@12 è
// ESM-only e non caricabile dagli spec jest — stesso pattern di
// backup.module.ts. Ricalcolo notturno: la finestra 12 mesi scorre e le
// stime manuali scadono anche senza nuove rilevazioni.
@Module({
  imports: [TypeOrmModule.forFeature([UtilityConsumption, Utility])],
  providers: [UtilityConsumptionsService, ConsumptionRecalcService],
  controllers: [UtilityConsumptionsController],
  exports: [ConsumptionRecalcService],
})
export class UtilityConsumptionsModule implements OnModuleInit {
  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly recalc: ConsumptionRecalcService,
  ) {}

  onModuleInit() {
    const cronTime = process.env.CONSUMPTION_RECALC_CRON ?? '0 3 * * *';
    const job = new CronJob(cronTime, () => this.recalc.handleNightlyRecalc());
    this.schedulerRegistry.addCronJob('consumption-recalc', job);
    job.start();
  }
}
```

In `backend/src/app.module.ts` aggiungere accanto all'import di `UtilitiesModule`:
```ts
import { UtilityConsumptionsModule } from '@apis/utility-consumptions/utility-consumptions.module';
```
e `UtilityConsumptionsModule,` nell'array `imports` subito dopo `UtilitiesModule,`.

- [ ] **Step 9: Verificare build e avvio**

Run: `docker exec utenzepa-api-1 pnpm run type-check`
Expected: nessun errore.
Run: `docker logs --tail 40 utenzepa-api-1`
Expected: watcher ricompilato, `Mapped {/api/v1/utilities/:utilityId/consumptions, GET}` (e le altre 4 route) nei log, nessun errore.

- [ ] **Step 10: Commit**

```bash
git add backend/src/apis/utility/meter-number.helper.ts backend/src/apis/utility-consumptions/dto/create-utility-consumption.dto.ts backend/src/apis/utility-consumptions/dto/update-utility-consumption.dto.ts backend/src/apis/utility-consumptions/utility-consumptions.service.ts backend/src/apis/utility-consumptions/utility-consumptions.service.spec.ts backend/src/apis/utility-consumptions/utility-consumptions.controller.ts backend/src/apis/utility-consumptions/utility-consumptions.module.ts backend/src/app.module.ts
git commit -m "feat(consumi): API rilevazioni consumi e ricalcolo notturno"
```

---

### Task 5: Utenza — stima manuale, effettivo sola lettura, matricola univoca

**Files:**
- Modify: `backend/src/apis/utility/dto/create-utility.dto.ts` (rimuovere blocco `actual_consumption`, righe ~68-71)
- Modify: `backend/src/apis/utility/dto/update-utility.dto.ts` (rimuovere blocco `actual_consumption`, righe ~67-71)
- Modify: `backend/src/apis/utility/utility.service.ts` (costruttore, `create`, `update`)
- Modify: `backend/src/apis/utility/utility.module.ts`
- Test: `backend/src/apis/utility/utility.service.spec.ts`

**Interfaces:**
- Consumes: `findMeterConflict` (Task 4), `ConsumptionRecalcService.recalcUtility` (Task 3), `EstimateSource`.
- Produces: `UtilitiesService` costruttore `(repo, assetRepo, recalc: ConsumptionRecalcService)`.

- [ ] **Step 1: Test (fallisce)**

In `backend/src/apis/utility/utility.service.spec.ts`:
- nel `beforeEach`, aggiungere a `repo` le chiavi `update: jest.fn().mockResolvedValue(undefined)` e fare in modo che `createQueryBuilder` restituisca per il check matricola un qb con `getOne`: aggiungere a `qb` `getOne` già presente (default `null`) — il check usa `where/andWhere/getOne`, già mockati.
- creare `recalc = { recalcUtility: jest.fn().mockResolvedValue(undefined) }` e costruire `service = new UtilitiesService(repo as never, assetRepo as never, recalc as never);`
- aggiungere il blocco:

```ts
  describe('stima consumo e matricola', () => {
    const persisted = {
      id: 5,
      utility_id: 'IT005',
      meter_number: 'M5',
      estimated_annual_consumption: '1200.00',
      estimated_consumption_source: 'HISTORY',
      estimated_consumption_set_at: null,
      updated_by_user_id: 1,
    };

    beforeEach(() => {
      repo.findOne.mockResolvedValue({ ...persisted });
    });

    it('stima modificata > 0: diventa MANUAL con data', async () => {
      await service.update(5, { estimated_annual_consumption: 1500 } as never, 2);
      const saved = repo.save.mock.calls[0][0];
      expect(saved.estimated_consumption_source).toBe('MANUAL');
      expect(saved.estimated_consumption_set_at).toBeInstanceOf(Date);
      expect(recalc.recalcUtility).not.toHaveBeenCalled();
    });

    it('stima invariata (stringa decimal vs number): origine non toccata', async () => {
      await service.update(5, { estimated_annual_consumption: 1200, notes: 'x' } as never, 2);
      const saved = repo.save.mock.calls[0][0];
      expect(saved.estimated_consumption_source).toBe('HISTORY');
      expect(recalc.recalcUtility).not.toHaveBeenCalled();
    });

    it('stima azzerata: NONE e ricalcolo da storico', async () => {
      await service.update(5, { estimated_annual_consumption: 0 } as never, 2);
      const saved = repo.save.mock.calls[0][0];
      expect(saved.estimated_consumption_source).toBe('NONE');
      expect(saved.estimated_consumption_set_at).toBeNull();
      expect(recalc.recalcUtility).toHaveBeenCalledWith(5);
    });

    it('matricola cambiata già usata da altra utenza: 400 con codice utenza', async () => {
      qb.getOne.mockResolvedValueOnce({ id: 9, utility_id: 'IT009' });
      await expect(service.update(5, { meter_number: 'DUP' } as never, 2)).rejects.toThrow(/IT009/);
    });

    it('matricola invariata (spazi/maiuscole): nessun check (duplicati storici non bloccano)', async () => {
      await service.update(5, { meter_number: ' m5 ', notes: 'y' } as never, 2);
      expect(qb.andWhere).not.toHaveBeenCalledWith('LOWER(TRIM(u.meter_number)) = :meter', expect.anything());
    });

    it('create con stima > 0: MANUAL', async () => {
      assetRepo.count.mockResolvedValue(1);
      await service.create({ utility_id: 'N1', asset_ids: [1], estimated_annual_consumption: 300 } as never, 2);
      const created = repo.create.mock.calls[0][0];
      expect(created.estimated_consumption_source).toBe('MANUAL');
      expect(created.estimated_consumption_set_at).toBeInstanceOf(Date);
    });
  });
```
Nota: `update` ora chiama `repo.findOne` una volta in più (lettura stato corrente prima di `super.update`). Test `update` preesistenti che usano `repo.findOne.mockResolvedValueOnce(...)` una sola volta vanno portati a `mockResolvedValue(...)` (o a due `Once`), altrimenti la seconda chiamata riceve `undefined`.

- [ ] **Step 2: Verificare che fallisca**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/utility/utility.service.spec.ts --maxWorkers=2`
Expected: FAIL sui nuovi test (origine non impostata, nessun 400 matricola).

- [ ] **Step 3: DTO**

Rimuovere da `create-utility.dto.ts` e da `update-utility.dto.ts` l'intero blocco decoratori + proprietà `actual_consumption` (è calcolato, sola lettura; col `forbidNonWhitelisted` un client che lo invia riceve 400 — il frontend smette di inviarlo al Task 7).

- [ ] **Step 4: Service**

In `backend/src/apis/utility/utility.service.ts`:

Import aggiuntivi:
```ts
import { ConsumptionRecalcService } from '@apis/utility-consumptions/consumption-recalc.service';
import { EstimateSource } from '@apis/utility-consumptions/enum/estimate-source.enum';
import { findMeterConflict } from './meter-number.helper';
```

Costruttore:
```ts
  constructor(
    @InjectRepository(Utility)
    protected readonly repo: Repository<Utility>,
    @InjectRepository(Asset)
    private readonly assetRepo: Repository<Asset>,
    private readonly recalc: ConsumptionRecalcService,
  ) {
    super();
  }
```

Aggiungere i due helper privati (prima di `create`):
```ts
  // Stima annua inserita a mano: MANUAL con data (valida 12 mesi, poi la
  // sovrascrive lo storico); 0 = "nessuna stima manuale", torna a storico.
  private estimateFields(value: number): Pick<Utility, 'estimated_consumption_source' | 'estimated_consumption_set_at'> {
    return value > 0
      ? { estimated_consumption_source: EstimateSource.MANUAL, estimated_consumption_set_at: new Date() }
      : { estimated_consumption_source: EstimateSource.NONE, estimated_consumption_set_at: null };
  }

  private async assertMeterAvailable(meterNumber: string | null | undefined, utilityId: number | null): Promise<void> {
    const conflict = await findMeterConflict(this.repo, meterNumber, utilityId);
    if (conflict) {
      throw new BadRequestException(
        `Numero contatore ${meterNumber.trim()} già associato all'utenza ${conflict.utility_id}.`,
      );
    }
  }
```

In `create`, subito dopo `const { asset_ids, ...rest } = dto;`:
```ts
    await this.assertMeterAvailable(rest.meter_number, null);
    const estimate = Number(rest.estimated_annual_consumption ?? 0);
```
e nel `this.repo.create({...})` aggiungere `...(estimate > 0 ? this.estimateFields(estimate) : {}),` dopo `...rest,`.

`update` sostituito da:
```ts
  async update(id: number, dto: UpdateUtilityDto, userId?: number): Promise<Utility> {
    const { asset_ids, ...rest } = dto;
    const assets = asset_ids !== undefined ? await this.resolveAssets(asset_ids) : undefined;

    const current = await this.repo.findOne({ where: { id } as never });
    if (!current) throw new BadRequestException('Utenza non trovata');

    const normalizeMeter = (m?: string | null) => (m ?? '').trim().toLowerCase();
    if (rest.meter_number !== undefined && normalizeMeter(rest.meter_number) !== normalizeMeter(current.meter_number)) {
      await this.assertMeterAvailable(rest.meter_number, id);
    }

    // Confronto numerico: il valore persistito è una stringa decimal
    // ("1200.00"), il form manda un number — senza Number() ogni salvataggio
    // del dialog marcherebbe la stima come manuale.
    let estimateReset = false;
    const payload: Record<string, unknown> = { ...rest };
    if (
      rest.estimated_annual_consumption !== undefined &&
      rest.estimated_annual_consumption !== null &&
      Number(rest.estimated_annual_consumption) !== Number(current.estimated_annual_consumption)
    ) {
      const value = Number(rest.estimated_annual_consumption);
      Object.assign(payload, this.estimateFields(value));
      estimateReset = value === 0;
    }

    await super.update(id, payload as UpdateUtilityDto, userId);

    if (estimateReset) {
      await this.recalc.recalcUtility(id);
    }

    if (assets !== undefined) {
      // repo.findOne diretto (non this.findOne, che proietta i campi del
      // contratto corrente — vedi remove()).
      const entity = await this.repo.findOne({ where: { id } as never, relations: { assets: true } });
      const before = [...(entity.assets ?? [])];
      entity.assets = assets;
      await this.repo.save(entity);
      // asset_ids esce dal DTO prima di super.update, quindi BaseService non
      // lo vede nel diff: audit esplicito del cambio immobili collegati.
      await this.recordAssetsChange(id, before, assets, userId ?? entity.updated_by_user_id);
    }

    return this.findOne(id);
  }
```

- [ ] **Step 5: Modulo**

`backend/src/apis/utility/utility.module.ts`: aggiungere `UtilityConsumptionsModule` agli `imports`:
```ts
import { UtilityConsumptionsModule } from '@apis/utility-consumptions/utility-consumptions.module';
...
  imports: [TypeOrmModule.forFeature([Utility, Contract, Asset]), UtilityConsumptionsModule],
```
(`UtilityConsumptionsModule` non importa `UtilitiesModule`: nessun ciclo.)

- [ ] **Step 6: Verificare test e type-check**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/utility/utility.service.spec.ts --maxWorkers=2`
Expected: PASS (vecchi e nuovi test).
Run: `docker exec utenzepa-api-1 pnpm run type-check`
Expected: nessun errore (se `data-importer.service.ts` usa `actual_consumption` in un DTO tipizzato, verificare: lì è su entity/repo diretto, non sul DTO — nessuna modifica attesa).

- [ ] **Step 7: Commit**

```bash
git add backend/src/apis/utility/dto/create-utility.dto.ts backend/src/apis/utility/dto/update-utility.dto.ts backend/src/apis/utility/utility.service.ts backend/src/apis/utility/utility.service.spec.ts backend/src/apis/utility/utility.module.ts
git commit -m "feat(consumi): stima manuale con scadenza e matricola univoca su utenza"
```

---

### Task 6: Riepilogo consumi per capitolo

**Files:**
- Modify: `backend/src/apis/budget-chapters/budget-chapters.service.ts`
- Modify: `backend/src/apis/budget-chapters/budget-chapters.controller.ts`
- Modify: `backend/src/apis/budget-chapters/budget-chapters.module.ts`
- Test: `backend/src/apis/budget-chapters/budget-chapters.service.spec.ts`

**Interfaces:**
- Consumes: `CONSUMPTION_UNIT` (Task 1).
- Produces: `GET /budget-chapters/:id/consumption-summary` → `ChapterConsumptionSummaryRow[]` = `{ hard_type: HardTypeEnum; unit: string | null; utilities_count: number; estimated_sum: number; actual_sum: number }[]`; `BudgetChaptersService.getConsumptionSummary(chapterId: number)`; costruttore `(repo, utilityRepo: Repository<Utility>)`.

- [ ] **Step 1: Leggere lo spec esistente**

Leggere `backend/src/apis/budget-chapters/budget-chapters.service.spec.ts` per vedere come costruisce il service (`new BudgetChaptersService(repo as never)` o `Test.createTestingModule`). Aggiornare la costruzione passando anche `utilityRepo` come secondo argomento (o provider `getRepositoryToken(Utility)` se usa il testing module).

- [ ] **Step 2: Test (fallisce)**

Aggiungere allo spec:
```ts
  describe('getConsumptionSummary', () => {
    it('raggruppa per tipo con unità e converte i SUM stringa', async () => {
      const summaryQb = {
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { hard_type: 'LIGHT', utilities_count: '3', estimated_sum: '1200.50', actual_sum: '900.00' },
          { hard_type: 'GAS', utilities_count: '1', estimated_sum: null, actual_sum: '0.00' },
        ]),
      };
      utilityRepo.createQueryBuilder.mockReturnValue(summaryQb);

      await expect(service.getConsumptionSummary(4)).resolves.toEqual([
        { hard_type: 'LIGHT', unit: 'kWh', utilities_count: 3, estimated_sum: 1200.5, actual_sum: 900 },
        { hard_type: 'GAS', unit: 'Smc', utilities_count: 1, estimated_sum: 0, actual_sum: 0 },
      ]);
      expect(summaryQb.andWhere).toHaveBeenCalledWith('u.budget_chapter_code_fk = :chapterId', { chapterId: 4 });
      expect(summaryQb.andWhere).toHaveBeenCalledWith('ut.hard_type <> :internet', { internet: 'INTERNET' });
    });
  });
```
con `utilityRepo = { createQueryBuilder: jest.fn() }` dichiarato e creato nel `beforeEach` dello spec.

- [ ] **Step 3: Verificare che fallisca**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/budget-chapters/budget-chapters.service.spec.ts --maxWorkers=2`
Expected: FAIL — `service.getConsumptionSummary is not a function`.

- [ ] **Step 4: Implementare**

`budget-chapters.service.ts` — import:
```ts
import { Utility } from '@apis/utility/entity/utility.entity';
import { HardTypeEnum } from '@apis/utility-types/enum/hard-type.enum';
import { CONSUMPTION_UNIT } from '@apis/utility-consumptions/consumption-unit';
```
interfaccia esportata:
```ts
export interface ChapterConsumptionSummaryRow {
  hard_type: HardTypeEnum;
  unit: string | null;
  utilities_count: number;
  estimated_sum: number;
  actual_sum: number;
}
```
costruttore: aggiungere
```ts
    @InjectRepository(Utility)
    private readonly utilityRepo: Repository<Utility>,
```
metodo:
```ts
  // Totali presunto/effettivo 12 mesi delle utenze del capitolo, uno per
  // tipo (unità diverse non si sommano: un capitolo SPRAR può contenere
  // luce, gas e acqua). SUM sui valori già persistiti dal ricalcolo.
  async getConsumptionSummary(chapterId: number): Promise<ChapterConsumptionSummaryRow[]> {
    const rows: { hard_type: HardTypeEnum; utilities_count: string; estimated_sum: string | null; actual_sum: string | null }[] =
      await this.utilityRepo
        .createQueryBuilder('u')
        .innerJoin('u.utilityType', 'ut')
        .select('ut.hard_type', 'hard_type')
        .addSelect('COUNT(u.id)', 'utilities_count')
        .addSelect('SUM(u.estimated_annual_consumption)', 'estimated_sum')
        .addSelect('SUM(u.actual_consumption)', 'actual_sum')
        .where('u.deleted = 0')
        .andWhere('u.budget_chapter_code_fk = :chapterId', { chapterId })
        .andWhere('ut.hard_type <> :internet', { internet: HardTypeEnum.INTERNET })
        .groupBy('ut.hard_type')
        .orderBy('ut.hard_type', 'ASC')
        .getRawMany();

    return rows.map((r) => ({
      hard_type: r.hard_type,
      unit: CONSUMPTION_UNIT[r.hard_type] ?? null,
      utilities_count: Number(r.utilities_count),
      estimated_sum: Number(r.estimated_sum ?? 0),
      actual_sum: Number(r.actual_sum ?? 0),
    }));
  }
```

`budget-chapters.controller.ts` — import `ParseIntPipe`, `ChapterConsumptionSummaryRow` e aggiungere **prima** di eventuali route `:id` generiche:
```ts
  @Get(':id/consumption-summary')
  consumptionSummary(@Param('id', ParseIntPipe) id: number): Promise<ChapterConsumptionSummaryRow[]> {
    return this.service.getConsumptionSummary(id);
  }
```

`budget-chapters.module.ts`:
```ts
import { Utility } from '@apis/utility/entity/utility.entity';
...
  imports: [TypeOrmModule.forFeature([BudgetChapter, Utility])],
```

- [ ] **Step 5: Verificare**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/budget-chapters/budget-chapters.service.spec.ts --maxWorkers=2`
Expected: PASS.
Run: `docker exec utenzepa-api-1 pnpm run type-check`
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add backend/src/apis/budget-chapters/budget-chapters.service.ts backend/src/apis/budget-chapters/budget-chapters.service.spec.ts backend/src/apis/budget-chapters/budget-chapters.controller.ts backend/src/apis/budget-chapters/budget-chapters.module.ts
git commit -m "feat(consumi): riepilogo consumi per capitolo di spesa"
```

---

### Task 7: Frontend — modelli, service, selezione capitolo

**Files:**
- Create: `frontend/src/app/pages/utilities/consumptions/consumption.model.ts`
- Create: `frontend/src/app/pages/utilities/consumptions/utility-consumption.service.ts`
- Modify: `frontend/src/app/core/types/option.interface.ts`
- Modify: `frontend/src/app/core/components/filterable-select.component.ts`
- Modify: `frontend/src/app/pages/utilities/entity/utility.entity.ts`
- Modify: `frontend/src/app/pages/utilities/utility.service.ts`
- Modify: `frontend/src/app/pages/utilities/utility-edit-dialog.component.ts`, `.html`

**Interfaces:**
- Consumes: API Task 4/6.
- Produces:
  - `consumption.model.ts`: tipi `ConsumptionKind`, `EstimateSource`, `UtilityConsumption`, `ConsumptionPayload`, `MonthlyPoint`, `ConsumptionSummary`, `ChapterConsumptionSummaryRow`; funzioni `formatQty(value, unit?)`, `formatDateIt(iso)`, `toIsoDate(d: Date)`, costanti `CONSUMPTION_UNIT_BY_HARD_TYPE`
  - `UtilityConsumptionService`: `list(utilityId)`, `summary(utilityId)`, `create(utilityId, payload)`, `update(id, payload)`, `delete(id)`, `chapterSummary(chapterId)` (tutti `Observable`)
  - `TOption` con `sublabel?: string; searchText?: string`
  - `Utility` (frontend) con `actual_consumption_coverage_days?`, `estimated_consumption_source?`, `estimated_consumption_set_at?` esclusi in scrittura

- [ ] **Step 1: Modelli**

`frontend/src/app/pages/utilities/consumptions/consumption.model.ts`:
```ts
import {HardType} from '../../utility-types/enum/hard-type.enum';

export type ConsumptionKind = 'READING' | 'PERIOD';
export type EstimateSource = 'MANUAL' | 'HISTORY' | 'NONE';

export interface UtilityConsumption {
  id: number;
  utility_id_fk: number;
  kind: ConsumptionKind;
  reading_date: string | null;
  reading_value: number | null;
  meter_number: string | null;
  period_start: string | null;
  period_end: string | null;
  consumption: number | null;
  source: 'MANUAL' | 'INVOICE' | 'IMPORT' | 'API';
  notes: string | null;
  computed_consumption: number | null;
}

export interface ConsumptionPayload {
  kind: ConsumptionKind;
  reading_date: string | null;
  reading_value: number | null;
  meter_number: string | null;
  period_start: string | null;
  period_end: string | null;
  consumption: number | null;
  notes: string | null;
}

export interface MonthlyPoint {
  month: string;
  actual: number;
  covered_days: number;
  days: number;
  estimated: number;
}

export interface ConsumptionSummary {
  unit: string | null;
  actual_consumption: number;
  coverage_days: number;
  estimated_annual_consumption: number;
  estimated_source: EstimateSource;
  estimated_valid_until: string | null;
  monthly: MonthlyPoint[];
}

export interface ChapterConsumptionSummaryRow {
  hard_type: HardType;
  unit: string | null;
  utilities_count: number;
  estimated_sum: number;
  actual_sum: number;
}

export const CONSUMPTION_UNIT_BY_HARD_TYPE: Record<HardType, string | null> = {
  [HardType.LIGHT]: 'kWh',
  [HardType.GAS]: 'Smc',
  [HardType.WATER]: 'm³',
  [HardType.INTERNET]: null,
};

// Nessun LOCALE_ID registrato nell'app: formattazione italiana esplicita.
export function formatQty(value: number | null | undefined, unit?: string | null): string {
  if (value === null || value === undefined) return '—';
  const text = Number(value).toLocaleString('it-IT', {maximumFractionDigits: 2});
  return unit ? `${text} ${unit}` : text;
}

export function formatDateIt(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

// Data locale (non UTC): un Date del datepicker a mezzanotte locale con
// toISOString() slitterebbe al giorno prima.
export function toIsoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
```

- [ ] **Step 2: Service**

`frontend/src/app/pages/utilities/consumptions/utility-consumption.service.ts`:
```ts
import {inject, Injectable} from '@angular/core';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import {Observable} from 'rxjs';
import {environment} from '../../../../environments/environment';
import {AuthService} from '../../../services/auth.service';
import {ChapterConsumptionSummaryRow, ConsumptionPayload, ConsumptionSummary, UtilityConsumption} from './consumption.model';

// Non estende AbstractService (route annidate): header Authorization messo
// a mano, nessun interceptor lo aggiunge (vedi CLAUDE.md, bug BrandingService).
@Injectable({providedIn: 'root'})
export class UtilityConsumptionService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private readonly api = environment.apiUrl;

  private headers(): HttpHeaders {
    return new HttpHeaders({Authorization: `Bearer ${this.auth.getToken() || ''}`});
  }

  list(utilityId: number): Observable<UtilityConsumption[]> {
    return this.http.get<UtilityConsumption[]>(`${this.api}/utilities/${utilityId}/consumptions`, {headers: this.headers()});
  }

  summary(utilityId: number): Observable<ConsumptionSummary> {
    return this.http.get<ConsumptionSummary>(`${this.api}/utilities/${utilityId}/consumption-summary`, {headers: this.headers()});
  }

  create(utilityId: number, payload: ConsumptionPayload): Observable<UtilityConsumption> {
    return this.http.post<UtilityConsumption>(`${this.api}/utilities/${utilityId}/consumptions`, payload, {headers: this.headers()});
  }

  update(id: number, payload: ConsumptionPayload): Observable<UtilityConsumption> {
    return this.http.patch<UtilityConsumption>(`${this.api}/utility-consumptions/${id}`, payload, {headers: this.headers()});
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/utility-consumptions/${id}`, {headers: this.headers()});
  }

  chapterSummary(chapterId: number): Observable<ChapterConsumptionSummaryRow[]> {
    return this.http.get<ChapterConsumptionSummaryRow[]>(`${this.api}/budget-chapters/${chapterId}/consumption-summary`, {headers: this.headers()});
  }
}
```

- [ ] **Step 3: TOption e FilterableSelect**

`frontend/src/app/core/types/option.interface.ts`:
```ts
// icon/count opzionali: usati solo da FilterableSelectComponent quando
// presenti (es. icona per-aggregato immobile, conteggio elementi) — nessun
// impatto sugli altri usi di TOption che non li valorizzano.
// sublabel: seconda riga piccola sotto la label nell'opzione.
// searchText: testo su cui filtrare (default label), es. per includere il PDC.
export type TOption = {
  label: string,
  value: string|number|boolean,
  icon?: string,
  count?: number,
  sublabel?: string,
  searchText?: string,
};
```

In `filterable-select.component.ts`, template della `mat-option` sostituito da (contenuto sempre in uno `<span>` interno, host intatto):
```html
          <mat-option [value]="opt">
            <span style="display: inline-flex; flex-direction: column; line-height: 1.25; padding: 2px 0;">
              <span style="display: inline-flex; align-items: center; gap: 8px;">
                @if (opt.icon) {
                  <mat-icon style="font-size: 20px; height: 20px; width: 20px; vertical-align: middle;">{{ opt.icon }}</mat-icon>
                }
                <span>{{ opt.label }}</span>
                @if (opt.count != null) {
                  <span style="color: #757575; font-size: 0.85em;">({{ opt.count }})</span>
                }
              </span>
              @if (opt.sublabel) {
                <span style="color: #757575; font-size: 0.8em;">{{ opt.sublabel }}</span>
              }
            </span>
          </mat-option>
```
e nel costruttore la riga del filtro:
```ts
      this.filteredOptions = this._options.filter(o => (o.searchText ?? o.label).toLowerCase().includes(term));
```

- [ ] **Step 4: Entity e service utenze**

`frontend/src/app/pages/utilities/entity/utility.entity.ts` — sostituire `actual_consumption?: number;` con:
```ts
  // Calcolati dal backend (storico consumi): mai inviati in scrittura,
  // il DTO backend li rifiuterebbe (forbidNonWhitelisted).
  @Exclude({toPlainOnly: true})
  actual_consumption?: number;
  @Exclude({toPlainOnly: true})
  actual_consumption_coverage_days?: number;
  @Exclude({toPlainOnly: true})
  estimated_consumption_source?: 'MANUAL' | 'HISTORY' | 'NONE';
  @Exclude({toPlainOnly: true})
  estimated_consumption_set_at?: string | null;
```

`frontend/src/app/pages/utilities/utility.service.ts` — nel tipo `filters` di `search()` aggiungere `budget_chapter_code_fk?: number;`.

- [ ] **Step 5: Dialog utenza — capitolo + effettivo sola lettura**

In `utility-edit-dialog.component.ts`:
- import:
```ts
import {BudgetChapter} from '../budget-chapters/entity/budget-chapter.entity';
import {SupplyType, SupplyTypeDescription} from '../budget-chapters/enum/supply-type.enum';
import {formatQty, CONSUMPTION_UNIT_BY_HARD_TYPE} from './consumptions/consumption.model';
```
- costante sopra la classe:
```ts
// Tipi fornitura capitolo compatibili col tipo utenza; SPRAR sempre
// compatibile (capitolo multi-utenza). Solo ordinamento, nessun blocco.
const CHAPTER_COMPATIBILITY: Record<HardType, SupplyType[]> = {
  [HardType.LIGHT]: [SupplyType.ELECTRICITY],
  [HardType.GAS]: [SupplyType.GAS_SUPPLY_ONLY, SupplyType.THERMAL_MANAGEMENT],
  [HardType.WATER]: [SupplyType.WATER],
  [HardType.INTERNET]: [],
};
```
- campi: `private budgetChapters: BudgetChapter[] = [];` e `readonly formatQty = formatQty;`
- nel `form`: **rimuovere** la riga `actual_consumption: [...]`.
- `ngOnInit`, subscribe capitoli:
```ts
    this.budgetChapterService.search({deleted: false}).subscribe({
      next: data => {
        this.budgetChapters = data;
        this.buildBudgetChapterOptions();
      },
      error: err => console.error('Errore nel caricamento dei Capitoli di Spesa:', err)
    });
```
- `onUtilityTypeChange`: dopo l'assegnazione di `selectedHardType` aggiungere `this.buildBudgetChapterOptions();`
- metodi:
```ts
  private buildBudgetChapterOptions(): void {
    const compatible = (c: BudgetChapter) =>
      this.selectedHardType === null ||
      c.supply_type === SupplyType.SPRAR_UTILITIES ||
      CHAPTER_COMPATIBILITY[this.selectedHardType].includes(c.supply_type);
    const label = (c: BudgetChapter) => `${c.chapter_code}/${c.article ?? 0} — ${c.description ?? ''}`.trim();
    this.budgetChapterOptions = [...this.budgetChapters]
      .sort((a, b) => Number(compatible(b)) - Number(compatible(a)) || label(a).localeCompare(label(b)))
      .map(c => {
        const parts = [
          c.pdc ? `PDC ${c.pdc}` : null,
          SupplyTypeDescription[c.supply_type] ?? null,
          compatible(c) ? null : 'tipo fornitura diverso dall’utenza',
        ].filter(Boolean);
        return {
          label: label(c),
          value: c.id,
          sublabel: parts.join(' · '),
          searchText: `${label(c)} ${c.pdc ?? ''}`,
        };
      });
  }

  get consumptionUnit(): string | null {
    return this.selectedHardType ? CONSUMPTION_UNIT_BY_HARD_TYPE[this.selectedHardType] : null;
  }

  estimateHint(): string {
    switch (this.data.item.estimated_consumption_source) {
      case 'MANUAL': {
        const setAt = this.data.item.estimated_consumption_set_at;
        if (!setAt) return 'Inserita manualmente';
        const until = new Date(setAt);
        until.setMonth(until.getMonth() + 12);
        return until > new Date()
          ? `Manuale, valida fino al ${until.toLocaleDateString('it-IT')}`
          : 'Manuale scaduta: verrà sostituita dallo storico consumi';
      }
      case 'HISTORY': return 'Calcolata dallo storico consumi';
      default: return 'Metti 0 per calcolarla dallo storico consumi';
    }
  }
```

In `utility-edit-dialog.component.html`, sostituire il `mat-form-field` "Capitolo di Spesa" (righe ~245-255) con:
```html
        <div style="flex: 1 1 100%;">
          <app-filterable-select
            label="Capitolo di Spesa *"
            placeholder="Cerca per codice, descrizione o PDC..."
            [options]="budgetChapterOptions"
            formControlName="budget_chapter_code_fk"
            [errorMessage]="form.controls.budget_chapter_code_fk.invalid && form.controls.budget_chapter_code_fk.touched ? 'Obbligatorio' : null">
          </app-filterable-select>
        </div>
```
Al campo "Consumo annuo presunto" aggiungere dentro il `mat-form-field`, dopo l'`input`:
```html
          <mat-hint>{{ estimateHint() }}</mat-hint>
```
Sostituire il `mat-form-field` di `actual_consumption` (righe ~273-279) con:
```html
        <mat-form-field style="flex: 1 1 21%;">
          <mat-label>Consumo effettivo (12 mesi)</mat-label>
          <input matInput disabled [value]="formatQty(data.item.actual_consumption, consumptionUnit)">
          <mat-hint>Da storico consumi · dati su {{ data.item.actual_consumption_coverage_days ?? 0 }}/365 giorni</mat-hint>
        </mat-form-field>
```

- [ ] **Step 6: Build**

Run: `docker exec utenzepa-frontend-1 pnpm run build`
Expected: build OK, nessun errore di template.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/pages/utilities/consumptions/consumption.model.ts frontend/src/app/pages/utilities/consumptions/utility-consumption.service.ts frontend/src/app/core/types/option.interface.ts frontend/src/app/core/components/filterable-select.component.ts frontend/src/app/pages/utilities/entity/utility.entity.ts frontend/src/app/pages/utilities/utility.service.ts frontend/src/app/pages/utilities/utility-edit-dialog.component.ts frontend/src/app/pages/utilities/utility-edit-dialog.component.html
git commit -m "feat(consumi): selezione capitolo leggibile e consumo effettivo sola lettura"
```

---

### Task 8: Frontend — tab Consumi nel dialog utenza

**Files:**
- Create: `frontend/src/app/pages/utilities/consumptions/consumption-chart.component.ts`
- Create: `frontend/src/app/pages/utilities/consumptions/consumption-edit-dialog.component.ts`
- Create: `frontend/src/app/pages/utilities/consumptions/utility-consumptions-tab.component.ts`
- Modify: `frontend/src/app/pages/utilities/utility-edit-dialog.component.ts`, `.html`

**Interfaces:**
- Consumes: Task 7.
- Produces:
  - `<app-consumption-chart [points]="MonthlyPoint[]" [unit]="string|null">`
  - `ConsumptionEditDialogComponent` data `{utilityId: number; meterNumber: string | null; item?: UtilityConsumption}`, chiude con `true` se salvato
  - `<app-utility-consumptions-tab [utilityId] [meterNumber] (summaryChanged)="ConsumptionSummary">`

- [ ] **Step 1: Grafico SVG**

`frontend/src/app/pages/utilities/consumptions/consumption-chart.component.ts`:
```ts
import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {formatQty, MonthlyPoint} from './consumption.model';

const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const BAR_STEP = 20;
const CHART_HEIGHT = 160;
const BASELINE = 175;

interface Bar {
  x: number;
  actualY: number;
  actualH: number;
  estimatedY: number;
  estimatedH: number;
  partial: boolean;
  label: string | null;
  title: string;
}

// Barre mensili: reale piena (più chiara se il mese è coperto solo in
// parte), stimata tratteggiata sopra. SVG inline, nessuna libreria grafici.
@Component({
  selector: 'app-consumption-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @if (hasData) {
      <svg [attr.viewBox]="'0 0 ' + width + ' 200'" style="width: 100%; height: 220px;" role="img" aria-label="Consumi mensili">
        <line x1="0" [attr.x2]="width" y1="175" y2="175" stroke="#d1d5db" />
        @for (bar of bars; track $index) {
          <g>
            <title>{{ bar.title }}</title>
            @if (bar.actualH > 0) {
              <rect [attr.x]="bar.x" [attr.y]="bar.actualY" width="14" [attr.height]="bar.actualH"
                    fill="#1976d2" [attr.fill-opacity]="bar.partial ? 0.45 : 1" />
            }
            @if (bar.estimatedH > 0) {
              <rect [attr.x]="bar.x" [attr.y]="bar.estimatedY" width="14" [attr.height]="bar.estimatedH"
                    fill="rgba(25,118,210,0.12)" stroke="#1976d2" stroke-dasharray="3 2" />
            }
            <rect [attr.x]="bar.x - 3" y="0" width="20" height="176" fill="transparent" />
            @if (bar.label) {
              <text [attr.x]="bar.x + 7" y="192" text-anchor="middle" font-size="10" fill="#6b7280">{{ bar.label }}</text>
            }
          </g>
        }
      </svg>
      <div style="display: flex; gap: 1.5rem; font-size: 0.8rem; color: #6b7280;">
        <span><span style="display:inline-block; width:10px; height:10px; background:#1976d2;"></span> Reale</span>
        <span><span style="display:inline-block; width:10px; height:10px; background:#1976d2; opacity:0.45;"></span> Reale, mese coperto in parte</span>
        <span><span style="display:inline-block; width:10px; height:10px; border:1px dashed #1976d2;"></span> Stimato</span>
      </div>
    } @else {
      <p style="color: #6b7280;">Nessun consumo da mostrare.</p>
    }
  `,
})
export class ConsumptionChartComponent {
  @Input() unit: string | null = null;

  bars: Bar[] = [];
  hasData = false;
  width = 0;

  @Input()
  set points(value: MonthlyPoint[]) {
    const points = value ?? [];
    this.width = points.length * BAR_STEP;
    const max = Math.max(0, ...points.map(p => p.actual + p.estimated));
    this.hasData = max > 0;
    const scale = (v: number) => (max > 0 ? (v / max) * CHART_HEIGHT : 0);
    this.bars = points.map((p, i) => {
      const actualH = scale(p.actual);
      const estimatedH = scale(p.estimated);
      const [year, month] = p.month.split('-').map(Number);
      const monthName = MONTHS[month - 1];
      return {
        x: i * BAR_STEP + 3,
        actualY: BASELINE - actualH,
        actualH,
        estimatedY: BASELINE - actualH - estimatedH,
        estimatedH,
        partial: p.estimated === 0 && p.covered_days > 0 && p.covered_days < p.days,
        label: month === 1 || i === 0 ? `${monthName} ${String(year).slice(2)}` : (i % 3 === 0 ? monthName : null),
        title: `${monthName} ${year} — reale ${formatQty(p.actual, this.unit)} (${p.covered_days}/${p.days} gg)` +
          (p.estimated > 0 ? `, stimato ${formatQty(p.estimated, this.unit)}` : ''),
      };
    });
  }
}
```

- [ ] **Step 2: Dialog rilevazione**

`frontend/src/app/pages/utilities/consumptions/consumption-edit-dialog.component.ts`:
```ts
import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {HttpErrorResponse} from '@angular/common/http';
import {ConsumptionKind, ConsumptionPayload, toIsoDate, UtilityConsumption} from './consumption.model';
import {UtilityConsumptionService} from './utility-consumption.service';

export interface ConsumptionEditDialogData {
  utilityId: number;
  meterNumber: string | null;
  item?: UtilityConsumption;
}

// Salva da sé (non delega al chiamante) per mostrare inline gli errori di
// validazione del backend (lettura decrescente, periodo sovrapposto, ...).
@Component({
  selector: 'app-consumption-edit-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule,
    MatButtonToggleModule, MatDatepickerModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h2 mat-dialog-title>{{ data.item ? 'Modifica rilevazione' : 'Nuova rilevazione' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" style="display: flex; flex-direction: column; gap: 0.5rem; padding-top: 0.5rem;">
        <mat-button-toggle-group formControlName="kind" aria-label="Tipo rilevazione" style="align-self: flex-start; margin-bottom: 0.5rem;">
          <mat-button-toggle value="READING">Lettura contatore</mat-button-toggle>
          <mat-button-toggle value="PERIOD">Consumo periodo</mat-button-toggle>
        </mat-button-toggle-group>

        @if (form.controls.kind.value === 'READING') {
          <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
            <mat-form-field style="flex: 1 1 30%;">
              <mat-label>Data lettura *</mat-label>
              <input matInput [matDatepicker]="readingPicker" formControlName="reading_date" [max]="today">
              <mat-datepicker-toggle matIconSuffix [for]="readingPicker"></mat-datepicker-toggle>
              <mat-datepicker #readingPicker></mat-datepicker>
            </mat-form-field>
            <mat-form-field style="flex: 1 1 30%;">
              <mat-label>Valore contatore *</mat-label>
              <input matInput type="number" min="0" formControlName="reading_value">
            </mat-form-field>
            <mat-form-field style="flex: 1 1 30%;">
              <mat-label>Matricola contatore *</mat-label>
              <input matInput formControlName="meter_number">
              <mat-hint>Matricola diversa = nuovo contatore</mat-hint>
            </mat-form-field>
          </div>
        } @else {
          <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
            <mat-form-field style="flex: 1 1 30%;">
              <mat-label>Dal *</mat-label>
              <input matInput [matDatepicker]="startPicker" formControlName="period_start" [max]="today">
              <mat-datepicker-toggle matIconSuffix [for]="startPicker"></mat-datepicker-toggle>
              <mat-datepicker #startPicker></mat-datepicker>
            </mat-form-field>
            <mat-form-field style="flex: 1 1 30%;">
              <mat-label>Al *</mat-label>
              <input matInput [matDatepicker]="endPicker" formControlName="period_end" [max]="today">
              <mat-datepicker-toggle matIconSuffix [for]="endPicker"></mat-datepicker-toggle>
              <mat-datepicker #endPicker></mat-datepicker>
            </mat-form-field>
            <mat-form-field style="flex: 1 1 30%;">
              <mat-label>Consumo *</mat-label>
              <input matInput type="number" min="0" formControlName="consumption">
            </mat-form-field>
          </div>
        }

        <mat-form-field>
          <mat-label>Note</mat-label>
          <textarea matInput rows="2" formControlName="notes"></textarea>
        </mat-form-field>

        @if (error) {
          <p style="color: #b91c1c; margin: 0;">{{ error }}</p>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button (click)="dialogRef.close(false)">Annulla</button>
      <button mat-flat-button (click)="save()" [disabled]="!isValid() || saving">Salva</button>
    </mat-dialog-actions>
  `,
})
export class ConsumptionEditDialogComponent {
  private fb = inject(FormBuilder);
  private service = inject(UtilityConsumptionService);
  protected dialogRef = inject(MatDialogRef<ConsumptionEditDialogComponent, boolean>);
  protected data = inject<ConsumptionEditDialogData>(MAT_DIALOG_DATA);

  readonly today = new Date();
  error: string | null = null;
  saving = false;

  private toDate(iso: string | null | undefined): Date | null {
    if (!iso) return null;
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  form = this.fb.group({
    kind: [(this.data.item?.kind ?? 'READING') as ConsumptionKind, Validators.required],
    reading_date: [this.toDate(this.data.item?.reading_date) ?? (this.data.item ? null : new Date())],
    reading_value: [this.data.item?.reading_value ?? null as number | null],
    meter_number: [this.data.item?.meter_number ?? this.data.meterNumber ?? ''],
    period_start: [this.toDate(this.data.item?.period_start)],
    period_end: [this.toDate(this.data.item?.period_end)],
    consumption: [this.data.item?.consumption ?? null as number | null],
    notes: [this.data.item?.notes ?? ''],
  });

  isValid(): boolean {
    const v = this.form.getRawValue();
    if (v.kind === 'READING') {
      return !!v.reading_date && v.reading_value !== null && v.reading_value >= 0 && !!v.meter_number?.trim();
    }
    return !!v.period_start && !!v.period_end && v.consumption !== null && v.consumption >= 0;
  }

  save(): void {
    if (!this.isValid()) return;
    const v = this.form.getRawValue();
    const isReading = v.kind === 'READING';
    const payload: ConsumptionPayload = {
      kind: v.kind as ConsumptionKind,
      reading_date: isReading && v.reading_date ? toIsoDate(v.reading_date) : null,
      reading_value: isReading ? Number(v.reading_value) : null,
      meter_number: isReading ? (v.meter_number ?? '').trim() : null,
      period_start: !isReading && v.period_start ? toIsoDate(v.period_start) : null,
      period_end: !isReading && v.period_end ? toIsoDate(v.period_end) : null,
      consumption: !isReading ? Number(v.consumption) : null,
      notes: v.notes?.trim() ? v.notes.trim() : null,
    };
    this.saving = true;
    this.error = null;
    const request = this.data.item
      ? this.service.update(this.data.item.id, payload)
      : this.service.create(this.data.utilityId, payload);
    request.subscribe({
      next: () => this.dialogRef.close(true),
      error: (err: HttpErrorResponse) => {
        this.saving = false;
        const message = err.error?.message;
        this.error = Array.isArray(message) ? message.join(' ') : (message ?? 'Errore durante il salvataggio.');
      },
    });
  }
}
```

- [ ] **Step 3: Componente tab**

`frontend/src/app/pages/utilities/consumptions/utility-consumptions-tab.component.ts`:
```ts
import {ChangeDetectionStrategy, Component, EventEmitter, inject, Input, OnInit, Output} from '@angular/core';
import {MatDialog} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {HasRoleDirective} from '../../../core/directives/has-role.directive';
import {ConfirmDialogComponent, ConfirmDialogData} from '../../../core/components/confirm-dialog.component';
import {ConsumptionChartComponent} from './consumption-chart.component';
import {ConsumptionEditDialogComponent, ConsumptionEditDialogData} from './consumption-edit-dialog.component';
import {UtilityConsumptionService} from './utility-consumption.service';
import {ConsumptionSummary, formatDateIt, formatQty, UtilityConsumption} from './consumption.model';

const SOURCE_LABEL: Record<UtilityConsumption['source'], string> = {
  MANUAL: 'Manuale', INVOICE: 'Fattura', IMPORT: 'Import', API: 'API',
};

@Component({
  selector: 'app-utility-consumptions-tab',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule, HasRoleDirective, ConsumptionChartComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div style="display: flex; flex-direction: column; gap: 1.25rem; padding: 1rem 0;">
      @if (summary) {
        <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
          <div style="flex: 1 1 260px; border: 1px solid #e5e7eb; border-radius: 6px; padding: 1rem;">
            <div style="color: #6b7280; font-size: 0.85rem;">Consumo effettivo ultimi 12 mesi</div>
            <div style="font-size: 1.5rem; font-weight: 600;">{{ formatQty(summary.actual_consumption, summary.unit) }}</div>
            <div style="color: #6b7280; font-size: 0.8rem;">
              Dati su {{ summary.coverage_days }}/365 giorni
              @if (summary.coverage_days < 365) { · valore parziale }
            </div>
          </div>
          <div style="flex: 1 1 260px; border: 1px solid #e5e7eb; border-radius: 6px; padding: 1rem;">
            <div style="color: #6b7280; font-size: 0.85rem;">Consumo annuo stimato</div>
            <div style="font-size: 1.5rem; font-weight: 600;">{{ formatQty(summary.estimated_annual_consumption, summary.unit) }}</div>
            <span [style.background]="estimateBadge().bg" [style.color]="estimateBadge().fg"
                  style="display: inline-block; border-radius: 10px; padding: 1px 8px; font-size: 0.75rem;">
              {{ estimateBadge().text }}
            </span>
          </div>
        </div>

        <div>
          <div style="font-weight: 600; margin-bottom: 0.5rem;">Andamento mensile (24 mesi reali + 12 stimati)</div>
          <app-consumption-chart [points]="summary.monthly" [unit]="summary.unit"></app-consumption-chart>
        </div>
      }

      <div>
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
          <span style="font-weight: 600;">Rilevazioni</span>
          <button mat-stroked-button type="button" (click)="openDialog()" [appHasRole]="['Admin','Operatore']">
            <mat-icon>add</mat-icon> Aggiungi rilevazione
          </button>
        </div>
        @if (rows.length === 0) {
          <p style="color: #6b7280;">Nessuna rilevazione inserita.</p>
        } @else {
          <table style="width: 100%; border-collapse: collapse; font-size: 0.875rem;">
            <thead>
              <tr style="text-align: left; border-bottom: 1px solid #e5e7eb;">
                <th style="padding: 6px;">Data / periodo</th>
                <th style="padding: 6px;">Tipo</th>
                <th style="padding: 6px;">Matricola</th>
                <th style="padding: 6px; text-align: right;">Lettura</th>
                <th style="padding: 6px; text-align: right;">Consumo</th>
                <th style="padding: 6px;">Origine</th>
                <th style="padding: 6px;">Note</th>
                <th style="padding: 6px;"></th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows; track row.id) {
                <tr style="border-bottom: 1px solid #f3f4f6;">
                  <td style="padding: 6px;">
                    {{ row.kind === 'READING' ? formatDateIt(row.reading_date) : formatDateIt(row.period_start) + ' – ' + formatDateIt(row.period_end) }}
                  </td>
                  <td style="padding: 6px;">{{ row.kind === 'READING' ? 'Lettura' : 'Periodo' }}</td>
                  <td style="padding: 6px;">{{ row.meter_number ?? '' }}</td>
                  <td style="padding: 6px; text-align: right;">{{ row.kind === 'READING' ? formatQty(row.reading_value) : '' }}</td>
                  <td style="padding: 6px; text-align: right;">
                    @if (row.computed_consumption === null) {
                      <span style="color: #6b7280;" matTooltip="Prima lettura o nuovo contatore: nessun consumo calcolabile">—</span>
                    } @else {
                      {{ formatQty(row.computed_consumption, summary?.unit) }}
                    }
                  </td>
                  <td style="padding: 6px;">{{ sourceLabel[row.source] }}</td>
                  <td style="padding: 6px;">{{ row.notes ?? '' }}</td>
                  <td style="padding: 6px; white-space: nowrap; text-align: right;">
                    <button mat-icon-button type="button" (click)="openDialog(row)" [appHasRole]="['Admin','Operatore']" matTooltip="Modifica">
                      <mat-icon>edit</mat-icon>
                    </button>
                    <button mat-icon-button type="button" (click)="remove(row)" [appHasRole]="['Admin','Operatore']" matTooltip="Elimina">
                      <mat-icon>delete</mat-icon>
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
    </div>
  `,
})
export class UtilityConsumptionsTabComponent implements OnInit {
  private service = inject(UtilityConsumptionService);
  private dialog = inject(MatDialog);

  @Input({required: true}) utilityId!: number;
  @Input() meterNumber: string | null = null;
  @Output() summaryChanged = new EventEmitter<ConsumptionSummary>();

  readonly formatQty = formatQty;
  readonly formatDateIt = formatDateIt;
  readonly sourceLabel = SOURCE_LABEL;

  summary: ConsumptionSummary | null = null;
  rows: UtilityConsumption[] = [];

  ngOnInit(): void {
    this.reload(false);
  }

  estimateBadge(): {text: string; bg: string; fg: string} {
    const s = this.summary;
    if (!s) return {text: '', bg: 'transparent', fg: 'inherit'};
    if (s.estimated_source === 'MANUAL') {
      return s.estimated_valid_until && s.estimated_valid_until >= new Date().toISOString().slice(0, 10)
        ? {text: `Manuale — valida fino al ${formatDateIt(s.estimated_valid_until)}`, bg: '#fef3c7', fg: '#92400e'}
        : {text: 'Manuale — scaduta', bg: '#fee2e2', fg: '#991b1b'};
    }
    if (s.estimated_source === 'HISTORY') return {text: 'Da storico', bg: '#dcfce7', fg: '#166534'};
    return {text: 'Nessun dato', bg: '#f3f4f6', fg: '#374151'};
  }

  openDialog(item?: UtilityConsumption): void {
    this.dialog.open<ConsumptionEditDialogComponent, ConsumptionEditDialogData, boolean>(ConsumptionEditDialogComponent, {
      width: '720px',
      maxWidth: '720px',
      data: {utilityId: this.utilityId, meterNumber: this.meterNumber, item},
    }).afterClosed().subscribe(saved => {
      if (saved) this.reload(true);
    });
  }

  remove(row: UtilityConsumption): void {
    this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
      width: '350px',
      data: {title: 'Elimina rilevazione', message: 'Eliminare la rilevazione selezionata?', confirmLabel: 'Elimina', danger: true},
    }).afterClosed().subscribe(confirmed => {
      if (!confirmed) return;
      this.service.delete(row.id).subscribe({
        next: () => this.reload(true),
        error: err => console.error('Errore eliminazione rilevazione:', err),
      });
    });
  }

  // notify=false al primo caricamento: i valori coincidono già con quelli
  // dell'utenza aperta, niente da propagare al form.
  private reload(notify: boolean): void {
    this.service.list(this.utilityId).subscribe({
      next: rows => this.rows = rows,
      error: err => console.error('Errore caricamento rilevazioni:', err),
    });
    this.service.summary(this.utilityId).subscribe({
      next: summary => {
        this.summary = summary;
        if (notify) this.summaryChanged.emit(summary);
      },
      error: err => console.error('Errore caricamento riepilogo consumi:', err),
    });
  }
}
```

- [ ] **Step 4: Integrazione nel dialog utenza**

`utility-edit-dialog.component.ts`:
- import `UtilityConsumptionsTabComponent` da `./consumptions/utility-consumptions-tab.component` e `ConsumptionSummary` da `./consumptions/consumption.model`; aggiungere `UtilityConsumptionsTabComponent` all'array `imports` del decorator; esporre `readonly HardType = HardType;`.
- metodo:
```ts
  // Dopo una modifica alle rilevazioni il backend ha già ricalcolato
  // effettivo/stima: allinea dati mostrati e form. La stima nel form si
  // aggiorna solo se l'utente non l'ha toccata — altrimenti "Salva"
  // rimanderebbe il vecchio valore come modificato e la marcherebbe manuale.
  onConsumptionSummary(summary: ConsumptionSummary): void {
    this.data.item.actual_consumption = summary.actual_consumption;
    this.data.item.actual_consumption_coverage_days = summary.coverage_days;
    this.data.item.estimated_consumption_source = summary.estimated_source;
    this.data.item.estimated_annual_consumption = summary.estimated_annual_consumption;
    const control = this.form.controls.estimated_annual_consumption;
    if (control.pristine) {
      control.setValue(summary.estimated_annual_consumption);
      control.markAsPristine();
    }
  }
```

`utility-edit-dialog.component.html`, dopo la `mat-tab` "Foto" e prima di "Storico":
```html
    <mat-tab [disabled]="isNew || selectedHardType === HardType.INTERNET">
      <ng-template mat-tab-label>
        <mat-icon style="margin-right: 5px;">insights</mat-icon>
        Consumi
      </ng-template>
      <ng-template matTabContent>
        <app-utility-consumptions-tab
          [utilityId]="data.item.id"
          [meterNumber]="data.item.meter_number ?? null"
          (summaryChanged)="onConsumptionSummary($event)">
        </app-utility-consumptions-tab>
      </ng-template>
    </mat-tab>
```

- [ ] **Step 5: Build**

Run: `docker exec utenzepa-frontend-1 pnpm run build`
Expected: build OK.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/pages/utilities/consumptions/consumption-chart.component.ts frontend/src/app/pages/utilities/consumptions/consumption-edit-dialog.component.ts frontend/src/app/pages/utilities/consumptions/utility-consumptions-tab.component.ts frontend/src/app/pages/utilities/utility-edit-dialog.component.ts frontend/src/app/pages/utilities/utility-edit-dialog.component.html
git commit -m "feat(consumi): tab consumi con riepilogo, grafico e rilevazioni"
```

---

### Task 9: Frontend — tab Utenze associate nel dialog capitolo

**Files:**
- Create: `frontend/src/app/pages/budget-chapters/budget-chapter-utilities-tab.component.ts`
- Modify: `frontend/src/app/pages/budget-chapters/budget-chapter-edit-dialog.component.ts`, `.html`

**Interfaces:**
- Consumes: `UtilityService.search({budget_chapter_code_fk, deleted:false})`, `UtilityConsumptionService.chapterSummary`, `DataTableUtilitiesComponent` (input `data`, `loading`; output `onSave`, `onDelete`, `onCreate`, `onRestore`).
- Produces: `<app-budget-chapter-utilities-tab [chapterId]="number">`.

- [ ] **Step 1: Componente tab**

`frontend/src/app/pages/budget-chapters/budget-chapter-utilities-tab.component.ts`:
```ts
import {ChangeDetectionStrategy, Component, inject, Input, OnInit} from '@angular/core';
import {plainToInstance} from 'class-transformer';
import {DataTableUtilitiesComponent} from '../utilities/data-table-utilities.component';
import {UtilityService} from '../utilities/utility.service';
import {Utility} from '../utilities/entity/utility.entity';
import {UtilityConsumptionService} from '../utilities/consumptions/utility-consumption.service';
import {ChapterConsumptionSummaryRow, formatQty} from '../utilities/consumptions/consumption.model';
import {HardTypeDescription} from '../utility-types/enum/hard-type.enum';
import {AuthService} from '../../services/auth.service';

// Utenze del capitolo: stessa tabella (colonne configurabili, dettaglio,
// export) della pagina Utenze, filtrata per capitolo. Il salvataggio dal
// dialog utenza va fatto qui: la tabella emette onSave e basta.
@Component({
  selector: 'app-budget-chapter-utilities-tab',
  standalone: true,
  imports: [DataTableUtilitiesComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div style="display: flex; flex-direction: column; gap: 1rem; padding: 1rem 0;">
      <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
        @for (row of summary; track row.hard_type) {
          <div style="flex: 1 1 260px; border: 1px solid #e5e7eb; border-radius: 6px; padding: 0.75rem 1rem;">
            <div style="font-weight: 600;">{{ hardTypeLabel[row.hard_type] }} · {{ row.utilities_count }} utenze</div>
            <div style="font-size: 0.9rem;">Presunto: <strong>{{ formatQty(row.estimated_sum, row.unit) }}</strong></div>
            <div style="font-size: 0.9rem;">Effettivo 12 mesi: <strong>{{ formatQty(row.actual_sum, row.unit) }}</strong></div>
          </div>
        } @empty {
          <p style="color: #6b7280; margin: 0;">Nessun consumo per le utenze di questo capitolo.</p>
        }
      </div>
      <app-data-table-utilities
        [data]="utilities"
        [loading]="loading"
        (onSave)="save($event)"
        (onCreate)="create($event)"
        (onDelete)="remove($event)"
        (onRestore)="reload()">
      </app-data-table-utilities>
    </div>
  `,
})
export class BudgetChapterUtilitiesTabComponent implements OnInit {
  private utilityService = inject(UtilityService);
  private consumptionService = inject(UtilityConsumptionService);
  private authService = inject(AuthService);

  @Input({required: true}) chapterId!: number;

  readonly formatQty = formatQty;
  readonly hardTypeLabel = HardTypeDescription;

  utilities: Utility[] = [];
  summary: ChapterConsumptionSummaryRow[] = [];
  loading = false;

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading = true;
    this.utilityService.search({budget_chapter_code_fk: this.chapterId, deleted: false}).subscribe({
      next: data => {
        this.utilities = plainToInstance(Utility, data);
        this.loading = false;
      },
      error: err => {
        this.loading = false;
        console.error('Errore caricamento utenze del capitolo:', err);
      },
    });
    this.consumptionService.chapterSummary(this.chapterId).subscribe({
      next: summary => this.summary = summary,
      error: err => console.error('Errore caricamento riepilogo consumi capitolo:', err),
    });
  }

  save(utility: Utility): void {
    this.utilityService.update(utility.id, utility).subscribe({
      next: () => this.reload(),
      error: err => console.error("Errore nel salvataggio dell'utenza:", err),
    });
  }

  create(utility: Utility): void {
    const userId = this.authService.getCurrentUser()?.id;
    this.utilityService.create({...utility, created_by_user_id: userId, updated_by_user_id: userId}).subscribe({
      next: () => this.reload(),
      error: err => console.error("Errore nella creazione dell'utenza:", err),
    });
  }

  remove(utility: Utility): void {
    this.utilityService.delete(utility.id).subscribe({
      next: () => this.reload(),
      error: err => console.error("Errore nell'eliminazione dell'utenza:", err),
    });
  }
}
```
Prima di questo step, verificare in `data-table-utilities.component.ts`/`.html` che `openEditDialog` esista e che l'handler di `onSave` nella pagina utenze (`AbstractComponent.onSave`) chiami `service.update(id, item)` — se fa operazioni aggiuntive (es. messaggio toast via `messageService`), replicarle qui con lo stesso servizio.

- [ ] **Step 2: Dialog capitolo a tab**

`budget-chapter-edit-dialog.component.ts`: aggiungere agli import `MatTabsModule` (`@angular/material/tabs`), `MatIconModule`, `BudgetChapterUtilitiesTabComponent`.

`budget-chapter-edit-dialog.component.html` — avvolgere il `<form>` esistente:
```html
<mat-dialog-content>
  <mat-tab-group mat-stretch-tabs="false" mat-align-tabs="start">
    <mat-tab label="Dati">
      <form [formGroup]="form" [readOnly]="['Lettore']" style="display: flex; flex-wrap: wrap; gap: 1rem; padding-top: 1rem;">
        <!-- campi esistenti invariati -->
      </form>
    </mat-tab>
    <mat-tab [disabled]="isNew">
      <ng-template mat-tab-label>
        <mat-icon style="margin-right: 5px;">electric_meter</mat-icon>
        Utenze associate
      </ng-template>
      <ng-template matTabContent>
        <app-budget-chapter-utilities-tab [chapterId]="data.item.id"></app-budget-chapter-utilities-tab>
      </ng-template>
    </mat-tab>
  </mat-tab-group>
</mat-dialog-content>
```
(i `mat-form-field` esistenti restano identici dentro il `<form>`).

- [ ] **Step 3: Build**

Run: `docker exec utenzepa-frontend-1 pnpm run build`
Expected: build OK.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/pages/budget-chapters/budget-chapter-utilities-tab.component.ts frontend/src/app/pages/budget-chapters/budget-chapter-edit-dialog.component.ts frontend/src/app/pages/budget-chapters/budget-chapter-edit-dialog.component.html
git commit -m "feat(consumi): utenze associate con totali nel dialog capitolo"
```

---

### Task 10: Verifica end-to-end e lint

**Files:** nessun file nuovo (eventuali fix emersi).

- [ ] **Step 1: Lint backend**

Run: `docker exec utenzepa-api-1 pnpm run lint`
Poi `git diff --numstat`: scartare i file `0 0` (`git checkout -- <file>`), committare solo correzioni reali.

- [ ] **Step 2: Utente di test**

Seguendo CLAUDE.md: hash con `docker exec utenzepa-api-1 node -e "require('bcrypt').hash('Test1234!', 10).then(console.log)"`, `INSERT` su `system_users` (ruolo Operatore, `status='Attivo'`, `created_by_user_id=1`, `updated_by_user_id=1`).

- [ ] **Step 3: Scenario browser (Playwright MCP)**

Su http://localhost:4300, login con l'utente di test:
1. Utenze → aprire un'utenza luce → tab **Consumi**: card "Nessun dato"/effettivo 0.
2. Aggiungere lettura 60 giorni fa (valore 1000, matricola attuale) e lettura 30 giorni fa (1300): card effettivo = 300 kWh su 30/365 giorni; stima "Da storico" ≈ 3650 kWh (se la stima era 0/NONE); grafico con barre reali e stimate; riga seconda lettura con consumo 300.
3. Lettura oggi con valore 1200 stessa matricola → errore inline "Lettura inferiore alla precedente…".
4. Lettura oggi con matricola nuova e valore 5 → accettata, consumo "—"; tab Dati: "Numero Contatore" aggiornato alla nuova matricola dopo riapertura.
5. Periodo sovrapposto a un altro periodo → errore inline.
6. Tab Dati: impostare stima 5000 → Salva → riaprire: hint "Manuale, valida fino al …". Salvare di nuovo senza toccare la stima → origine resta manuale con stessa data (verificare via `SELECT estimated_consumption_set_at`).
7. Tab Dati: campo capitolo mostra `codice/articolo — descrizione`; dropdown con riga PDC/tipo, capitoli compatibili in cima, ricerca per PDC funzionante.
8. Capitoli → aprire il capitolo dell'utenza → tab **Utenze associate**: card totali per tipo coerenti con i valori dell'utenza; click riga → dialog utenza sopra; salvare → lista e totali ricaricati.
9. Utenza Internet: tab Consumi disabilitata.
10. Console browser senza errori; nessuna chiamata 401/400 inattesa nella Network tab.

- [ ] **Step 4: Cron e update_date**

Non avviare un secondo `AppModule` a mano (rilancerebbe cron, migration e scan geocoding). Verifiche:
1. Registrazione cron: `docker logs utenzepa-api-1 2>&1 | grep -i "consumption\|error" | tail` — nessun errore all'avvio del modulo.
2. `update_date` invariato dal ricalcolo (stesso codice del cron, `recalcUtility`): annotare `SELECT update_date FROM utilities WHERE id = <utenza di test>`, aggiungere ed eliminare una rilevazione dalla UI, rileggere: `update_date` identico, `actual_consumption` ricalcolato.
3. Ricalcolo completo: coperto da `consumption-recalc.service.spec.ts` (`recalcAll`); l'esecuzione reale avviene alle 03:00 — controllare il giorno dopo il log `Ricalcolo consumi notturno: N utenze aggiornate, 0 errori`.

- [ ] **Step 5: Pulizia dati di test**

Eliminare le rilevazioni inserite (`DELETE FROM utility_consumptions WHERE created_by_user_id = <id test>`), ripristinare matricola/stima dell'utenza usata se modificate (riassegnare eventuali righe create dall'utente test a `created_by_user_id=1` prima del `DELETE` dell'utente), poi `DELETE FROM system_users WHERE id = <id test>`. Per riallineare i valori calcolati dell'utenza dopo il `DELETE` SQL: aggiungere ed eliminare una rilevazione dalla UI con l'admin (triggera `recalcUtility`), oppure attendere il cron notturno.

- [ ] **Step 6: Commit eventuali fix**

```bash
git add <file corretti, elencati esplicitamente>
git commit -m "fix(consumi): <correzione emersa dalla verifica>"
```

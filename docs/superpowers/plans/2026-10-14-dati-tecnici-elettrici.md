# Dati tecnici elettrici, rinnovo contratti, stima da storico — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Codice impianto del fornitore, fasce F0–F3 e penale per energia reattiva sui consumi elettrici, segnalazione «Penali per energia reattiva», stima manuale che cede allo storico ≥ 300 giorni, contratti ordinati nella scheda utenza, nuovo contratto con le utenze di uno esistente (v1.27.0).

**Architecture:** Una migration con sole colonne nullable. Regole pure in `consumption-calculator.ts` e in un nuovo `contracts/replace-contract.ts`, applicate dai service; anomalia SQL in fondo a `getAnomalies()`. Frontend: campi nei form esistenti, helper puro `sortSupplyContracts` in `entity-status.ts`, azione di rinnovo che riusa `EntityNavigatorService.createSupplyContract`.

**Tech Stack:** NestJS 11 + TypeORM (MySQL 8), Jest; Angular 22 + Material; Playwright dall'host.

**Spec:** `docs/superpowers/specs/2026-10-14-dati-tecnici-elettrici-design.md`

## Global Constraints

- Comandi Docker uno alla volta; jest sempre `--maxWorkers=2`, solo i file rilevanti.
- Sorgenti con CRLF: modifiche con l'Edit tool o Python che preserva `\r\n`; mai `sed -i` sui `.ts` esistenti.
- `pnpm run lint` nel container normalizza CRLF su tutti i `.ts`: prima di `git add` scartare i file con `git diff --numstat` = `0 0`.
- Mai `git add .`/`-A`; file elencati uno per uno.
- Migration scritta in uno scratch path (`backend/scratch/`), spostata in `src/database/migrations/` solo a contenuto finale; poi verificare la riga in `migrations` (se manca: `docker restart utenzepa-api-1`) e `schema:log` senza statement sulle tabelle toccate.
- Niente HTTP 409: errori di validazione sempre 400 con messaggio italiano.
- Colonne stringa nullable: `type: 'varchar'` esplicito.
- Messaggio fasce esatto: `La somma delle fasce (X kWh) non coincide con il consumo del periodo (Y kWh).` (numeri `toLocaleString('it-IT')`).
- Costante `HISTORY_MIN_COVERAGE_DAYS = 300`; tolleranza fasce 1 kWh.
- Etichette UI: «Codice impianto fornitore», «Penale per energia reattiva», segnalazione «Penali per energia reattiva», azione «Nuovo contratto con queste utenze», casella «Chiudi il contratto precedente».
- Guida `frontend/public/guida/guida.md` aggiornata nella stessa PR con la data in testa; `publiccode.yml` → `softwareVersion: 1.27.0`, `releaseDate: 2026-10-14` (o data del merge).
- Nessun dato personale in test, commit, PR.

## Review Focus

1. **Stima manuale appena inserita su utenza con storico ≥ 300 giorni**: l'operatore deve capire subito che verrà sostituita → il suggerimento del campo e il badge del tab Consumi lo dicono (Task 6, Task 7).
2. **Modifica (PATCH) di un consumo esistente con fasce e cambio del solo consumo**: la somma va ricontrollata sui valori fusi (attuali + nuovi), non solo sul DTO → test in Task 3.
3. **Fasce su utenza non elettrica o su lettura**: azzerate senza errore, anche se il client le manda → test in Task 2 e Task 3.
4. **Rinnovo con il contratto precedente già scaduto prima della nuova decorrenza**: la sua scadenza non cambia, viene solo chiuso; rinnovo con contratto precedente cancellato → 400 → test in Task 5.
5. **Dialog del contratto vecchio rimasto aperto dopo il rinnovo**: se l'operatore poi preme Salva non deve riaprire il contratto (closed=false) → il form viene riallineato (Task 8, verificato in E2E Task 9).

---

### Task 1: Migration, entity e DTO

**Files:**
- Create: `backend/src/database/migrations/1794500000000-ElectricTechnicalData.ts` (scritta prima in `backend/scratch/`)
- Modify: `backend/src/apis/utility/entity/utility.entity.ts` (dopo `voltage_kw_electric`)
- Modify: `backend/src/apis/utility/dto/create-utility.dto.ts`, `update-utility.dto.ts`, `search-utility.dto.ts`
- Modify: `backend/src/apis/utility-consumptions/entity/utility-consumption.entity.ts` (dopo `consumption`)
- Modify: `backend/src/apis/utility-consumptions/dto/create-utility-consumption.dto.ts`

**Interfaces:**
- Produces: colonne `utilities.supplier_plant_code`, `utility_consumptions.consumption_f0..f3`, `utility_consumptions.reactive_penalty`; campi DTO omonimi.

- [ ] **Step 1: Scrivere la migration nello scratch path**

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

// Dati tecnici dal fatturato del fornitore di energia elettrica: codice
// impianto sull'utenza, consumi per fascia e penale per energia reattiva
// sui consumi di periodo. Solo colonne nullable, nessun dato da spostare.
export class ElectricTechnicalData1794500000000 implements MigrationInterface {
  name = 'ElectricTechnicalData1794500000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `utilities` ADD `supplier_plant_code` varchar(50) NULL');
    await q.query(
      'ALTER TABLE `utility_consumptions` ADD `consumption_f0` decimal(14,3) NULL, ADD `consumption_f1` decimal(14,3) NULL, ADD `consumption_f2` decimal(14,3) NULL, ADD `consumption_f3` decimal(14,3) NULL, ADD `reactive_penalty` tinyint NULL',
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      'ALTER TABLE `utility_consumptions` DROP COLUMN `reactive_penalty`, DROP COLUMN `consumption_f3`, DROP COLUMN `consumption_f2`, DROP COLUMN `consumption_f1`, DROP COLUMN `consumption_f0`',
    );
    await q.query('ALTER TABLE `utilities` DROP COLUMN `supplier_plant_code`');
  }
}
```

- [ ] **Step 2: Entity**

`utility.entity.ts`, dopo `voltage_kw_electric`:

```ts
  // Codice impianto del fornitore di energia (uno per POD, stabile tra i
  // rinnovi annuali del contratto). Solo utenze elettriche.
  @Column({ type: 'varchar', length: 50, nullable: true })
  supplier_plant_code: string | null;
```

`utility-consumption.entity.ts`, dopo `consumption`:

```ts
  // Consumi per fascia (solo periodi di utenze elettriche): F0 = monoraria.
  // Se valorizzate, la somma coincide col consumo entro 1 kWh.
  @Column({ type: 'decimal', precision: 14, scale: 3, nullable: true })
  consumption_f0: number | null;

  @Column({ type: 'decimal', precision: 14, scale: 3, nullable: true })
  consumption_f1: number | null;

  @Column({ type: 'decimal', precision: 14, scale: 3, nullable: true })
  consumption_f2: number | null;

  @Column({ type: 'decimal', precision: 14, scale: 3, nullable: true })
  consumption_f3: number | null;

  // Penale per energia reattiva addebitata nel periodo; null = non noto.
  @Column({ type: 'boolean', nullable: true })
  reactive_penalty: boolean | null;
```

- [ ] **Step 3: DTO**

`create-utility.dto.ts` e `update-utility.dto.ts` (accanto a `voltage_kw_electric`):

```ts
  @IsOptional()
  @IsString()
  @MaxLength(50)
  supplier_plant_code?: string | null;
```

`search-utility.dto.ts` (accanto a `voltage_kw_electric`):

```ts
  @IsOptional()
  @IsString()
  supplier_plant_code?: string;
```

`create-utility-consumption.dto.ts` (dopo `consumption`; `IsBoolean` da importare da class-validator):

```ts
  // Fasce e penale: solo periodi di utenze elettriche, il service le azzera altrove.
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  consumption_f0?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  consumption_f1?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  consumption_f2?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  consumption_f3?: number | null;

  @IsOptional()
  @IsBoolean()
  reactive_penalty?: boolean | null;
```

Verificare che `update-utility-consumption.dto.ts` derivi dal create (`PartialType`); se è una classe a sé, aggiungere gli stessi campi.

- [ ] **Step 4: Spostare la migration e verificare**

```bash
mv backend/scratch/1794500000000-ElectricTechnicalData.ts backend/src/database/migrations/
docker exec utenzepa-mysql-1 mysql -uroot -p'<MYSQL_PASSWORD>' mydatabase -e "SELECT name FROM migrations ORDER BY id DESC LIMIT 1"
```
Expected: `ElectricTechnicalData1794500000000` (se manca: `docker restart utenzepa-api-1`, poi ripetere).

```bash
docker exec utenzepa-api-1 node -r ts-node/register -r tsconfig-paths/register node_modules/typeorm/cli.js schema:log -d src/database/data-source.ts
```
Expected: nessuno statement su `utilities.supplier_plant_code` né su `utility_consumptions`.

Ciclo down → up: `migration:revert` poi riavvio (riapplica), controllare le colonne con `SHOW COLUMNS`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/database/migrations/1794500000000-ElectricTechnicalData.ts backend/src/apis/utility/entity/utility.entity.ts backend/src/apis/utility/dto/create-utility.dto.ts backend/src/apis/utility/dto/update-utility.dto.ts backend/src/apis/utility/dto/search-utility.dto.ts backend/src/apis/utility-consumptions/entity/utility-consumption.entity.ts backend/src/apis/utility-consumptions/dto/create-utility-consumption.dto.ts
git commit -m "feat(utilities): colonne per codice impianto, fasce e penale reattiva"
```

---

### Task 2: Regole pure nel calcolatore consumi

**Files:**
- Modify: `backend/src/apis/utility-consumptions/consumption-calculator.ts`
- Test: `backend/src/apis/utility-consumptions/consumption-calculator.spec.ts`

**Interfaces:**
- Consumes: campi di Task 1.
- Produces:
  - `ConsumptionRecord` con `consumption_f0..f3?: number | string | null`, `reactive_penalty?: boolean | null`;
  - `normalizeByKind(record, isElectric = false)` → azzera fasce e penale se lettura o non elettrica;
  - `validateBands(candidate: ConsumptionRecord): string | null`;
  - `HISTORY_MIN_COVERAGE_DAYS = 300`, `BAND_TOLERANCE_KWH = 1`;
  - `decideEstimate(state, historyEstimate, now, coverageDays = 0)`.

- [ ] **Step 1: Test che falliscono**

In `consumption-calculator.spec.ts` (importare `validateBands`, `HISTORY_MIN_COVERAGE_DAYS`):

```ts
  describe('validateBands', () => {
    const period = (consumption: number, f: Partial<Record<'consumption_f0' | 'consumption_f1' | 'consumption_f2' | 'consumption_f3', number | string | null>>) => ({
      kind: ConsumptionKind.PERIOD, period_start: '2026-01-01', period_end: '2026-01-31', consumption, ...f,
    });

    it('nessuna fascia: nessun controllo', () => {
      expect(validateBands(period(100, {}))).toBeNull();
    });

    it('somma esatta (decimal come stringa)', () => {
      expect(validateBands(period(100, { consumption_f1: '50.000', consumption_f2: 30, consumption_f3: 20 }))).toBeNull();
    });

    it('scarto entro 1 kWh ammesso, fasce vuote = 0', () => {
      expect(validateBands(period(100.8, { consumption_f1: 100, consumption_f2: null }))).toBeNull();
    });

    it('scarto oltre 1 kWh: messaggio con i due totali', () => {
      expect(validateBands(period(1500, { consumption_f1: 1000, consumption_f2: 200 }))).toBe(
        'La somma delle fasce (1.200 kWh) non coincide con il consumo del periodo (1.500 kWh).',
      );
    });

    it('letture: nessun controllo', () => {
      expect(validateBands({ kind: ConsumptionKind.READING, reading_value: 5, consumption_f1: 3 } as never)).toBeNull();
    });
  });
```

In `describe('normalizeByKind')`:

```ts
    it('periodo elettrico: fasce e penale mantenute', () => {
      const r = normalizeByKind({ kind: ConsumptionKind.PERIOD, period_start: '2026-01-01', period_end: '2026-01-31', consumption: 10, consumption_f1: 10, reactive_penalty: true }, true);
      expect(r).toMatchObject({ consumption_f1: 10, consumption_f0: null, reactive_penalty: true });
    });

    it('periodo non elettrico: fasce e penale azzerate', () => {
      const r = normalizeByKind({ kind: ConsumptionKind.PERIOD, period_start: '2026-01-01', period_end: '2026-01-31', consumption: 10, consumption_f1: 10, reactive_penalty: true }, false);
      expect(r).toMatchObject({ consumption_f1: null, reactive_penalty: null });
    });

    it('lettura elettrica: fasce e penale azzerate', () => {
      const r = normalizeByKind({ kind: ConsumptionKind.READING, reading_date: '2026-01-01', reading_value: 1, meter_number: 'M', consumption_f2: 4, reactive_penalty: false }, true);
      expect(r).toMatchObject({ consumption_f2: null, reactive_penalty: null });
    });
```

In `describe('decideEstimate')`:

```ts
    it('manuale ancora valida ma storico ≥ 300 giorni: passa a HISTORY', () => {
      expect(decideEstimate({ source: EstimateSource.MANUAL, setAt: new Date('2026-09-01') }, 500, now, HISTORY_MIN_COVERAGE_DAYS)).toEqual({
        estimated_annual_consumption: 500,
        estimated_consumption_source: EstimateSource.HISTORY,
        estimated_consumption_set_at: null,
      });
    });

    it('manuale ancora valida e storico 299 giorni: non toccata', () => {
      expect(decideEstimate({ source: EstimateSource.MANUAL, setAt: new Date('2026-09-01') }, 500, now, 299)).toBeNull();
    });
```

- [ ] **Step 2: Verificare che falliscano**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/utility-consumptions/consumption-calculator.spec.ts --maxWorkers=2`
Expected: FAIL (`validateBands is not a function`, campi assenti nel risultato di `normalizeByKind`, `decideEstimate` non considera la copertura).

- [ ] **Step 3: Implementazione**

`ConsumptionRecord`: aggiungere

```ts
  consumption_f0?: number | string | null;
  consumption_f1?: number | string | null;
  consumption_f2?: number | string | null;
  consumption_f3?: number | string | null;
  reactive_penalty?: boolean | null;
```

Costanti (vicino a `WINDOW_DAYS`):

```ts
// Copertura dello storico (giorni negli ultimi 365) oltre la quale la stima
// da storico prevale su quella manuale ancora valida.
export const HISTORY_MIN_COVERAGE_DAYS = 300;
// Scarto ammesso tra somma delle fasce e consumo del periodo (arrotondamenti).
export const BAND_TOLERANCE_KWH = 1;
export const BAND_FIELDS = ['consumption_f0', 'consumption_f1', 'consumption_f2', 'consumption_f3'] as const;
```

`decideEstimate`: nuovo parametro `coverageDays = 0`, condizione

```ts
  const manualValid =
    state.source === EstimateSource.MANUAL &&
    state.setAt !== null &&
    manualValidUntil(state.setAt) > now &&
    coverageDays < HISTORY_MIN_COVERAGE_DAYS;
```

`normalizeByKind(record, isElectric = false)`: aggiungere al risultato

```ts
  const keepBands = !isReading && isElectric;
  const band = (v: number | string | null | undefined) => (keepBands && v !== undefined && v !== null && v !== '' ? Number(v) : null);
  // ...nel return:
    consumption_f0: band(record.consumption_f0),
    consumption_f1: band(record.consumption_f1),
    consumption_f2: band(record.consumption_f2),
    consumption_f3: band(record.consumption_f3),
    reactive_penalty: keepBands ? (record.reactive_penalty ?? null) : null,
```

e aggiornare il tipo di ritorno (`ConsumptionRecord & { notes: string | null }` resta valido: i campi sono nel tipo).

`validateBands`:

```ts
const kwhIt = (n: number): string => n.toLocaleString('it-IT', { maximumFractionDigits: 3 });

// Messaggio d'errore o null: le fasce (facoltative) devono sommare al consumo
// del periodo; quelle vuote valgono 0. Nessun controllo senza fasce.
export function validateBands(candidate: ConsumptionRecord): string | null {
  if (candidate.kind !== ConsumptionKind.PERIOD) return null;
  const values = BAND_FIELDS.map((f) => candidate[f]).filter((v) => v !== null && v !== undefined && v !== '');
  if (!values.length) return null;
  const sum = Math.round(values.reduce<number>((s, v) => s + Number(v), 0) * 1000) / 1000;
  const total = Number(candidate.consumption ?? 0);
  if (Math.abs(sum - total) <= BAND_TOLERANCE_KWH) return null;
  return `La somma delle fasce (${kwhIt(sum)} kWh) non coincide con il consumo del periodo (${kwhIt(total)} kWh).`;
}
```

- [ ] **Step 4: Test verdi**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/utility-consumptions/consumption-calculator.spec.ts --maxWorkers=2`
Expected: PASS (anche i test preesistenti di `normalizeByKind`: se un test confronta l'oggetto intero con `toEqual`, aggiornarlo aggiungendo le cinque chiavi a `null`).

- [ ] **Step 5: Commit**

```bash
git add backend/src/apis/utility-consumptions/consumption-calculator.ts backend/src/apis/utility-consumptions/consumption-calculator.spec.ts
git commit -m "feat(consumptions): fasce, penale reattiva e stima da storico nel calcolatore"
```

---

### Task 3: Service consumi e ricalcolo

**Files:**
- Modify: `backend/src/apis/utility-consumptions/utility-consumptions.service.ts`
- Modify: `backend/src/apis/utility-consumptions/consumption-recalc.service.ts`
- Test: `backend/src/apis/utility-consumptions/utility-consumptions.service.spec.ts`, `consumption-recalc.service.spec.ts`

**Interfaces:**
- Consumes: `normalizeByKind(record, isElectric)`, `validateBands`, `decideEstimate(..., coverageDays)`, `HISTORY_MIN_COVERAGE_DAYS` (Task 2).
- Produces: API `POST /utilities/:id/consumptions` e `PATCH /utility-consumptions/:id` che accettano fasce e penale; `GET .../consumptions` con fasce numeriche; summary con `estimated_valid_until` invariato.

- [ ] **Step 1: Test che falliscono**

In `utility-consumptions.service.spec.ts` (riusa `lightUtility`, `repo`, `utilityRepo`):

```ts
  const periodDto = (extra: Record<string, unknown> = {}) => ({
    kind: ConsumptionKind.PERIOD, reading_date: null, reading_value: null, meter_number: null,
    period_start: '2026-05-01', period_end: '2026-05-31', consumption: 100, ...extra,
  });

  it('periodo elettrico con fasce coerenti e penale: salvati', async () => {
    repo.find.mockResolvedValue([]);
    await service.createForUtility(7, periodDto({ consumption_f1: 60, consumption_f2: 40, reactive_penalty: true }) as never, 3);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ consumption_f1: 60, consumption_f2: 40, reactive_penalty: true }));
  });

  it('fasce che non sommano al consumo: 400 e nessun salvataggio', async () => {
    repo.find.mockResolvedValue([]);
    await expect(service.createForUtility(7, periodDto({ consumption_f1: 10 }) as never, 3)).rejects.toThrow(
      'La somma delle fasce (10 kWh) non coincide con il consumo del periodo (100 kWh).',
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('utenza gas: fasce e penale azzerate senza errore', async () => {
    repo.find.mockResolvedValue([]);
    utilityRepo.findOne.mockResolvedValue({ ...lightUtility, utilityType: { hard_type: HardTypeEnum.GAS } });
    await service.createForUtility(7, periodDto({ consumption_f1: 10, reactive_penalty: true }) as never, 3);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ consumption_f1: null, reactive_penalty: null }));
  });

  it('PATCH del solo consumo: la somma è ricontrollata con le fasce già salvate', async () => {
    const current = { id: 5, utility_id_fk: 7, ...periodDto({ consumption_f1: '60.000', consumption_f2: '40.000' }), deleted: false };
    repo.findOne.mockResolvedValue(current);
    repo.find.mockResolvedValue([current]);
    await expect(service.update(5, { consumption: 150 } as never, 3)).rejects.toThrow('non coincide con il consumo del periodo');
  });
```

Se `repo.findOne` nel `beforeEach` non restituisce nulla di default e `super.update` usa altri metodi del repository, completare il mock come fa il test esistente «PATCH che cambia tipo».

In `consumption-recalc.service.spec.ts`, nuovo test (stessa struttura dei test esistenti del file):

```ts
  it('stima manuale valida ma storico ≥ 300 giorni: sostituita dallo storico', async () => {
    // 330 giorni di periodi mensili fino a ieri, stima manuale inserita 10 giorni fa
    // -> l'update deve contenere estimated_consumption_source = HISTORY
  });
```

Scrivere il corpo con i mock del file: `utilityRepo.findOne` → utenza LIGHT con `estimated_consumption_source: MANUAL`, `estimated_consumption_set_at` = `now − 10 giorni`; `consumptionRepo.find` → 11 periodi mensili consecutivi che finiscono prima di `now` (copertura ≥ 300); `expect(utilityRepo.update).toHaveBeenCalledWith(id, expect.objectContaining({ estimated_consumption_source: EstimateSource.HISTORY }))`.

- [ ] **Step 2: Verificare che falliscano**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/utility-consumptions --maxWorkers=2`
Expected: FAIL sui nuovi test.

- [ ] **Step 3: Implementazione**

`utility-consumptions.service.ts`:

```ts
const isElectric = (u: Utility) => u.utilityType?.hard_type === HardTypeEnum.LIGHT;
```

- `createForUtility`: `normalizeByKind(dto as ..., isElectric(utility))`.
- `update`: `normalizeByKind({ ...current, ...dto } as ..., isElectric(utility))` (fusione già presente: la somma si controlla sui valori fusi).
- `validate`: dopo `validateConsumption`,

```ts
    const bandError = validateBands(candidate);
    if (bandError) throw new BadRequestException(bandError);
```

- `findByUtility`: nel `map` aggiungere `consumption_f0: toNumber(r.consumption_f0)`, … `consumption_f3`.

`consumption-recalc.service.ts`: passare la copertura

```ts
    const estimate = decideEstimate(
      { source: ..., setAt: ... },
      computeSeasonalEstimate(daily, today),
      now,
      coverageDays,
    );
```

- [ ] **Step 4: Test verdi**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/utility-consumptions --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/apis/utility-consumptions/utility-consumptions.service.ts backend/src/apis/utility-consumptions/utility-consumptions.service.spec.ts backend/src/apis/utility-consumptions/consumption-recalc.service.ts backend/src/apis/utility-consumptions/consumption-recalc.service.spec.ts
git commit -m "feat(consumptions): fasce e penale reattiva nei consumi di periodo, stima da storico oltre 300 giorni"
```

---

### Task 4: Anomalia «Penali per energia reattiva»

**Files:**
- Modify: `backend/src/apis/anomalies/anomalies.service.ts`
- Test: `backend/src/apis/anomalies/anomalies.service.spec.ts`
- Modify: `frontend/src/app/core/services/anomalies.service.ts`
- Modify: `frontend/src/app/pages/utilities/utilities-filters.ts`

**Interfaces:**
- Produces: `Anomalies.utilities_with_reactive_penalty: AnomalyList<UtilityAnomaly>`; voce `UTILITY_SIGNALS` con la stessa chiave.

- [ ] **Step 1: Test che fallisce**

In `anomalies.service.spec.ts`, nel `describe` che usa `only`/`sqlOf`:

```ts
    it('utenze con penali per energia reattiva negli ultimi 12 mesi', async () => {
      only('/* utilities_with_reactive_penalty */', [{ id: '31', utility_id: 'IT001E00000001', type: 'energia elettrica' }]);
      const r = await service.getAnomalies();
      expect(r.utilities_with_reactive_penalty).toEqual({
        count: 1,
        items: [{ id: 31, utility_id: 'IT001E00000001', type: 'energia elettrica' }],
      });
      const sql = sqlOf('/* utilities_with_reactive_penalty */');
      expect(sql).toContain('uc.reactive_penalty = 1');
      expect(sql).toContain("uc.kind = 'PERIOD'");
      expect(sql).toContain('uc.deleted = 0');
      expect(sql).toContain('u.deleted = 0');
      expect(sql).toContain('INTERVAL 365 DAY');
      expect(sql).not.toContain('CURDATE()');
      const call = query.mock.calls.find(([s]) => String(s).includes('/* utilities_with_reactive_penalty */'));
      expect(call?.[1]).toEqual([expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)]);
    });
```

- [ ] **Step 2: Verificare che fallisca**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/anomalies/anomalies.service.spec.ts --maxWorkers=2`
Expected: FAIL (`utilities_with_reactive_penalty` undefined).

- [ ] **Step 3: Implementazione**

Interfaccia `Anomalies`: `utilities_with_reactive_penalty: AnomalyList<UtilityAnomaly>;`

In fondo alle query di `getAnomalies()` (dopo `fireOverdue`):

```ts
    // Penali per energia reattiva (basso cos φ) in un periodo terminato negli
    // ultimi 365 giorni: impianto da rifasare. Oggi passato da Node.
    const reactivePenalty: UtilityAnomaly[] = await this.dataSource.query(
      `/* utilities_with_reactive_penalty */ SELECT DISTINCT ${utilityColumns}
         FROM utilities u JOIN utility_types t ON t.id = u.utility_type_id_fk
         CROSS JOIN (SELECT CAST(? AS DATE) AS today) d
         JOIN utility_consumptions uc ON uc.utility_id_fk = u.id AND uc.deleted = 0
              AND uc.kind = 'PERIOD' AND uc.reactive_penalty = 1
              AND uc.period_end > DATE_SUB(d.today, INTERVAL 365 DAY)
        WHERE u.deleted = 0
        ORDER BY t.name, u.utility_id`,
      [todayIso()],
    );
```

Nel `return`: `utilities_with_reactive_penalty: list(reactivePenalty),` (stessa conversione usata per `utilitiesWithoutPosition`: se `list` non converte `id` in numero, mappare `{ ...u, id: Number(u.id) }`).

Frontend `core/services/anomalies.service.ts`: `utilities_with_reactive_penalty: AnomalyList<UtilityAnomaly>;`

`utilities-filters.ts`, in fondo a `UTILITY_SIGNALS`:

```ts
  {key: 'utilities_with_reactive_penalty', label: 'Penali per energia reattiva'},
```

- [ ] **Step 4: Test verdi**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/anomalies/anomalies.service.spec.ts --maxWorkers=2`
Expected: PASS (anche i test posizionali esistenti: la query è in fondo).

- [ ] **Step 5: Commit**

```bash
git add backend/src/apis/anomalies/anomalies.service.ts backend/src/apis/anomalies/anomalies.service.spec.ts frontend/src/app/core/services/anomalies.service.ts frontend/src/app/pages/utilities/utilities-filters.ts
git commit -m "feat(anomalies): segnalazione utenze con penali per energia reattiva"
```

---

### Task 5: Backend — nuovo contratto che sostituisce il precedente

**Files:**
- Create: `backend/src/apis/contracts/replace-contract.ts`
- Create: `backend/src/apis/contracts/replace-contract.spec.ts`
- Modify: `backend/src/apis/contracts/dto/create-contract.dto.ts`
- Modify: `backend/src/apis/contracts/contracts.service.ts` (`create`)
- Test: `backend/src/apis/contracts/contracts.service.spec.ts`

**Interfaces:**
- Produces: `CreateContractDto.replaces_contract_id?: number`; `replacedContractPatch(prevExpiry, newStart): { closed: true; supply_expiry_date?: string }`.

- [ ] **Step 1: Test che falliscono**

`replace-contract.spec.ts`:

```ts
import { replacedContractPatch } from './replace-contract';

describe('replacedContractPatch', () => {
  it('scadenza assente: diventa il giorno prima della nuova decorrenza', () => {
    expect(replacedContractPatch(null, '2026-07-01')).toEqual({ closed: true, supply_expiry_date: '2026-06-30' });
  });

  it('scadenza oltre la nuova decorrenza: accorciata (anche a cavallo d’anno)', () => {
    expect(replacedContractPatch('2027-06-30', '2026-01-01')).toEqual({ closed: true, supply_expiry_date: '2025-12-31' });
  });

  it('scadenza uguale alla nuova decorrenza: accorciata', () => {
    expect(replacedContractPatch('2026-07-01', '2026-07-01')).toEqual({ closed: true, supply_expiry_date: '2026-06-30' });
  });

  it('scadenza già anteriore: solo chiuso', () => {
    expect(replacedContractPatch('2026-05-31', '2026-07-01')).toEqual({ closed: true });
  });

  it('nuovo contratto senza decorrenza: solo chiuso', () => {
    expect(replacedContractPatch(null, null)).toEqual({ closed: true });
  });

  it('scadenza come Date: confrontata come giorno locale', () => {
    expect(replacedContractPatch(new Date(2026, 11, 31), '2026-07-01')).toEqual({ closed: true, supply_expiry_date: '2026-06-30' });
  });
});
```

In `contracts.service.spec.ts`, `describe('create')`:

```ts
    it('replaces_contract_id: chiude il precedente e ne accorcia la scadenza nella stessa transazione', async () => {
      repo.findOne.mockResolvedValue({ id: 3, deleted: false, closed: false, supply_expiry_date: null } as Contract);
      manager.findOne.mockResolvedValue({ id: 10 } as Contract);
      await service.create({ cig_contract: 'CIG1', supply_start_date: '2026-07-01', replaces_contract_id: 3 } as never, 5);
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(manager.save).toHaveBeenCalledWith(Contract, expect.objectContaining({ id: 3, closed: true, supply_expiry_date: '2026-06-30', updated_by_user_id: 5 }));
      expect(manager.create).not.toHaveBeenCalledWith(Contract, expect.objectContaining({ replaces_contract_id: 3 }));
    });

    it('replaces_contract_id di un contratto inesistente o cancellato: 400 e nessuna creazione', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.create({ cig_contract: 'CIG1', replaces_contract_id: 99 } as never, 5)).rejects.toThrow('Contratto precedente non trovato.');
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
```

(Se `assertCigAvailable` usa `repo.findOne` invece del query builder, distinguere le chiamate con `mockImplementation` sull'argomento `where`.)

- [ ] **Step 2: Verificare che falliscano**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/contracts --maxWorkers=2`
Expected: FAIL (modulo `replace-contract` mancante, `manager.save` senza il precedente).

- [ ] **Step 3: Implementazione**

`replace-contract.ts`:

```ts
// Contratto sostituito da uno nuovo con le stesse utenze: chiuso e, se la sua
// scadenza manca o va oltre, scade il giorno prima della nuova decorrenza
// (niente sovrapposizioni). Date 'AAAA-MM-GG' confrontate come stringhe.
const isoOf = (v: string | Date): string =>
  v instanceof Date
    ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
    : String(v).slice(0, 10);

const dayBefore = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  return isoOf(new Date(y, m - 1, d - 1));
};

export function replacedContractPatch(
  previousExpiry: string | Date | null | undefined,
  newStart: string | null | undefined,
): { closed: true; supply_expiry_date?: string } {
  if (!newStart) return { closed: true };
  const start = newStart.slice(0, 10);
  if (previousExpiry && isoOf(previousExpiry) < start) return { closed: true };
  return { closed: true, supply_expiry_date: dayBefore(start) };
}
```

`create-contract.dto.ts`:

```ts
  // Rinnovo: contratto che questo sostituisce (stesse utenze), da chiudere.
  @IsOptional()
  @IsInt()
  replaces_contract_id?: number;
```

`contracts.service.ts`, `create`:

```ts
    const { utility_ids, replaces_contract_id, ...rest } = dto;
    // ...controlli CIG invariati...
    const previous = replaces_contract_id
      ? await this.repo.findOne({ where: { id: replaces_contract_id, deleted: false } as never })
      : null;
    if (replaces_contract_id && !previous) throw new BadRequestException('Contratto precedente non trovato.');
    const previousSnapshot: Record<string, unknown> | null = previous ? { ...previous } : null;
    let previousPatch: Record<string, unknown> | null = null;
```

dentro la transazione, dopo il salvataggio delle utenze e prima del `return manager.findOne(...)`:

```ts
      if (previous) {
        previousPatch = replacedContractPatch(previous.supply_expiry_date, rest.supply_start_date);
        Object.assign(previous, previousPatch);
        if (userId !== undefined) previous.updated_by_user_id = userId;
        await manager.save(Contract, previous);
      }
```

dopo `recordAudit(AuditAction.CREATE, ...)`:

```ts
    if (previous && previousSnapshot && previousPatch) {
      try {
        const changes = await this.diffFields(previousSnapshot, previous as unknown as Record<string, unknown>, previousPatch);
        await this.recordAudit(AuditAction.UPDATE, previous.id, userId ?? saved.updated_by_user_id, changes);
      } catch (error) {
        console.error(`[ContractsService] Errore audit del contratto sostituito`, error);
      }
    }
```

- [ ] **Step 4: Test verdi**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/contracts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/apis/contracts/replace-contract.ts backend/src/apis/contracts/replace-contract.spec.ts backend/src/apis/contracts/dto/create-contract.dto.ts backend/src/apis/contracts/contracts.service.ts backend/src/apis/contracts/contracts.service.spec.ts
git commit -m "feat(contracts): nuovo contratto che chiude e sostituisce il precedente"
```

---

### Task 6: Frontend — scheda ed elenco utenze

**Files:**
- Modify: `frontend/src/app/pages/utilities/entity/utility.entity.ts`
- Modify: `frontend/src/app/pages/utilities/utility-edit-dialog.component.ts` / `.html`
- Modify: `frontend/src/app/pages/utilities/data-table-utilities.component.ts` / `.html`
- Modify: `frontend/src/app/pages/utilities/utilities-filters.ts`
- Modify: `frontend/src/app/core/helpers/entity-status.ts`
- Modify: `frontend/src/app/pages/utilities/consumptions/consumption.model.ts`

**Interfaces:**
- Consumes: API di Task 1, 3.
- Produces: `sortSupplyContracts<T>(contracts: T[], today?: string): T[]` in `entity-status.ts`; `HISTORY_MIN_COVERAGE_DAYS = 300` in `consumption.model.ts`.

- [ ] **Step 1: Entity e campo nel form**

`utility.entity.ts`: `supplier_plant_code?: string | null;`

`utility-edit-dialog.component.ts`, nel `form`: `supplier_plant_code: [this.data.item.supplier_plant_code ?? ''],`

Nel blocco che svuota i campi al cambio tipo (dopo la connettività):

```ts
    // Il codice impianto del fornitore esiste solo per le utenze elettriche.
    if (this.selectedHardType !== HardType.LIGHT) {
      this.form.controls.supplier_plant_code.setValue('');
    }
```

`utility-edit-dialog.component.html`, dentro `@if (showLightFields)` dopo «Tensione»:

```html
            <mat-form-field>
              <mat-label>Codice impianto fornitore</mat-label>
              <input matInput formControlName="supplier_plant_code" maxlength="50">
            </mat-form-field>
```

- [ ] **Step 2: Elenco: colonna e filtro**

`data-table-utilities.component.ts`, accanto a `voltage_kw_electric`:

```ts
    {field: 'supplier_plant_code', header: 'Codice impianto fornitore', minWidth: '150px'},
```

`.html`, accanto al `matColumnDef="voltage_kw_electric"`:

```html
  <ng-container matColumnDef="supplier_plant_code">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Codice impianto fornitore</th>
    <td mat-cell *matCellDef="let item">{{ item.supplier_plant_code }}</td>
  </ng-container>
```

`utilities-filters.ts`, accanto a `voltage_kw_electric`:

```ts
    {key: 'supplier_plant_code', label: 'Codice impianto fornitore', type: 'text', group: 'Caratteristiche tecniche'},
```

Se la colonna va aggiunta anche all'elenco delle colonne visibili di default, NON aggiungerla (resta tra le opzionali come la tensione).

- [ ] **Step 3: Ordine dei contratti**

`entity-status.ts`, dopo `supplyContractStatus`:

```ts
// Contratti di fornitura nella scheda utenza: prima quelli in corso, poi per
// decorrenza decrescente; senza decorrenza in fondo; a parità id decrescente.
export function sortSupplyContracts<T extends {id: number; closed?: boolean | null;
  supply_start_date?: Date | string | null; supply_expiry_date?: Date | string | null}>(
  contracts: T[], today = todayIso(),
): T[] {
  const current = (c: T) => (supplyContractStatus(c, today).tone === 'ok' ? 0 : 1);
  const start = (c: T) => (c.supply_start_date ? isoOf(c.supply_start_date) : '');
  return [...contracts].sort((a, b) =>
    current(a) - current(b) || start(b).localeCompare(start(a)) || b.id - a.id);
}
```

`utility-edit-dialog.component.ts`: `contracts: Contract[] = sortSupplyContracts(this.data.item.contratti ?? []);` e in `reloadContracts()` `this.contracts = sortSupplyContracts(contracts);` (import da `../../core/helpers/entity-status`). L'anteprima deriva da `this.contracts`: ordine ereditato.

- [ ] **Step 4: Suggerimento della stima**

`consumption.model.ts`:

```ts
// Gemella di HISTORY_MIN_COVERAGE_DAYS del backend (consumption-calculator.ts).
export const HISTORY_MIN_COVERAGE_DAYS = 300;
```

`estimateHint()` nel dialog utenza, caso `MANUAL` con validità ancora in corso:

```ts
        return until > new Date()
          ? `Manuale, valida fino al ${until.toLocaleDateString('it-IT')} o finché lo storico non copre ${HISTORY_MIN_COVERAGE_DAYS} giorni`
          : 'Manuale scaduta: verrà sostituita dallo storico consumi';
```

- [ ] **Step 5: Build e commit**

Run: `docker exec utenzepa-frontend-1 pnpm run build` (o il container frontend in uso)
Expected: build ok, `check-guida` ok.

```bash
git add frontend/src/app/pages/utilities/entity/utility.entity.ts frontend/src/app/pages/utilities/utility-edit-dialog.component.ts frontend/src/app/pages/utilities/utility-edit-dialog.component.html frontend/src/app/pages/utilities/data-table-utilities.component.ts frontend/src/app/pages/utilities/data-table-utilities.component.html frontend/src/app/pages/utilities/utilities-filters.ts frontend/src/app/core/helpers/entity-status.ts frontend/src/app/pages/utilities/consumptions/consumption.model.ts
git commit -m "feat(utilities): codice impianto fornitore, contratti in ordine, suggerimento stima"
```

---

### Task 7: Frontend — fasce e penale nei consumi

**Files:**
- Modify: `frontend/src/app/pages/utilities/consumptions/consumption.model.ts`
- Modify: `frontend/src/app/pages/utilities/consumptions/consumption-edit-dialog.component.ts`
- Modify: `frontend/src/app/pages/utilities/consumptions/utility-consumptions-tab.component.ts`

**Interfaces:**
- Consumes: API di Task 3; `HISTORY_MIN_COVERAGE_DAYS` (Task 6).
- Produces: `ConsumptionEditDialogData.isElectric?: boolean`; `bandsLabel(row): string`.

- [ ] **Step 1: Modello**

`UtilityConsumption` e `ConsumptionPayload`: aggiungere

```ts
  consumption_f0: number | null;
  consumption_f1: number | null;
  consumption_f2: number | null;
  consumption_f3: number | null;
  reactive_penalty: boolean | null;
```

e la funzione

```ts
// Fasce in forma compatta per la tabella: «F1 1.234 · F2 567 · F3 890» (F0 solo se valorizzata).
export function bandsLabel(r: Pick<UtilityConsumption, 'consumption_f0' | 'consumption_f1' | 'consumption_f2' | 'consumption_f3'>): string {
  return ([['F0', r.consumption_f0], ['F1', r.consumption_f1], ['F2', r.consumption_f2], ['F3', r.consumption_f3]] as const)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `${k} ${formatQty(v)}`)
    .join(' · ');
}
```

- [ ] **Step 2: Dialog**

`ConsumptionEditDialogData`: `isElectric?: boolean;`. Import `MatCheckboxModule`.

Form:

```ts
    consumption_f0: [this.data.item?.consumption_f0 ?? null as number | null],
    consumption_f1: [this.data.item?.consumption_f1 ?? null as number | null],
    consumption_f2: [this.data.item?.consumption_f2 ?? null as number | null],
    consumption_f3: [this.data.item?.consumption_f3 ?? null as number | null],
    reactive_penalty: [this.data.item?.reactive_penalty ?? false],
```

Template, nel ramo `@else` (periodo), dopo il `div` con Dal/Al/Consumo:

```html
          @if (data.isElectric) {
            <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
              @for (f of bandFields; track f.key) {
                <mat-form-field style="flex: 1 1 20%;">
                  <mat-label>{{ f.label }}</mat-label>
                  <input matInput type="number" min="0" [formControlName]="f.key">
                </mat-form-field>
              }
            </div>
            <p style="margin: -0.5rem 0 0; font-size: 0.8rem; color: var(--app-muted);">
              Fasce facoltative; se compilate, la somma deve coincidere col consumo.
            </p>
            <mat-checkbox formControlName="reactive_penalty">Penale per energia reattiva</mat-checkbox>
          }
```

con

```ts
  readonly bandFields = [
    {key: 'consumption_f0', label: 'F0 (monoraria)'},
    {key: 'consumption_f1', label: 'F1'},
    {key: 'consumption_f2', label: 'F2'},
    {key: 'consumption_f3', label: 'F3'},
  ] as const;
```

In `save()` (le fasce viaggiano solo per periodo elettrico; il backend le azzera comunque altrove):

```ts
    const bands = !isReading && this.data.isElectric;
    const num = (x: number | null | undefined) => (bands && x !== null && x !== undefined && String(x) !== '' ? Number(x) : null);
    // nel payload:
      consumption_f0: num(v.consumption_f0),
      consumption_f1: num(v.consumption_f1),
      consumption_f2: num(v.consumption_f2),
      consumption_f3: num(v.consumption_f3),
      reactive_penalty: bands ? !!v.reactive_penalty : null,
```

L'errore di somma arriva dal backend come 400 e viene già mostrato in `error`.

- [ ] **Step 3: Tab Consumi**

`openDialog`: `data: {utilityId: this.utilityId, meterNumber: this.meterNumber, item, isElectric: this.summary?.unit === 'kWh'}`.

Tabella: nuova colonna dopo «Consumo», visibile solo se `summary?.unit === 'kWh'`:

```html
                @if (summary?.unit === 'kWh') { <th style="padding: 6px;">Fasce</th> }
...
                  @if (summary?.unit === 'kWh') {
                    <td style="padding: 6px; white-space: nowrap;">
                      {{ bandsLabel(row) }}
                      @if (row.reactive_penalty) {
                        <mat-icon style="font-size: 18px; height: 18px; width: 18px; vertical-align: middle; color: var(--tone-warn-fg);"
                                  matTooltip="Penale per energia reattiva">bolt</mat-icon>
                      }
                    </td>
                  }
```

(`readonly bandsLabel = bandsLabel;` nel componente.)

Badge della stima: caso `MANUAL` ancora valida ma con copertura sufficiente:

```ts
    if (s.estimated_source === 'MANUAL') {
      if (s.coverage_days >= HISTORY_MIN_COVERAGE_DAYS) {
        return {text: 'Manuale — sarà sostituita dallo storico al prossimo ricalcolo', bg: 'var(--tone-warn-bg)', fg: 'var(--tone-warn-fg)'};
      }
      // ...rami esistenti
    }
```

- [ ] **Step 4: Build e commit**

Run: build frontend come in Task 6.
Expected: ok.

```bash
git add frontend/src/app/pages/utilities/consumptions/consumption.model.ts frontend/src/app/pages/utilities/consumptions/consumption-edit-dialog.component.ts frontend/src/app/pages/utilities/consumptions/utility-consumptions-tab.component.ts
git commit -m "feat(consumptions): fasce F0-F3 e penale reattiva nel dialog e nel tab consumi"
```

---

### Task 8: Frontend — «Nuovo contratto con queste utenze»

**Files:**
- Modify: `frontend/src/app/pages/contracts/entity/contract.entity.ts`
- Modify: `frontend/src/app/core/services/entity-navigator.service.ts` (`createSupplyContract`)
- Modify: `frontend/src/app/pages/contracts/contract-edit-dialog.component.ts` / `.html`

**Interfaces:**
- Consumes: `replaces_contract_id` (Task 5).
- Produces: `ContractDialogExtra.replacesContract?: {id: number; label: string}`; `createSupplyContract(utilityIds, prefill = {}, replacesContract?: {id: number; label: string})`.

- [ ] **Step 1: Entity e navigatore**

`contract.entity.ts`: `replaces_contract_id?: number | null;`

`entity-navigator.service.ts`:

```ts
  createSupplyContract(
    utilityIds: number[], prefill: Partial<Contract> = {}, replacesContract?: {id: number; label: string},
  ): Observable<Contract | null> {
    return this.sheet<EditDialogData<Contract> & ContractDialogExtra, Contract>(
      CONTRACT_DIALOG, {mode: 'create', item: Contract.create(prefill), preselectedUtilityIds: utilityIds, replacesContract},
    ).pipe(
      switchMap(r => (r ? this.contracts.create(r) : of(null))),
      catchError(err => this.fail('Errore nella creazione del contratto di fornitura', err)),
    );
  }
```

(import `ContractDialogExtra` come tipo da `pages/contracts/contract-edit-dialog.component` con `import type`, per non caricare il componente.)

- [ ] **Step 2: Casella nel dialog di creazione**

`ContractDialogExtra`: `replacesContract?: {id: number; label: string};`

Form: `close_replaced: [true],`. Template (Riepilogo, in testa alla griglia, solo se `isNew && data.replacesContract`):

```html
        @if (isNew && data.replacesContract) {
          <mat-checkbox formControlName="close_replaced" class="span-2">
            Chiudi il contratto precedente ({{ data.replacesContract.label }})
          </mat-checkbox>
        }
```

`save()`:

```ts
    const {close_replaced, ...values} = this.form.getRawValue();
    const result = plainToInstance(Contract, {
      id: this.data.item.id,
      ...values,
      ...(this.isNew && this.data.replacesContract && close_replaced ? {replaces_contract_id: this.data.replacesContract.id} : {}),
    });
```

- [ ] **Step 3: Azione nella scheda del contratto esistente**

`.html`, in `sheetActions` prima di «Annulla»:

```html
    @if (canEdit && !isNew && form.controls.utility_ids.value.length) {
      <button mat-stroked-button type="button" (click)="renewWithUtilities()">Nuovo contratto con queste utenze</button>
    }
```

`.ts`:

```ts
  // Rinnovo: nuovo contratto con le stesse utenze e i dati stabili del
  // fornitore; il backend chiude il precedente (se spuntato) e la scheda
  // riallinea chiuso/scadenza, così un Salva successivo non lo riapre.
  renewWithUtilities(): void {
    if (this.form.dirty) {
      this.toast.add({severity: 'warn', summary: 'Modifiche non salvate', detail: 'Salva o annulla le modifiche prima di creare il nuovo contratto.'});
      return;
    }
    const v = this.form.getRawValue();
    const prefill: Partial<Contract> = {
      supplier_id_fk: v.supplier_id_fk ?? undefined,
      contract_kind: v.contract_kind ?? undefined,
      consip_agreement_id: v.consip_agreement_id ?? undefined,
      maintenance_included: v.maintenance_included ?? false,
    };
    const label = this.titleText();
    this.navigator.createSupplyContract(v.utility_ids ?? [], prefill, {id: this.data.item.id, label}).subscribe(created => {
      if (!created) return;
      this.contractsService.getById(this.data.item.id).subscribe(fresh => {
        this.form.patchValue({closed: fresh.closed ?? false, supply_expiry_date: this.toDate(fresh.supply_expiry_date)});
        this.form.markAsPristine();
        this.data.item.closed = fresh.closed;
        this.data.item.supply_expiry_date = fresh.supply_expiry_date;
      });
      this.toast.add({severity: 'success', summary: 'Nuovo contratto creato', detail: 'Le utenze sono collegate al nuovo contratto.'});
    });
  }
```

Iniettare `ToastService` e `ContractsService` se non già presenti (controllare gli `inject` esistenti nel componente); `titleText()` esiste già.

- [ ] **Step 4: Build e commit**

Run: build frontend.
Expected: ok.

```bash
git add frontend/src/app/pages/contracts/entity/contract.entity.ts frontend/src/app/core/services/entity-navigator.service.ts frontend/src/app/pages/contracts/contract-edit-dialog.component.ts frontend/src/app/pages/contracts/contract-edit-dialog.component.html
git commit -m "feat(contracts): nuovo contratto con le utenze di uno esistente"
```

---

### Task 9: Guida, versione, verifica reale, PR

**Files:**
- Modify: `frontend/public/guida/guida.md`
- Modify: `publiccode.yml`

- [ ] **Step 1: Guida**

Data in testa `_Ultimo aggiornamento: 2026-10-14_`. Aggiornare senza rinominare titoli citati da ancore:
- sezione utenze: «Codice impianto fornitore» (solo elettriche);
- sezione consumi: fasce F0–F3 facoltative con somma uguale al consumo (tolleranza 1 kWh), «Penale per energia reattiva»; stima manuale valida 12 mesi **o finché lo storico non copre 300 giorni**;
- segnalazioni utenze: «Penali per energia reattiva» (penale in un periodo terminato negli ultimi 12 mesi: impianto da rifasare);
- contratti di fornitura: ordine nella scheda utenza; «Nuovo contratto con queste utenze» e «Chiudi il contratto precedente» (scadenza al giorno prima della nuova decorrenza).

Run: build frontend (esegue `check-guida`). Expected: ok.

- [ ] **Step 2: publiccode.yml**

`softwareVersion: 1.27.0`, `releaseDate: 2026-10-14`.

- [ ] **Step 3: Test backend rilevanti e lint**

```bash
docker exec utenzepa-api-1 pnpm exec jest src/apis/utility-consumptions src/apis/anomalies src/apis/contracts src/apis/utility --maxWorkers=2
docker exec utenzepa-api-1 pnpm run lint
git diff --numstat   # scartare con git checkout -- i file "0 0"
```

- [ ] **Step 4: Verifica reale con Playwright (utente temporaneo, eliminato dopo)**

1. Utenza elettrica con consumi CH80: tab Consumi → nuovo periodo con F1+F2 ≠ consumo → messaggio d'errore esatto; correggere → salvato; colonna Fasce visibile; spuntare la penale → elenco utenze, segnalazione «Penali per energia reattiva» include l'utenza.
2. Utenza gas: il dialog del consumo non mostra fasce né penale.
3. Scheda utenza con più contratti: in corso in alto, poi per decorrenza decrescente.
4. Contratto con utenze → «Nuovo contratto con queste utenze» → casella spuntata, decorrenza 01/07/2026, CIG di prova → salvato; la scheda del vecchio mostra «Chiuso» e scadenza 30/06/2026; Salva sulla vecchia scheda → resta chiuso.
5. Pulizia: eliminare i dati di prova creati, `DELETE FROM audit_logs WHERE user_id=<temp>`, ripristinare `updated_by_user_id`/`update_date` dei record toccati, eliminare l'utente temporaneo.

- [ ] **Step 5: Commit e PR**

```bash
git add frontend/public/guida/guida.md publiccode.yml
git commit -m "docs(guida): dati tecnici elettrici, rinnovo contratti, stima da storico (v1.27.0)"
git push -u origin feat/dati-tecnici-elettrici
gh pr create --title "feat: dati tecnici delle utenze elettriche, rinnovo contratti, stima da storico (v1.27.0)" --body "<riepilogo + note di rilascio: migration automatica; dati CH80 portati col backup e ripristino>"
```

Merge e tag solo con l'ok dell'utente.

---

## Dopo il merge (fuori dal repo, DB locale)

Script in `.audit-w/ch80/` via API PATCH: fasce F0–F3 e `reactive_penalty` (importo reattiva > 0 nel mese) sui 3.400 consumi CH80; `supplier_plant_code` = colonna «Impianto» sui 181 POD. Poi verifica: segnalazione con ~31 utenze, stime passate a «Da storico» dopo il ricalcolo.

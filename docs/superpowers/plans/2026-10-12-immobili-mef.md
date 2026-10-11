# Immobili: unità catastali e dati MEF — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** catasto dell'immobile in N unità catastali, campi MEF non ricavabili sull'immobile, tipologia/finalità MEF sulla funzione, utilizzo/titolo/stato di accatastamento calcolati, tab "Catasto e patrimonio".

**Architecture:** tabella `asset_cadastral_units` (OneToMany da `Asset`, sostituita in blocco al salvataggio come le righe fattura); colonne MEF su `assets` e `asset_functions` con enum dei domini MEF 2025 (gemelli backend/frontend); calcoli puri in `apis/asset/asset-mef.ts` esposti come `mef` nelle risposte dell'immobile; anomalie nuove in `AnomaliesService`.

**Tech Stack:** NestJS 11 + TypeORM/MySQL 8, Jest; Angular 22 + Material; Playwright.

**Spec:** `docs/superpowers/specs/2026-10-12-immobili-mef-design.md`

## Global Constraints

- Branch `feat/mef-immobili` (parte da `feat/complessi`, PR #218 non ancora in `main`).
- Comandi Docker uno alla volta; jest `--maxWorkers=2` sui file toccati; mai `git add .`; file CRLF modificati preservando `\r\n`.
- Migration in `backend/.scratch/` e spostata a contenuto finale; migration che sposta dati: SELECT di controllo prima di ogni DDL, test con QueryRunner simulato in `src/database/*.migration.spec.ts`, ciclo reale up → down → up confrontando i dati.
- Colonne stringa nullable con `type: 'varchar'`; enum con valori e codici dei domini MEF 2025 della spec, copiati alla lettera.
- Errori 400 con messaggio, mai 409. `invalidWhereValuesBehavior = 'throw'`.
- Frontend: `ChangeDetectionStrategy.Eager`, colori da token, tab con `aria-label` = etichetta, `markAllAsTouched` + pallino rosso con form invalido.
- Guida operatori aggiornata nella stessa PR con la data in testa; `softwareVersion: "v1.19.0"`.
- Anomalie: query nuove in fondo a `getAnomalies()`, alias tabella `b` (non `a`, per non intercettare i test che cercano `FROM assets a`).

## Review Focus

1. **PATCH immobile senza `cadastral_units`** (es. salvataggio da altre schede o API): unità invariate. Test in Task 3.
2. **Unità con foglio o particella vuoti**: 400 lato API, pallino rosso lato UI, niente unità a metà. Test in Task 3.
3. **Utilizzo con contratto passivo o scaduto**: non è "Dato a terzi" (solo contratti ACTIVE con stato mostrato attivo/in scadenza). Test in Task 1.
4. **Migration su immobile con foglio senza particella**: si ferma prima di ogni DDL con messaggio. Test in Task 2.
5. **Down della migration con più unità per immobile**: ricopia la prima, nessun errore. Test in Task 2.

---

### Task 1: Domini MEF e calcoli

**Files:**
- Create: `backend/src/apis/asset/enum/mef-domains.enum.ts`
- Create: `backend/src/apis/asset/asset-mef.ts`
- Test: `backend/src/apis/asset/asset-mef.spec.ts`

**Interfaces:**
- Produces: enum `LegalNature`, `ConstructionPeriod`, `HeritageConstraint`, `MefBuildingType`, `MefPurpose`, `MefUsage`, `CadastralStatus` e le mappe `MEF_CODE_*` (valore → codice numerico MEF); `computeAssetMef(input: AssetMefInput, today: string): AssetMef` con
  - `AssetMefInput = { ownership: number; status: string | null; cadastral_unit_count: number; function: { mef_building_type: MefBuildingType | null; mef_purpose: MefPurpose | null } | null; grants: { id: number; direction: string; status: ContractStatus; end_date: string | null; tacit_renewal: boolean; renewal_months: number | null; notice_months: number | null; deleted?: boolean }[] }`
  - `AssetMef = { usage: MefUsage; usage_grant_id: number | null; title: 'PROPERTY' | null; cadastral_status: CadastralStatus; building_type: MefBuildingType | null; purpose: MefPurpose | null }`

- [ ] **Step 1: Enum.** `mef-domains.enum.ts` con gli enum e i valori/codici esatti della spec (sezioni "Colonne nuove su assets" e "asset_functions"), più:

```ts
export enum MefUsage {
  DIRECT = 'DIRECT', // Utilizzato direttamente (1)
  UNUSABLE = 'UNUSABLE', // Inutilizzabile (2)
  THIRD_PARTIES = 'THIRD_PARTIES', // Dato interamente a uno o più soggetti terzi (5)
}
export enum CadastralStatus {
  REGISTERED = 'REGISTERED', // ACCATASTATO
  NOT_REGISTERED = 'NOT_REGISTERED', // NON_ACCATASTATO
}
```

e per ogni enum la mappa `export const MEF_CODE_<NOME>: Record<Enum, number>` con i codici della spec.

- [ ] **Step 2: Test (rosso).** `asset-mef.spec.ts`:

```ts
import { computeAssetMef } from './asset-mef';
import { ContractStatus } from '@apis/utilizer-grant/enum/real-estate-contract.enum';

const base = {
  ownership: 1,
  status: 'Attivo',
  cadastral_unit_count: 1,
  function: { mef_building_type: 'SCHOOL', mef_purpose: 'EDUCATION' },
  grants: [],
} as never;
const grant = (over: Record<string, unknown> = {}) => ({
  id: 7, direction: 'ACTIVE', status: ContractStatus.ACTIVE, end_date: '2030-01-01',
  tacit_renewal: false, renewal_months: null, notice_months: null, ...over,
});
const today = '2026-10-12';

describe('computeAssetMef', () => {
  it('senza contratti: utilizzo diretto, finalità dalla funzione', () => {
    expect(computeAssetMef(base, today)).toEqual({
      usage: 'DIRECT', usage_grant_id: null, title: 'PROPERTY',
      cadastral_status: 'REGISTERED', building_type: 'SCHOOL', purpose: 'EDUCATION',
    });
  });
  it('contratto attivo in corso: dato a terzi, niente finalità', () => {
    const r = computeAssetMef({ ...(base as object), grants: [grant()] } as never, today);
    expect(r).toMatchObject({ usage: 'THIRD_PARTIES', usage_grant_id: 7, purpose: null });
  });
  it('contratto in scadenza conta come attivo', () => {
    const r = computeAssetMef({ ...(base as object), grants: [grant({ end_date: '2026-12-01' })] } as never, today);
    expect(r.usage).toBe('THIRD_PARTIES');
  });
  it('contratto scaduto, passivo o restituito: non dato a terzi', () => {
    for (const g of [grant({ end_date: '2020-01-01' }), grant({ direction: 'PASSIVE' }), grant({ status: ContractStatus.RETURNED }), grant({ deleted: true })]) {
      expect(computeAssetMef({ ...(base as object), grants: [g] } as never, today).usage).toBe('DIRECT');
    }
  });
  it('immobile dismesso: inutilizzabile', () => {
    expect(computeAssetMef({ ...(base as object), status: 'Dismesso' } as never, today).usage).toBe('UNUSABLE');
  });
  it('non di proprietà: nessun titolo; senza unità: non accatastato; senza funzione: tipologia e finalità nulle', () => {
    const r = computeAssetMef({ ...(base as object), ownership: 0, cadastral_unit_count: 0, function: null } as never, today);
    expect(r).toMatchObject({ title: null, cadastral_status: 'NOT_REGISTERED', building_type: null, purpose: null });
  });
});
```

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/asset/asset-mef.spec.ts --maxWorkers=2` → FAIL (modulo mancante).

- [ ] **Step 3: Implementazione.** `asset-mef.ts`:

```ts
import { ContractDirection, ContractStatus, DisplayStatus } from '@apis/utilizer-grant/enum/real-estate-contract.enum';
import { displayStatus } from '@apis/utilizer-grant/real-estate-contract.calc';
import { CadastralStatus, MefBuildingType, MefPurpose, MefUsage } from './enum/mef-domains.enum';

export interface AssetMefInput {
  ownership: number;
  status: string | null;
  cadastral_unit_count: number;
  function: { mef_building_type: MefBuildingType | null; mef_purpose: MefPurpose | null } | null;
  grants: {
    id: number; direction: string; status: ContractStatus; end_date: string | null;
    tacit_renewal: boolean; renewal_months: number | null; notice_months: number | null; deleted?: boolean;
  }[];
}

export interface AssetMef {
  usage: MefUsage;
  usage_grant_id: number | null;
  title: 'PROPERTY' | null;
  cadastral_status: CadastralStatus;
  building_type: MefBuildingType | null;
  purpose: MefPurpose | null;
}

const ACTIVE_DISPLAY = new Set([DisplayStatus.ACTIVE, DisplayStatus.EXPIRING]);

// Dati MEF ricavati (nessun campo salvato): utilizzo dai contratti attivi e
// dallo stato, titolo dalla proprietà, stato di accatastamento dalle unità,
// tipologia e finalità dalla funzione (finalità solo con utilizzo diretto,
// come nel censimento MEF).
export function computeAssetMef(a: AssetMefInput, today: string): AssetMef {
  const grant = a.grants.find(
    (g) => !g.deleted && g.direction === ContractDirection.ACTIVE && ACTIVE_DISPLAY.has(displayStatus(g, today)),
  );
  const usage = grant ? MefUsage.THIRD_PARTIES : a.status === 'Dismesso' ? MefUsage.UNUSABLE : MefUsage.DIRECT;
  return {
    usage,
    usage_grant_id: grant?.id ?? null,
    title: a.ownership === 1 ? 'PROPERTY' : null,
    cadastral_status: a.cadastral_unit_count > 0 ? CadastralStatus.REGISTERED : CadastralStatus.NOT_REGISTERED,
    building_type: a.function?.mef_building_type ?? null,
    purpose: usage === MefUsage.DIRECT ? (a.function?.mef_purpose ?? null) : null,
  };
}
```

(Verificare che `AssetStatusEnum.DISMESSO` valga `'Dismesso'`; usare l'enum.)

- [ ] **Step 4: Verde.** Stesso comando → PASS 6 test.
- [ ] **Step 5: Commit** `feat(backend): domini MEF e calcolo dei dati MEF dell'immobile`.

---

### Task 2: Migration, entity e dati spostati

**Files:**
- Create: `backend/src/apis/asset/entity/asset-cadastral-unit.entity.ts`
- Modify: `backend/src/apis/asset/entity/asset.entity.ts`, `backend/src/apis/asset-functions/entity/asset-function.entity.ts`
- Create: `backend/src/database/migrations/1793700000000-AssetCadastralUnits.ts` (via `.scratch`)
- Test: `backend/src/database/asset-cadastral-units.migration.spec.ts`

**Interfaces:**
- Consumes: enum Task 1.
- Produces: entity `AssetCadastralUnit { id, asset_id, section, sheet, parcel, subordinate, category, cadastral_income, asset }`; `Asset.cadastralUnits`; colonne `Asset.mef_id, legal_nature, reference_area_sqm, appurtenance_area_sqm, volume_m3, construction_period, heritage_constraint, federal_transfer, confiscated`; `AssetFunction.mef_building_type, mef_purpose`. Rimosse da `Asset`: `sheet, parcel, subordinate, category, cadastral_value`.

- [ ] **Step 1: Test migration (rosso).** Runner simulato come `merge-utility-notes.migration.spec.ts`: la prima SELECT di controllo restituisce `[{ n: X }]`; casi: `n = 0` → DDL eseguite in ordine (CREATE TABLE prima di INSERT…SELECT, DROP COLUMN `sheet` dopo l'INSERT); `n = 2` → errore "2 immobili con foglio senza particella o viceversa" e nessuna DDL; `down` contiene l'UPDATE dalla prima unità (`MIN(id)`) prima del DROP TABLE.
- [ ] **Step 2: Entity e enum sulle entity** (colonne della spec). `AssetCadastralUnit`: `@ManyToOne(() => Asset, a => a.cadastralUnits, { onDelete: 'CASCADE' })`, `@Index(['sheet','parcel'])`. `Asset`: `@OneToMany(() => AssetCadastralUnit, u => u.asset, { cascade: true }) cadastralUnits`.
- [ ] **Step 3: DDL di riferimento** con `migration:generate` in `.scratch`, tenere solo gli statement della feature.
- [ ] **Step 4: Migration** (scratch → migrations): `up` = SELECT di controllo (`SELECT COUNT(*) n FROM assets WHERE deleted IN (0,1) AND ((sheet IS NULL OR sheet='') <> (parcel IS NULL OR parcel=''))`) → CREATE TABLE + FK + indice → `INSERT INTO asset_cadastral_units (asset_id, section, sheet, parcel, subordinate, category, cadastral_income) SELECT id, NULL, TRIM(sheet), TRIM(parcel), NULLIF(TRIM(subordinate),''), NULLIF(TRIM(category),''), cadastral_value FROM assets WHERE sheet IS NOT NULL AND sheet<>'' AND parcel IS NOT NULL AND parcel<>''` → ALTER assets (ADD nuove, DROP cinque) → ALTER asset_functions (ADD due). `down` = ADD le cinque colonne con i tipi originali → UPDATE assets da prima unità → DROP colonne nuove → DROP TABLE.
- [ ] **Step 5: Test verdi**, poi DB reale: conteggio prima (`SELECT COUNT(*) FROM assets WHERE sheet<>'' AND parcel<>''` = 58) e dopo (righe unità = 58, confronto puntuale foglio/particella/sub/categoria/rendita salvato in `.scratch/units-before.tsv` vs dopo); `schema:log` pulito; ciclo revert → run con confronto dei dati.
- [ ] **Step 6: Commit** `feat(backend): unità catastali e colonne MEF (migration con spostamento dati)`.

---

### Task 3: Service e DTO immobile

**Files:**
- Create: `backend/src/apis/asset/dto/cadastral-unit.dto.ts`
- Modify: `create-asset.dto.ts`, `update-asset.dto.ts`, `search-asset.dto.ts`, `assets.service.ts`, `assets.module.ts`
- Test: `backend/src/apis/asset/assets.service.spec.ts`

**Interfaces:**
- Consumes: Task 1–2.
- Produces: `cadastral_units?: CadastralUnitDto[]` (create/update), campi MEF modificabili nei DTO (non `mef_id`), filtri `sheet`, `parcel`, `legal_nature`, `usage`; risposte con `cadastralUnits` e `mef: AssetMef`.

- [ ] **Step 1: Test (rosso)** nello spec esistente (mock `unitRepo` con `delete`, `insert`/`save`, `find`): update con `cadastral_units` → delete per `asset_id` + inserimento delle nuove, audit `cadastral_units` solo se il testo ordinato cambia; update senza `cadastral_units` → nessuna chiamata a `unitRepo`; `findAll({ sheet: '16' })` → `andWhere` con `EXISTS (SELECT 1 FROM asset_cadastral_units ...)` e parametro; `findAll({ usage: 'THIRD_PARTIES' })` filtra in memoria su `mef.usage`.
- [ ] **Step 2: DTO.** `CadastralUnitDto`: `section` (opt, max 5), `sheet` e `parcel` (`IsNotEmpty`, max 50, `Transform` trim), `subordinate`, `category` (opt), `cadastral_income` (opt `IsNumber`). Create/Update: `@IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CadastralUnitDto) cadastral_units?`; enum MEF con `IsEnum`, decimali `IsNumber`, booleani nullable. Search: rimuovere `subordinate`, `category`, `cadastral_value`; `sheet`, `parcel` restano (gestiti a mano, esclusi da `applyFilters`); aggiungere `legal_nature` (IsEnum) e `usage` (IsEnum MefUsage).
- [ ] **Step 3: Service.** `create`/`update`: estrarre `cadastral_units`, chiamare `super.*` col resto, poi `replaceUnits(assetId, units, userId, before)`; `findAll`/`findOne` con `leftJoinAndSelect('assets.cadastralUnits', 'cadastralUnits')`, filtri EXISTS su sheet/parcel, `legal_nature` via applyFilters, mappa finale `withMef(asset)` = `{...asset, mef: computeAssetMef({...}, todayIso())}`, filtro `usage` in memoria.
- [ ] **Step 4: Verde** `jest src/apis/asset`.
- [ ] **Step 5: Commit** `feat(backend): unità catastali e dati MEF nell'API immobili`.

---

### Task 4: Funzioni immobile e anomalie

**Files:**
- Modify: `backend/src/apis/asset-functions/dto/create-asset-function.dto.ts`, `update-asset-function.dto.ts`
- Modify: `backend/src/apis/anomalies/anomalies.service.ts`
- Test: `backend/src/apis/anomalies/anomalies.service.spec.ts`

- [ ] **Step 1: Test (rosso)**: quattro test con `mockImplementation` per marcatore SQL (`/* assets_without_cadastre */` ecc.), ciascuno verifica il conteggio e i campi (`id`, `asset_name`).
- [ ] **Step 2: DTO funzioni**: `mef_building_type?: MefBuildingType | null` e `mef_purpose?: MefPurpose | null` (`IsOptional`, `IsEnum`).
- [ ] **Step 3: Query** in fondo a `getAnomalies()` (alias `b`):
  - `assets_without_cadastre`: `b.deleted=0 AND b.ownership=1 AND NOT EXISTS (unità)`;
  - `assets_without_mef_id`: `b.deleted=0 AND b.ownership=1 AND b.mef_id IS NULL` e natura "Fabbricato" (`JOIN asset_natures n ON n.id=b.nature_id AND n.name='Fabbricato'`);
  - `units_without_subordinate`: immobili con un'unità senza sub e almeno un altro immobile con stesso foglio e particella;
  - `functions_without_mef_type`: funzioni non cancellate senza `mef_building_type` usate da immobili di proprietà (`{ id, name }`).
  Tipi in `Anomalies`; aggiunte alla risposta con `list(...)`.
- [ ] **Step 4: Verde** `jest src/apis/anomalies src/apis/asset-functions`.
- [ ] **Step 5: Commit** `feat(backend): tipologia/finalità MEF sulle funzioni e anomalie catasto/MEF`.

---

### Task 5: Frontend — domini, entity, funzioni

**Files:**
- Create: `frontend/src/app/pages/assets/mef-domains.ts` (etichette dei 7 enum, gemelle del backend)
- Modify: `frontend/src/app/pages/assets/entity/asset.entity.ts`, `asset.interface.ts` (unità, campi MEF, `mef` sola lettura con `@Exclude({toPlainOnly:true})`), rimozione dei cinque campi
- Modify: `frontend/src/app/pages/asset-function/entity/*`, `asset-function-edit-dialog.component.{ts,html}` (due `mat-select`), `data-table-asset-function.component.*` (colonna "Tipologia MEF")

- [ ] Steps: scrivere i file, `pnpm run build` verde, commit `feat(frontend): domini MEF e tipologia/finalità sulle funzioni`.

---

### Task 6: Frontend — tab "Catasto e patrimonio"

**Files:**
- Modify: `frontend/src/app/pages/assets/asset-edit-dialog.component.{ts,html}`

- [ ] Steps:
  1. form: rimuovere `category, sheet, parcel, subordinate, cadastral_value`; aggiungere `cadastral_units: FormArray<FormGroup>` (section, sheet* , parcel*, subordinate, category, cadastral_income) e i campi MEF modificabili;
  2. tab `aria-label="Catasto e patrimonio"`, quattro sezioni come da spec (tabella unità con input in riga, "Aggiungi unità", rimuovi con `ConfirmDialogComponent`; Consistenza; Patrimonio; `mat-expansion-panel` "Per il MEF" chiuso con i valori di `data.item.mef` e link al contratto `navigator.openGrant` e all'anagrafica funzioni `/asset-function`);
  3. pallino: valori di unità/consistenza/patrimonio; errore se unità invalide;
  4. `save()`: `cadastral_units` mappate (stringhe trim, vuote → null, rendita numero) solo se il FormArray è dirty o l'immobile è nuovo;
  5. build verde; commit `feat(frontend): tab Catasto e patrimonio nella scheda immobile`.

---

### Task 7: Frontend — elenco immobili

**Files:**
- Modify: `data-table-assets.component.{ts,html}`, `assets-filters.ts`

- [ ] Steps: colonne "Catasto" (unità come "fg X part Y sub Z", separate da virgola), "Natura giuridica", "Utilizzo", "Id MEF" (nascoste di default; rimosse le cinque colonne vecchie, chiave colonne salvata `columns:assets:v3`); filtri Foglio/Particella (testo), Natura giuridica, Utilizzo (select); rimosso il filtro categoria/subalterno/valore catastale; `ASSET_SIGNALS` + "Senza catasto", "Senza Id MEF", "Sub da assegnare"; segnalazione funzioni "Senza tipologia MEF" nell'elenco funzioni se esiste il pattern signals lì (altrimenti solo nella guida). Build verde; commit `feat(frontend): catasto e dati MEF nell'elenco immobili`.

---

### Task 8: Guida, versione, E2E, PR

- [ ] Guida: data, sezione "Catasto e dati di patrimonio" (ancora `catasto-e-dati-di-patrimonio`), righe segnalazioni (Immobili: + Senza catasto · Senza Id MEF · Sub da assegnare; Funzioni: Senza tipologia MEF se presente), funzioni (tipologia/finalità MEF).
- [ ] `publiccode.yml` `v1.19.0`.
- [ ] Test backend dei moduli toccati, type-check, `ng build`.
- [ ] E2E (utente temporaneo): immobile con unità migrate visibile; aggiungi seconda unità, salva, riapri; campo natura giuridica; riquadro "Per il MEF" con utilizzo da contratto su un immobile con locazione attiva; segnalazione "Senza catasto"; funzione con tipologia MEF. Pulizia.
- [ ] Revisione finale (subagente), correzioni, push e PR verso `main` (dipende da #218), descrizione con la nota di rilascio (migration che sposta il catasto nelle unità).

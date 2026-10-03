# Aggregati utenze eliminati e costi a carico calcolati — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminare gli aggregati utenze e la lista "Costi a carico di", sostituendo il primo con filtri su Funzione immobile/Tipo impianto e il secondo con un valore calcolato dai contratti immobiliari (release v1.9.0).

**Architecture:** "A carico di" è una funzione pura (`costPayers`) sui contratti immobiliari che `UtilitiesService` già carica con l'utenza (`assets.utilizerGrants.parties`), aggiunta a ogni risposta come `cost_payers`. I filtri nuovi sono sotto-query `EXISTS` (solo WHERE). Due migration di solo schema rimuovono colonne e tabelle; le correzioni dati si fanno una volta sola sul DB locale, prima delle migration, con SQL nello scratchpad.

**Tech Stack:** NestJS 11 + TypeORM/MySQL 8, Jest; Angular 22 + Material; Playwright MCP per E2E.

**Spec:** `docs/superpowers/specs/2026-10-03-eliminazione-aggregati-utenze-design.md`, `docs/superpowers/specs/2026-10-03-costi-a-carico-calcolato-design.md`

## Global Constraints

- Dati: correzioni one-shot solo sul DB locale (SQL nello scratchpad, mai nel repo, mai in una migration); la produzione si allinea con export/import.
- Nessun dato personale (nomi, CF, PEC) in doc, test, commit: solo id o nomi fittizi.
- Migration: scritte in `backend/.scratch/`, spostate in `backend/src/database/migrations/` solo a contenuto finale (il watcher le esegue subito). Le correzioni dati del Task 1 vanno fatte PRIMA di spostare le migration: dopo, colonne e tabelle non esistono più.
- Comandi Docker uno alla volta, mai in parallelo. Jest sempre con `--maxWorkers=2`, file singoli (`pnpm exec jest <path> --maxWorkers=2`); la suite completa la fa la CI.
- Dopo `pnpm run lint` nel container: scartare i file con `git diff --numstat` `0 0` e la formattazione di file non toccati.
- `git add` sempre con file espliciti.
- Conflitti/errori di validazione: HTTP 400 con messaggio UI, mai 409.
- Frontend: nessun test eseguibile; verifica = log `ng serve` (`docker logs --since 60s utenzepa-frontend-1 2>&1 | grep -E "✘|generation"`) + E2E Playwright.
- Query MySQL monoriga: `docker exec utenzepa-mysql-1 mysql -uroot -p"$P" mydatabase --default-character-set=utf8mb4 -e "..."` con `P=$(grep '^MYSQL_PASSWORD=' .env | cut -d= -f2-)`.

## Review Focus

- Contratto immobiliare con `utilities_to_be_taken_over` restituito da MySQL come `1`/`0` invece di boolean: il calcolo deve trattarlo come vero/falso (test con `1`).
- Parte o contratto cancellati (`deleted`) caricati comunque dal join: non devono comparire tra i paganti (test).
- Filtri multipli con stringa vuota o un solo valore in query string (`asset_function_ids=` / `asset_function_ids=3`): nessun filtro / filtro su un valore, mai 400 (test DTO).
- Utenza nuova creata senza `costs_borne_by_id_fk` dopo la migration: deve salvare (verificato in E2E creando un'utenza).
- Scheda utenza aperta dalla riga dell'elenco (dati di `findAll`, non `findOne`): il riquadro "A carico di" deve essere pieno anche lì (E2E apre dalla riga).

---

### Task 1: Correzioni dati sul DB locale (con conferma dell'utente)

**Files:** nessun file del repo. SQL e CSV nello scratchpad.

Ogni lista va mostrata all'utente (solo id, POD, nomi di immobili/contratti, MAI dati personali nel repo) e applicata solo dopo il suo ok. È uno dei pochi punti in cui l'esecuzione si ferma per una conferma.

- [ ] **Step 1: SPRAR fuori capitolo — note + lista per la ragioneria**

Query di controllo:

```sql
SELECT u.id, u.utility_id, b.chapter_code FROM utilities u JOIN utility_aggregators a ON a.id=u.aggregator_id_fk LEFT JOIN budget_chapters b ON b.id=u.budget_chapter_code_fk WHERE u.deleted=0 AND a.code='sprar' AND (b.supply_type IS NULL OR b.supply_type<>'SPRAR_UTILITIES');
```

Expected: 10 righe. Dopo conferma:

```sql
UPDATE utilities u JOIN utility_aggregators a ON a.id=u.aggregator_id_fk LEFT JOIN budget_chapters b ON b.id=u.budget_chapter_code_fk SET u.notes=TRIM(CONCAT_WS('\n', NULLIF(u.notes,''), 'Ex aggregato Access: SPRAR')), u.update_date=u.update_date WHERE u.deleted=0 AND a.code='sprar' AND (b.supply_type IS NULL OR b.supply_type<>'SPRAR_UTILITIES');
```

Expected: `10 rows affected`. Consegnare all'utente l'elenco id + POD per la ragioneria.

- [ ] **Step 2: Funzione immobile mancante — proposta dal vecchio aggregato**

```sql
SELECT aa.code vecchio, COUNT(*) n FROM assets s LEFT JOIN asset_aggregators aa ON aa.id=s.asset_type_id WHERE s.deleted=0 AND s.function_id IS NULL GROUP BY aa.code ORDER BY n DESC;
```

Proporre all'utente una corrispondenza vecchio aggregato → `asset_functions.name` (es. SCUOLE → Istruzione, SPORT → Sport, STRUTTURE SOCIO-ASSISTENZIALI… → Accoglienza (SPRAR) o Sociale da decidere, FORZE DELL'ORDINE → Sicurezza e soccorso). I gruppi senza corrispondenza ovvia restano vuoti o si decidono immobile per immobile. Dopo conferma, un UPDATE per gruppo:

```sql
UPDATE assets s JOIN asset_aggregators aa ON aa.id=s.asset_type_id SET s.function_id=(SELECT id FROM asset_functions WHERE name='Istruzione' AND deleted=0), s.update_date=s.update_date WHERE s.deleted=0 AND s.function_id IS NULL AND aa.code='SCUOLE';
```

- [ ] **Step 3: Costi a carico — lista 1 ("comune" che il calcolo darebbe a terzi)**

```sql
SELECT u.id, u.utility_id, u.supply_active, g.id grant_id, g.kind FROM utilities u JOIN costs_borne_by c ON c.id=u.costs_borne_by_id_fk JOIN utility_assets ua ON ua.utility_id=u.id JOIN utilizer_grant_assets ga ON ga.asset_id=ua.asset_id JOIN utilizer_grant g ON g.id=ga.utilizer_grant_id AND g.deleted=0 AND g.status='ACTIVE' AND g.direction='ACTIVE' AND g.utilities_to_be_taken_over=1 WHERE u.deleted=0 AND c.name='comune';
```

Expected: circa 14 utenze. Per ogni contratto l'utente decide: "Utenze da volturare" = no (`UPDATE utilizer_grant SET utilities_to_be_taken_over=0, update_date=update_date WHERE id IN (...)`) oppure accetta che diventino a carico del terzo (nessun intervento).

- [ ] **Step 4: Costi a carico — lista 2 ("concessionario" senza contratto attivo con voltura)**

```sql
SELECT u.id, u.utility_id, u.supply_active, GROUP_CONCAT(DISTINCT s.asset_name) immobili FROM utilities u JOIN costs_borne_by c ON c.id=u.costs_borne_by_id_fk LEFT JOIN utility_assets ua ON ua.utility_id=u.id LEFT JOIN assets s ON s.id=ua.asset_id WHERE u.deleted=0 AND c.name='concessionario' AND NOT EXISTS (SELECT 1 FROM utility_assets ua2 JOIN utilizer_grant_assets ga ON ga.asset_id=ua2.asset_id JOIN utilizer_grant g ON g.id=ga.utilizer_grant_id AND g.deleted=0 AND g.status='ACTIVE' AND g.direction='ACTIVE' AND g.utilities_to_be_taken_over=1 WHERE ua2.utility_id=u.id) GROUP BY u.id;
```

Expected: circa 33 utenze. Per gruppi (stesso immobile): l'utente indica se esiste un contratto da correggere (flag/stato), un contratto da aggiungere al registro (lo inserisce dalla UI o si crea con INSERT dopo conferma) o se accettare "Comune".

- [ ] **Step 5: Costi a carico — lista 3 (valori specifici → note)**

```sql
UPDATE utilities u JOIN costs_borne_by c ON c.id=u.costs_borne_by_id_fk SET u.notes=TRIM(CONCAT_WS('\n', NULLIF(u.notes,''), CONCAT('Ex costi a carico Access: ', c.name))), u.update_date=u.update_date WHERE u.deleted=0 AND c.name NOT IN ('comune','concessionario','COMUNE C/O ENGIE');
```

Expected: `16 rows affected` (dopo conferma della lista).

- [ ] **Step 6: Ledger**

Annotare nel ledger gli esiti numerici delle liste (servono alla roadmap, Task 6). Nessun commit.

---

### Task 2: Calcolo `costPayers` (backend)

**Files:**
- Create: `backend/src/apis/utility/cost-payers.ts`
- Test: `backend/src/apis/utility/cost-payers.spec.ts`
- Modify: `backend/src/apis/utility/utility.service.ts` (`withCurrentContractFields`)
- Test: `backend/src/apis/utility/utility.service.spec.ts`

**Interfaces:**
- Produces: `export interface CostPayer { grant_id: number; third_party_id: number; name: string }`; `export function costPayers(utility: { assets?: AssetLike[] | null }): CostPayer[]`; campo `cost_payers: CostPayer[]` su ogni utenza restituita da `findAll`/`findOne`/`findBySafeguard`.

- [ ] **Step 1: Test che fallisce**

`backend/src/apis/utility/cost-payers.spec.ts`:

```ts
import { costPayers } from './cost-payers';
import { ContractDirection, ContractStatus } from '@apis/utilizer-grant/enum/real-estate-contract.enum';
import { ThirdPartyType } from '@apis/third-parties/enum/third-party.enum';

const party = (id: number, name: string, extra = {}) => ({
  id, type: ThirdPartyType.LEGAL, company_name: name, deleted: false, ...extra,
});
const grant = (id: number, parties: unknown[], extra = {}) => ({
  id,
  deleted: false,
  status: ContractStatus.ACTIVE,
  direction: ContractDirection.ACTIVE,
  utilities_to_be_taken_over: true,
  parties,
  ...extra,
});
const utility = (...grantsPerAsset: unknown[][]) => ({
  assets: grantsPerAsset.map((utilizerGrants) => ({ utilizerGrants })),
});

describe('costPayers', () => {
  it('contratto attivo concesso dal Comune con utenze da volturare: paga la parte', () => {
    expect(costPayers(utility([grant(7, [party(3, 'Alfa Srl')])]))).toEqual([
      { grant_id: 7, third_party_id: 3, name: 'Alfa Srl' },
    ]);
  });

  it('flag voltura come 1 da MySQL vale vero, 0 vale falso', () => {
    expect(costPayers(utility([grant(7, [party(3, 'Alfa Srl')], { utilities_to_be_taken_over: 1 })]))).toHaveLength(1);
    expect(costPayers(utility([grant(7, [party(3, 'Alfa Srl')], { utilities_to_be_taken_over: 0 })]))).toEqual([]);
  });

  it.each([
    ['senza voltura', { utilities_to_be_taken_over: false }],
    ['restituito', { status: ContractStatus.RETURNED }],
    ['cessato', { status: ContractStatus.TERMINATED }],
    ['in contenzioso', { status: ContractStatus.DISPUTED }],
    ['passivo (il Comune paga)', { direction: ContractDirection.PASSIVE }],
    ['cancellato', { deleted: true }],
  ])('contratto %s: paga il Comune', (_label, extra) => {
    expect(costPayers(utility([grant(7, [party(3, 'Alfa Srl')], extra)]))).toEqual([]);
  });

  it('parte cancellata esclusa', () => {
    expect(costPayers(utility([grant(7, [party(3, 'Alfa Srl', { deleted: true })])]))).toEqual([]);
  });

  it('due contratti sullo stesso immobile: entrambe le parti', () => {
    const result = costPayers(utility([grant(7, [party(3, 'Alfa Srl')]), grant(8, [party(4, 'Beta Spa')])]));
    expect(result.map((p) => p.third_party_id)).toEqual([3, 4]);
  });

  it('stesso contratto su due immobili: la parte compare una volta', () => {
    const g = grant(7, [party(3, 'Alfa Srl')]);
    expect(costPayers(utility([g], [g]))).toHaveLength(1);
  });

  it('persona fisica: cognome nome', () => {
    const p = { id: 5, type: ThirdPartyType.NATURAL, last_name: 'Rossi', first_name: 'Mario', deleted: false };
    expect(costPayers(utility([grant(7, [p])]))[0].name).toBe('Rossi Mario');
  });

  it('nessun immobile (solo impianti) o dati mancanti: paga il Comune', () => {
    expect(costPayers({ assets: [] })).toEqual([]);
    expect(costPayers({})).toEqual([]);
    expect(costPayers({ assets: [{}] } as never)).toEqual([]);
  });
});
```

- [ ] **Step 2: Verifica RED**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/utility/cost-payers.spec.ts --maxWorkers=2`
Expected: FAIL, "Cannot find module './cost-payers'".

- [ ] **Step 3: Implementazione**

`backend/src/apis/utility/cost-payers.ts`:

```ts
import { ContractDirection, ContractStatus } from '@apis/utilizer-grant/enum/real-estate-contract.enum';
import { PartyFields, partyName } from '@apis/third-parties/third-party.name';

// "A carico di" calcolato: paga il terzo se l'utenza alimenta un immobile con
// un contratto immobiliare in corso, concesso dal Comune, con "Utenze da
// volturare"; altrimenti il Comune (lista vuota). Gli impianti non contano.
// Lavora sui contratti già caricati con l'utenza (assets.utilizerGrants.parties).
export interface CostPayer {
  grant_id: number;
  third_party_id: number;
  name: string;
}

interface PartyLike extends PartyFields {
  id: number;
  deleted?: boolean | number | null;
}

interface GrantLike {
  id: number;
  deleted?: boolean | number | null;
  status?: ContractStatus | null;
  direction?: ContractDirection | null;
  // MySQL tinyint: può arrivare come 1/0.
  utilities_to_be_taken_over?: boolean | number | null;
  parties?: PartyLike[] | null;
}

interface AssetLike {
  utilizerGrants?: GrantLike[] | null;
}

export function costPayers(utility: { assets?: AssetLike[] | null }): CostPayer[] {
  const seen = new Set<string>();
  const result: CostPayer[] = [];
  for (const asset of utility.assets ?? []) {
    for (const grant of asset.utilizerGrants ?? []) {
      if (
        grant.deleted ||
        grant.status !== ContractStatus.ACTIVE ||
        grant.direction !== ContractDirection.ACTIVE ||
        !grant.utilities_to_be_taken_over
      ) {
        continue;
      }
      for (const party of grant.parties ?? []) {
        const key = `${grant.id}:${party.id}`;
        if (party.deleted || seen.has(key)) continue;
        seen.add(key);
        result.push({ grant_id: grant.id, third_party_id: party.id, name: partyName(party) });
      }
    }
  }
  return result;
}
```

- [ ] **Step 4: Verifica GREEN**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/utility/cost-payers.spec.ts --maxWorkers=2`
Expected: PASS, 13 test.

- [ ] **Step 5: Test sul service che fallisce**

In `utility.service.spec.ts`, nel `describe` di `findAll` accanto al test "risolve il contratto corrente…", aggiungere:

```ts
    it('aggiunge cost_payers calcolati dai contratti immobiliari caricati', async () => {
      qb.getMany.mockResolvedValue([
        {
          id: 1,
          assets: [
            {
              utilizerGrants: [
                {
                  id: 7,
                  deleted: false,
                  status: 'ACTIVE',
                  direction: 'ACTIVE',
                  utilities_to_be_taken_over: true,
                  parties: [{ id: 3, type: 'LEGAL', company_name: 'Alfa Srl', deleted: false }],
                },
              ],
            },
          ],
        },
        { id: 2, assets: [] },
      ]);

      const result = (await service.findAll({} as never)) as unknown as { cost_payers: unknown[] }[];

      expect(result[0].cost_payers).toEqual([{ grant_id: 7, third_party_id: 3, name: 'Alfa Srl' }]);
      expect(result[1].cost_payers).toEqual([]);
    });
```

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/utility/utility.service.spec.ts -t "cost_payers" --maxWorkers=2`
Expected: FAIL (`cost_payers` undefined).

- [ ] **Step 6: Implementazione nel service**

In `utility.service.ts` importare `import { costPayers } from './cost-payers';` e in `withCurrentContractFields`, accanto a `utilityType: utility.utilityType ?? null,`, aggiungere:

```ts
      cost_payers: costPayers(utility),
```

- [ ] **Step 7: Verifica GREEN e commit**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/utility --maxWorkers=2`
Expected: PASS.

```bash
git add backend/src/apis/utility/cost-payers.ts backend/src/apis/utility/cost-payers.spec.ts backend/src/apis/utility/utility.service.ts backend/src/apis/utility/utility.service.spec.ts
git commit -m "feat(utenze): a carico di calcolato dai contratti immobiliari"
```

---

### Task 3: Filtri nuovi (backend)

**Files:**
- Modify: `backend/src/apis/utility/dto/search-utility.dto.ts`
- Modify: `backend/src/apis/utility/utility.service.ts` (`findAll`)
- Test: `backend/src/apis/utility/utility.service.spec.ts`, `backend/src/apis/utility/dto/search-utility.dto.spec.ts` (create)

**Interfaces:**
- Produces: query param `asset_function_ids` (int[], CSV), `plant_types` (`PlantType[]`, CSV), `cost_payer` (`'COMUNE' | 'THIRD_PARTY'`). Consumati dal frontend (Task 5).

- [ ] **Step 1: Test DTO che fallisce**

`backend/src/apis/utility/dto/search-utility.dto.spec.ts`:

```ts
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SearchUtilityDto } from './search-utility.dto';

const parse = async (query: Record<string, string>) => {
  const dto = plainToInstance(SearchUtilityDto, query);
  return { dto, errors: await validate(dto) };
};

describe('SearchUtilityDto filtri nuovi', () => {
  it('asset_function_ids da CSV a numeri; vuoto = nessun filtro', async () => {
    expect((await parse({ asset_function_ids: '3,5' })).dto.asset_function_ids).toEqual([3, 5]);
    expect((await parse({ asset_function_ids: '3' })).dto.asset_function_ids).toEqual([3]);
    const empty = await parse({ asset_function_ids: '' });
    expect(empty.dto.asset_function_ids).toBeUndefined();
    expect(empty.errors).toEqual([]);
  });

  it('plant_types accetta solo tipi d impianto', async () => {
    const ok = await parse({ plant_types: 'FOUNTAIN,PUBLIC_LIGHTING' });
    expect(ok.dto.plant_types).toEqual(['FOUNTAIN', 'PUBLIC_LIGHTING']);
    expect(ok.errors).toEqual([]);
    expect((await parse({ plant_types: 'XYZ' })).errors).not.toEqual([]);
  });

  it('cost_payer accetta COMUNE o THIRD_PARTY', async () => {
    expect((await parse({ cost_payer: 'COMUNE' })).errors).toEqual([]);
    expect((await parse({ cost_payer: 'THIRD_PARTY' })).errors).toEqual([]);
    expect((await parse({ cost_payer: 'ALTRO' })).errors).not.toEqual([]);
  });
});
```

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/utility/dto/search-utility.dto.spec.ts --maxWorkers=2`
Expected: FAIL (proprietà non definite: `asset_function_ids` undefined / nessun errore su valori invalidi).

- [ ] **Step 2: DTO**

In `search-utility.dto.ts` importare `IsEnum` (se non già importato) e `import { PlantType } from '@apis/plants/enum/plant.enum';`, poi aggiungere in fondo alla classe:

```ts
  // Utenze che alimentano almeno un immobile con una di queste funzioni.
  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value === undefined || value === null) return undefined;
    const list = Array.isArray(value) ? value : String(value).split(',');
    return list.map((v) => String(v).trim()).filter((v) => v !== '').map(Number);
  })
  @IsInt({ each: true })
  asset_function_ids?: number[];

  // Utenze che alimentano almeno un impianto di uno di questi tipi.
  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value === undefined || value === null) return undefined;
    const list = Array.isArray(value) ? value : String(value).split(',');
    return list.map((v) => String(v).trim()).filter((v) => v !== '');
  })
  @IsEnum(PlantType, { each: true })
  plant_types?: PlantType[];

  // A carico di (calcolato): Comune o terzi.
  @IsOptional()
  @IsIn(['COMUNE', 'THIRD_PARTY'])
  cost_payer?: 'COMUNE' | 'THIRD_PARTY';
```

Run: stesso comando dello Step 1. Expected: PASS.

- [ ] **Step 3: Test service che fallisce**

In `utility.service.spec.ts`, accanto al test "filtro per parte con sottoquery":

```ts
    it('filtro per funzione immobile con sotto-query, fuori da applyFilters', async () => {
      await service.findAll({ asset_function_ids: [3, 5] } as never);
      const call = qb.andWhere.mock.calls.find((c) => String(c[0]).includes('s.function_id IN (:...asset_function_ids)'));
      expect(call?.[1]).toEqual({ asset_function_ids: [3, 5] });
      expect(String(call?.[0])).toContain('s.deleted = 0');
    });

    it('filtro per tipo impianto con sotto-query', async () => {
      await service.findAll({ plant_types: ['FOUNTAIN'] } as never);
      const call = qb.andWhere.mock.calls.find((c) => String(c[0]).includes('p.type IN (:...plant_types)'));
      expect(call?.[1]).toEqual({ plant_types: ['FOUNTAIN'] });
      expect(String(call?.[0])).toContain('p.deleted = 0');
    });

    it.each([
      ['THIRD_PARTY', 'Utility.id IN ('],
      ['COMUNE', 'Utility.id NOT IN ('],
    ])('filtro a carico di %s sulla stessa regola del calcolo', async (value, prefix) => {
      await service.findAll({ cost_payer: value } as never);
      const call = qb.andWhere.mock.calls.find((c) => String(c[0]).includes('utilities_to_be_taken_over = 1'));
      expect(String(call?.[0]).startsWith(prefix)).toBe(true);
      expect(String(call?.[0])).toContain("g.status = 'ACTIVE'");
      expect(String(call?.[0])).toContain("g.direction = 'ACTIVE'");
      expect(String(call?.[0])).toContain('tp.deleted = 0');
    });

    it('liste vuote: nessun filtro', async () => {
      await service.findAll({ asset_function_ids: [], plant_types: [] } as never);
      const sql = qb.andWhere.mock.calls.map((c) => String(c[0])).join('\n');
      expect(sql).not.toContain('function_id');
      expect(sql).not.toContain('p.type');
    });
```

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/utility/utility.service.spec.ts -t "filtro" --maxWorkers=2`
Expected: FAIL sui 5 test nuovi.

- [ ] **Step 4: Service**

In `findAll`, dopo il blocco `if (filters.asset_id) {...}`:

```ts
    if (filters?.asset_function_ids?.length) {
      qb.andWhere(
        `Utility.id IN (SELECT ua.utility_id FROM utility_assets ua
           JOIN assets s ON s.id = ua.asset_id AND s.deleted = 0
           WHERE s.function_id IN (:...asset_function_ids))`,
        { asset_function_ids: filters.asset_function_ids },
      );
    }
    if (filters?.plant_types?.length) {
      qb.andWhere(
        `Utility.id IN (SELECT up.utility_id FROM utility_plants up
           JOIN plants p ON p.id = up.plant_id AND p.deleted = 0
           WHERE p.type IN (:...plant_types))`,
        { plant_types: filters.plant_types },
      );
    }
    // Stessa regola di costPayers (cost-payers.ts): tenerle allineate.
    if (filters?.cost_payer) {
      const paidByThirdParty = `SELECT ua.utility_id FROM utility_assets ua
           JOIN assets sa ON sa.id = ua.asset_id AND sa.deleted = 0
           JOIN utilizer_grant_assets uga ON uga.asset_id = ua.asset_id
           JOIN utilizer_grant g ON g.id = uga.utilizer_grant_id AND g.deleted = 0
             AND g.status = 'ACTIVE' AND g.direction = 'ACTIVE' AND g.utilities_to_be_taken_over = 1
           JOIN utilizer_grant_parties gp ON gp.utilizer_grant_id = g.id
           JOIN third_parties tp ON tp.id = gp.third_party_id AND tp.deleted = 0`;
      qb.andWhere(
        `Utility.id ${filters.cost_payer === 'THIRD_PARTY' ? 'IN' : 'NOT IN'} (${paidByThirdParty})`,
      );
    }
```

Il join `assets sa ... deleted = 0` replica quello di `findAll` (`assets.deleted = 0`), da cui `costPayers` riceve i dati.

Aggiungere `'asset_function_ids', 'plant_types', 'cost_payer'` all'elenco di esclusione di `this.applyFilters(...)`.

- [ ] **Step 5: Verifica GREEN e commit**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/utility --maxWorkers=2`
Expected: PASS.

```bash
git add backend/src/apis/utility/dto/search-utility.dto.ts backend/src/apis/utility/dto/search-utility.dto.spec.ts backend/src/apis/utility/utility.service.ts backend/src/apis/utility/utility.service.spec.ts
git commit -m "feat(utenze): filtri per funzione immobile, tipo impianto e a carico di"
```

---

### Task 4: Rimozione backend di aggregati e costi a carico + migration

**Files:**
- Delete: `backend/src/apis/utility-aggregators/` (intera cartella), `backend/src/apis/costs-borne-by/` (intera cartella), `backend/src/apis/shared/entities/utility_cost_borne_by.entity.ts`
- Modify: `backend/src/app.module.ts`, `backend/src/apis/utility/entity/utility.entity.ts`, `backend/src/apis/utility/dto/create-utility.dto.ts`, `backend/src/apis/utility/dto/update-utility.dto.ts`, `backend/src/apis/utility/dto/search-utility.dto.ts`, `backend/src/apis/utility/utility.service.ts`, `backend/src/apis/utility/utility.service.spec.ts`
- Create: `backend/src/database/migrations/1791800000000-DropUtilityAggregators.ts`, `backend/src/database/migrations/1791900000000-DropCostsBorneBy.ts` (scritte prima in `backend/.scratch/`)

**Interfaces:**
- Consumes: Task 1 completato (i dati vecchi servono ancora alle note: dopo questo task non esistono più).
- Produces: API utenza senza `aggregator_id_fk`, `aggregator`, `utilityAggregator`, `costs_borne_by_id_fk`, `costsBorneBy`; endpoint `/utility-aggregators` e `/costs-borne-by` rimossi.

- [ ] **Step 1: Test che fallisce**

Nel test "risolve il contratto corrente…" di `utility.service.spec.ts`: togliere `utilityAggregator: { id: 2 },` dall'utenza finta, togliere `aggregator: unknown;` dal tipo e sostituire `expect(enriched.aggregator).toEqual({ id: 2 });` con:

```ts
      expect(enriched).not.toHaveProperty('aggregator');
```

Aggiungere nel `describe` di `findAll`:

```ts
    it('non carica più aggregati né costi a carico', async () => {
      await service.findAll({} as never);
      const joins = qb.leftJoinAndSelect.mock.calls.map((c) => String(c[0]));
      expect(joins).not.toContain('Utility.utilityAggregator');
      expect(joins).not.toContain('Utility.costsBorneBy');
    });
```

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/utility/utility.service.spec.ts --maxWorkers=2`
Expected: FAIL sui due test.

- [ ] **Step 2: Rimozione codice**

- `utility.service.ts`: togliere `aggregator: utility.utilityAggregator ?? null,` da `withCurrentContractFields`; togliere le tre `leftJoinAndSelect` su `Utility.costsBorneBy` (findAll, findBySafeguard, findOne) e le due su `Utility.utilityAggregator` (findAll, findOne).
- `utility.entity.ts`: togliere gli import di `UtilityAggregator` e `CostsBorneBy`, le colonne `costs_borne_by_id_fk` e `aggregator_id_fk` con i loro decorator, le relazioni `costsBorneBy` e `utilityAggregator`.
- `create-utility.dto.ts`: togliere `costs_borne_by_id_fk` (con `@IsNotEmpty` "Il campo \"Costi a carico di\" è obbligatorio.") e `aggregator_id_fk`.
- `update-utility.dto.ts` e `search-utility.dto.ts`: togliere `costs_borne_by_id_fk` e `aggregator_id_fk`.
- `app.module.ts`: togliere import e registrazione di `UtilityAggregatorsModule` e `CostsBorneByModule`.
- `git rm -r backend/src/apis/utility-aggregators backend/src/apis/costs-borne-by backend/src/apis/shared/entities/utility_cost_borne_by.entity.ts`
- Verificare che non resti nulla: `grep -rn "UtilityAggregator\|utilityAggregator\|aggregator_id_fk\|CostsBorneBy\|costsBorneBy\|costs_borne_by" backend/src --include=*.ts | grep -v migrations/` → nessun risultato.

- [ ] **Step 3: Migration (scratch)**

`backend/.scratch/1791800000000-DropUtilityAggregators.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

// Aggregati utenze eliminati (roadmap voce 11): l'informazione è nei
// collegamenti a immobili (funzione) e impianti (tipo). Solo schema: i dati
// rimasti utili sono già stati portati nelle note sul DB locale.
export class DropUtilityAggregators1791800000000 implements MigrationInterface {
  name = 'DropUtilityAggregators1791800000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `utilities` DROP FOREIGN KEY `FK_dba61ce41b0c75fe41d95eb23e5`');
    await q.query('ALTER TABLE `utilities` DROP COLUMN `aggregator_id_fk`');
    await q.query('DROP TABLE `utility_aggregators`');
  }

  // Ricrea la struttura vuota: i valori non si ricostruiscono.
  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      'CREATE TABLE `utility_aggregators` (`id` int NOT NULL AUTO_INCREMENT, `code` varchar(255) NOT NULL, `description` varchar(255) NULL, `create_date` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `update_date` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), `created_by_user_id` int NOT NULL, `updated_by_user_id` int NOT NULL, `deleted` tinyint NOT NULL DEFAULT 0, UNIQUE INDEX `IDX_fd45c271920bc9a24a05904b5c` (`code`), INDEX `IDX_6add3a6a97364646ac3ac95afb` (`created_by_user_id`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await q.query(
      'ALTER TABLE `utility_aggregators` ADD CONSTRAINT `FK_6add3a6a97364646ac3ac95afb8` FOREIGN KEY (`created_by_user_id`) REFERENCES `system_users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await q.query(
      'ALTER TABLE `utility_aggregators` ADD CONSTRAINT `FK_8a237573bbd76c2beaee579d5a2` FOREIGN KEY (`updated_by_user_id`) REFERENCES `system_users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await q.query('ALTER TABLE `utilities` ADD `aggregator_id_fk` int NULL');
    await q.query(
      'ALTER TABLE `utilities` ADD CONSTRAINT `FK_dba61ce41b0c75fe41d95eb23e5` FOREIGN KEY (`aggregator_id_fk`) REFERENCES `utility_aggregators`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
  }
}
```

`backend/.scratch/1791900000000-DropCostsBorneBy.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

// "Costi a carico di" diventa calcolato dai contratti immobiliari (roadmap
// voce 12, apis/utility/cost-payers.ts). Solo schema: i valori particolari
// sono già stati portati nelle note sul DB locale.
export class DropCostsBorneBy1791900000000 implements MigrationInterface {
  name = 'DropCostsBorneBy1791900000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `utilities` DROP FOREIGN KEY `FK_ac19dbfc5a05c425d326d14548e`');
    await q.query('ALTER TABLE `utilities` DROP COLUMN `costs_borne_by_id_fk`');
    await q.query('DROP TABLE `costs_borne_by`');
  }

  // Ricrea la struttura vuota (colonna nullable): i valori non si ricostruiscono.
  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      'CREATE TABLE `costs_borne_by` (`id` int NOT NULL AUTO_INCREMENT, `name` varchar(100) NOT NULL, `create_date` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `update_date` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), `created_by_user_id` int NOT NULL, `updated_by_user_id` int NOT NULL, `deleted` tinyint NOT NULL DEFAULT 0, UNIQUE INDEX `IDX_028a7f4037aa13be201677526e` (`name`), INDEX `IDX_a1b3689b160116241e4de0ee34` (`created_by_user_id`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await q.query(
      'ALTER TABLE `costs_borne_by` ADD CONSTRAINT `FK_a1b3689b160116241e4de0ee341` FOREIGN KEY (`created_by_user_id`) REFERENCES `system_users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await q.query(
      'ALTER TABLE `costs_borne_by` ADD CONSTRAINT `FK_e17b17ff1598741dfab09add67a` FOREIGN KEY (`updated_by_user_id`) REFERENCES `system_users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await q.query('ALTER TABLE `utilities` ADD `costs_borne_by_id_fk` int NULL');
    await q.query(
      'ALTER TABLE `utilities` ADD CONSTRAINT `FK_ac19dbfc5a05c425d326d14548e` FOREIGN KEY (`costs_borne_by_id_fk`) REFERENCES `costs_borne_by`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
  }
}
```

L'indice `FK_…` sulla colonna sparisce con `DROP COLUMN`; nel `down()` lo ricrea `ADD CONSTRAINT … FOREIGN KEY`. Se una DDL fallisce a metà, pulire a mano schema e riga `migrations` come da CLAUDE.md.

- [ ] **Step 4: Verifica GREEN unit**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/utility --maxWorkers=2`
Expected: PASS.
Run: `docker exec utenzepa-api-1 pnpm run type-check`
Expected: nessun errore.

- [ ] **Step 5: Backup e ciclo migration**

Backup prima del primo up (le migration distruggono dati):

```bash
P=$(grep '^MYSQL_PASSWORD=' .env | cut -d= -f2-); docker exec utenzepa-mysql-1 mysqldump -uroot -p"$P" mydatabase utilities utility_aggregators costs_borne_by > "<scratchpad>/pre-v190.sql"
```

Spostare i due file da `backend/.scratch/` a `backend/src/database/migrations/`, attendere nei log `docker logs --since 120s utenzepa-api-1 2>&1 | grep -E "Migration|Found 0 errors|ERROR"` l'esecuzione. Verificare:

```sql
SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='mydatabase' AND TABLE_NAME='utilities' AND COLUMN_NAME IN ('aggregator_id_fk','costs_borne_by_id_fk');
```
Expected: `0`; `SHOW TABLES LIKE 'utility_aggregators'` e `'costs_borne_by'` vuoti.

Ciclo down → up: `docker exec -u root utenzepa-api-1 node -r ts-node/register -r tsconfig-paths/register node_modules/typeorm/cli.js migration:revert -d src/database/data-source.ts` due volte (colonne e tabelle tornano, vuote), poi `docker restart utenzepa-api-1` e attesa log: le migration rigirano, colonne di nuovo assenti. Confrontare `SELECT COUNT(*), SUM(CRC32(CONCAT_WS('|',id,notes))) FROM utilities` prima e dopo il ciclo: identici.

- [ ] **Step 6: Commit**

```bash
git add backend/src/app.module.ts backend/src/apis/utility backend/src/database/migrations/1791800000000-DropUtilityAggregators.ts backend/src/database/migrations/1791900000000-DropCostsBorneBy.ts
git commit -m "feat!: rimossi aggregati utenze e costi a carico manuali"
```

(le cancellazioni sono già in stage dal `git rm`).

---

### Task 5: Frontend

**Files:**
- Delete: `frontend/src/app/pages/utility-aggregator/`, `frontend/src/app/pages/costs-borne-by/`
- Modify: `frontend/src/app/app.routes.ts`, `frontend/src/app/comp/sidebar/sidebar.component.ts`, `frontend/src/app/pages/utilities/entity/utility.entity.ts`, `frontend/src/app/pages/utilities/entity/utility.interface.ts`, `frontend/src/app/pages/utilities/utility-edit-dialog.component.{ts,html}`, `frontend/src/app/pages/utilities/utility-filter-dialog.component.{ts,html}`, `frontend/src/app/pages/utilities/search-utilities.component.ts`, `frontend/src/app/pages/utilities/data-table-utilities.component.{ts,html}`

**Interfaces:**
- Consumes: `cost_payers: {grant_id, third_party_id, name}[]` (Task 2); filtri `asset_function_ids`, `plant_types`, `cost_payer` (Task 3).

- [ ] **Step 1: Modello**

`utility.interface.ts`: togliere import di `ICostsBorneBy`/`UtilityAggregator` e i campi `aggregator`, `aggregator_id_fk`, `costs_borne_by_id_fk`, `costsBorneBy`; aggiungere:

```ts
export interface CostPayer {
  grant_id: number;
  third_party_id: number;
  name: string;
}
```

e nell'interfaccia utenza `cost_payers?: CostPayer[];`.

`utility.entity.ts`: togliere import e campi corrispondenti (`costs_borne_by_id_fk`, `aggregator_id_fk`, `costsBorneBy`, `aggregator`) e il getter `isHighlighted`; aggiungere `cost_payers?: CostPayer[];` (import `type {CostPayer}` dall'interfaccia).

- [ ] **Step 2: Pagine, route, sidebar**

`git rm -r frontend/src/app/pages/utility-aggregator frontend/src/app/pages/costs-borne-by`. In `app.routes.ts` togliere import e route `utility-aggregator` e l'eventuale route `costs-borne-by`; in `sidebar.component.ts` togliere le voci "Aggregati Utenze" e quella dei costi a carico se presente.

- [ ] **Step 3: Scheda utenza**

`utility-edit-dialog.component.ts`: togliere `UtilityAggregatorsService`, `CostsBorneByService`, `aggregatorOptions`, `costsBorneByOptions`, i controlli `aggregator_id_fk` e `costs_borne_by_id_fk`, le due `search()` che li popolano, `grantsByAsset()` e `counterpartCount()`. Aggiungere:

```ts
  payerPreview: PreviewItem[] = [];
```

e in fondo a `refreshLinks()`:

```ts
    this.payerPreview = (this.data.item.cost_payers ?? []).map(p => ({
      id: p.grant_id, label: p.name, sublabel: 'Contratto immobiliare',
      icon: 'handshake', color: 'var(--entity-grant, var(--entity-asset))',
    }));
```

e il metodo:

```ts
  openGrant(id: number): void {
    this.navigator.openGrant(id).subscribe();
  }
```

`utility-edit-dialog.component.html`: togliere il blocco `<div class="span-2">` di "ID Aggregato" e il `mat-form-field` "Costi a Carico di"; in `[error]="invalid(...)"` della tab Riepilogo togliere `'costs_borne_by_id_fk'`; togliere l'intero `<mat-tab aria-label="Controparti">`. In `.sheet-previews`, dopo la card "Impianti":

```html
          @if (!isNew) {
            <app-preview-card title="A carico di" icon="payments" color="var(--entity-asset)"
                              [items]="payerPreview" emptyText="Comune"
                              (open)="openGrant($event.id)"></app-preview-card>
          }
```

Se `--entity-grant` non esiste come variabile, usare il colore già usato per i contratti immobiliari (grep `entity-` in `styles.scss`).

- [ ] **Step 4: Filtri**

`utility-filter-dialog.component.ts`: togliere `UtilityAggregatorsService`, `CostsBorneByService`, `aggregatorOptions`, `costsBorneByOptions`, i campi `aggregator_id_fk`/`costs_borne_by_id_fk` di `UtilityFilterValues` e del form, le relative `search()`. Aggiungere a `UtilityFilterValues`:

```ts
  asset_function_ids: number[] | null;
  plant_types: string[] | null;
  cost_payer: 'COMUNE' | 'THIRD_PARTY' | null;
```

al form:

```ts
    asset_function_ids: [this.data.values.asset_function_ids ?? []],
    plant_types: [this.data.values.plant_types ?? []],
    cost_payer: [this.data.values.cost_payer ?? null],
```

proprietà:

```ts
  assetFunctionOptions: TOption[] = [];
  readonly plantTypeOptions: TOption[] = (Object.keys(PLANT_TYPE_LABEL) as PlantType[])
    .map(t => ({label: PLANT_TYPE_LABEL[t], value: t}))
    .sort((a, b) => a.label.localeCompare(b.label));
```

(import `PLANT_TYPE_LABEL` e `PlantType` da `../plants/plant.model`) e nel caricamento opzioni, con `private assetFunctionsService = inject(AssetFunctionsService);` (da `../asset-function/asset-function.service` o il path reale):

```ts
    this.assetFunctionsService.search({deleted: false} as never).subscribe({
      next: data => this.assetFunctionOptions = data
        .map((f: any) => ({label: f.name, value: f.id}))
        .sort((a: TOption, b: TOption) => a.label.localeCompare(b.label)),
      error: err => console.error('Errore nel caricamento delle funzioni immobile:', err)
    });
```

`utility-filter-dialog.component.html`: al posto del blocco "Aggregato":

```html
          <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
            <mat-label>Funzione immobile</mat-label>
            <mat-select formControlName="asset_function_ids" multiple>
              @for (opt of assetFunctionOptions; track opt.value) {
                <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
            <mat-label>Tipo impianto</mat-label>
            <mat-select formControlName="plant_types" multiple>
              @for (opt of plantTypeOptions; track opt.value) {
                <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
```

al posto di "Costi a Carico di":

```html
          <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
            <mat-label>A carico di</mat-label>
            <mat-select formControlName="cost_payer">
              <mat-option [value]="null">Tutti</mat-option>
              <mat-option value="COMUNE">Comune</mat-option>
              <mat-option value="THIRD_PARTY">Terzi</mat-option>
            </mat-select>
          </mat-form-field>
```

`search-utilities.component.ts`: sostituire `costs_borne_by_id_fk: [null]` e `aggregator_id_fk: [null]` con `asset_function_ids: [[]]`, `plant_types: [[]]`, `cost_payer: [null]`. Verificare che la conta dei filtri attivi (se esiste) non consideri attivo un array vuoto; se lo fa, escludere gli array vuoti nello stesso punto.

- [ ] **Step 5: Tabella**

`data-table-utilities.component.ts`: togliere `UtilityAggregatorsService`, `UtilityAggregator`, `utilityAggregatorMap` e il suo caricamento, la colonna `aggregator.description` e il suo `case` nel sorting accessor; rinominare la colonna `costsBorneBy.name` in `{field: 'cost_payers', header: 'A carico di', minWidth: '150px'}` (anche nell'elenco delle colonne visibili di default) e nel sorting accessor aggiungere:

```ts
      case 'cost_payers':
        return this.payerLabel(utility);
```

con:

```ts
  payerLabel(utility: Utility): string {
    return (utility.cost_payers ?? []).map(p => p.name).join(', ') || 'Comune';
  }
```

Se la tabella ha un export CSV con un mapping per colonna, usare `payerLabel` anche lì.

`data-table-utilities.component.html`: sostituire i due `ng-container` `costsBorneBy.name` e `aggregator.description` con:

```html
  <ng-container matColumnDef="cost_payers">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>A carico di</th>
    <td mat-cell *matCellDef="let item">
      @if (item.cost_payers?.length) {
        <span class="status-badge status-badge-warn">{{ payerLabel(item) }}</span>
      } @else {
        Comune
      }
    </td>
  </ng-container>
```

- [ ] **Step 6: Compilazione**

Run: `grep -rn "ggregator_id_fk\|utilityAggregator\|UtilityAggregator\|costs_borne\|costsBorne\|CostsBorne\|utility-aggregator\|costs-borne-by" frontend/src/app --include=*.ts --include=*.html`
Expected: nessun risultato.
Run: `docker logs --since 60s utenzepa-frontend-1 2>&1 | grep -E "✘|generation"`
Expected: "generation complete", nessun `✘`.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/app.routes.ts frontend/src/app/comp/sidebar/sidebar.component.ts frontend/src/app/pages/utilities
git commit -m "feat(frontend): a carico di calcolato, filtri per funzione immobile e tipo impianto"
```

---

### Task 6: E2E, documentazione, versione

**Files:**
- Modify: `CLAUDE.md`, `docs/roadmap-patrimonio.md`, `publiccode.yml`

- [ ] **Step 1: E2E Playwright**

Utente temporaneo come da CLAUDE.md (creato via SQL, eliminato a fine test con `audit_logs`). Verificare, aprendo le schede dalla riga dell'elenco (dati di `findAll`):
1. `/utilities` → Filtri → Funzione immobile = Istruzione: solo utenze di scuole; conteggio coerente con `SELECT COUNT(DISTINCT ua.utility_id) FROM utility_assets ua JOIN assets s ON s.id=ua.asset_id AND s.deleted=0 JOIN asset_functions f ON f.id=s.function_id WHERE f.name='Istruzione'` (filtrato per utenze non cancellate).
2. Filtro Tipo impianto = Fontana; filtro A carico di = Terzi: ogni riga ha la colonna "A carico di" con un nome.
3. Scheda di un'utenza a carico di terzi: Riepilogo con card "A carico di" → click apre la scheda del contratto immobiliare. Nessun campo Aggregato/Costi a carico, nessun tab Controparti.
4. Utenza a carico del Comune: card "A carico di" con "Comune".
5. Creazione di una nuova utenza (immobile + capitolo): salva senza errori. Poi cancellarla con `DELETE` fisico (e righe `utility_assets`, `audit_logs` collegate).
6. Sidebar: nessuna voce "Aggregati Utenze".

- [ ] **Step 2: Documentazione**

- `CLAUDE.md`: dall'elenco moduli di `src/apis/` togliere `utility-aggregators` e `costs-borne-by`; nella nota "Disalimentabilità utenza…" aggiungere: "A carico di: calcolato (`apis/utility/cost-payers.ts`, `cost_payers` in risposta, filtro `cost_payer` con la stessa regola in SQL): terzi = parti dei contratti immobiliari `ACTIVE`/`direction ACTIVE` con \"Utenze da volturare\" sugli immobili dell'utenza, altrimenti Comune. Aggregati utenze e lista costi a carico non esistono più."
- Roadmap: tabella righe 11 e 12 → "fatto, v1.9.0 (…esito liste dati dal ledger…)"; sezioni 11 e 12 con una riga "Fatto in v1.9.0: spec …" in testa, esito delle liste e cosa resta (es. capitolo delle 10 SPRAR alla ragioneria). Aggiornare "Aggiornata:" a 2026-10-03.
- `publiccode.yml`: `softwareVersion: 1.9.0`, `releaseDate: 2026-10-03` (o data di rilascio).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/roadmap-patrimonio.md publiccode.yml docs/superpowers/plans/2026-10-03-aggregati-costi-calcolati.md
git commit -m "docs: voci 11 e 12 della roadmap, v1.9.0"
```

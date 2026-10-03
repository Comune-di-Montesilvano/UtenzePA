# Aggregati utenze eliminati, costi a carico calcolati e volture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminare gli aggregati utenze e la lista "Costi a carico di"; il primo è sostituito da filtri su Funzione immobile/Tipo impianto, il secondo da "Volturata a/il" sull'utenza più uno stato calcolato dai contratti immobiliari (Comune / Da volturare / Volturata / Da riprendere), con anomalie in dashboard (release v1.8.1).

**Architecture:** Lo stato è una funzione pura (`costInfo`) sui contratti immobiliari che `UtilitiesService` già carica con l'utenza, più una gemella SQL (`costStatusSql`) per filtro e anomalie. I filtri nuovi sono sotto-query (solo WHERE). Migration di solo schema: una additiva (colonne voltura), due di rimozione. Correzioni dati one-shot sul DB locale, con SQL nello scratchpad, nei punti in cui lo schema lo permette.

**Tech Stack:** NestJS 11 + TypeORM/MySQL 8, Jest; Angular 22 + Material; Playwright MCP per E2E.

**Spec:** `docs/superpowers/specs/2026-10-03-eliminazione-aggregati-utenze-design.md`, `docs/superpowers/specs/2026-10-03-costi-a-carico-calcolato-design.md`

## Global Constraints

- Dati: correzioni one-shot solo sul DB locale (SQL nello scratchpad, mai nel repo, mai in una migration); la produzione si allinea con export/import.
- Nessun dato personale (nomi, CF, PEC) in doc, test, commit: solo id o nomi fittizi.
- Migration: scritte in `backend/.scratch/`, spostate in `backend/src/database/migrations/` solo a contenuto finale (il watcher le esegue subito). Ordine: `AddUtilityTransfer` → dati del Task 6 → `DropUtilityAggregators` e `DropCostsBorneBy` (dopo, i valori vecchi non esistono più).
- Comandi Docker uno alla volta, mai in parallelo. Jest sempre con `--maxWorkers=2`, file singoli (`docker exec utenzepa-api-1 pnpm exec jest <path> --maxWorkers=2`); la suite completa la fa la CI.
- Dopo `pnpm run lint` nel container: scartare i file con `git diff --numstat` `0 0` e la formattazione di file non toccati.
- `git add` sempre con file espliciti.
- Errori di validazione: HTTP 400 con messaggio UI, mai 409.
- Frontend: nessun test eseguibile; verifica = log `ng serve` (`docker logs --since 60s utenzepa-frontend-1 2>&1 | grep -E "✘|generation"`) + E2E Playwright.
- Query MySQL monoriga: `P=$(grep '^MYSQL_PASSWORD=' .env | cut -d= -f2-); docker exec utenzepa-mysql-1 mysql -uroot -p"$P" mydatabase --default-character-set=utf8mb4 -e "..."`.

## Review Focus

- `utilities_to_be_taken_over` restituito da MySQL come `1`/`0` invece di boolean: il calcolo deve trattarlo come vero/falso (test con `1`).
- Parte, contratto o immobile cancellati caricati comunque dal join: non devono contare (test su parte e contratto; immobile escluso dal join `assets.deleted = 0`).
- Divergenza tra `costInfo` (TS) e `costStatusSql` (SQL): stessa regola in due posti; i test di entrambi coprono le stesse condizioni (stato, direzione, voltura, parti/immobili non cancellati).
- Filtri multipli con stringa vuota o un valore solo (`asset_function_ids=` / `=3`): nessun filtro / un valore, mai 400 (test DTO).
- Scheda utenza aperta dalla riga dell'elenco (`findAll`, non `findOne`): `cost_info` e `transferredTo` presenti anche lì (test service su `findAll`, E2E dalla riga).

---

### Task 1: Dati parte A — SPRAR e funzione immobile (FATTO)

Eseguito il 2026-10-03 con conferma dell'utente (SQL `t1_step12.sql` nello scratchpad):

- [x] note `Ex aggregato Access: SPRAR` su 10 utenze SPRAR fuori dal capitolo 15048 (id 2530, 2540, 2543, 2604, 2610, 2616, 2737, 2746, 2748, 2758: elenco per la ragioneria);
- [x] funzione immobile assegnata a 118 immobili dal vecchio aggregato; restano senza funzione 7 (2004, 2038, 2063, 2274, 2353, 2381, 2404: dubbi, lasciati vuoti su indicazione dell'utente).

---

### Task 2: Stato "A carico di" (funzioni pure)

**Files:**
- Create: `backend/src/apis/utility/cost-status.ts`
- Test: `backend/src/apis/utility/cost-status.spec.ts`

**Interfaces:**
- Produces:
  - `export enum CostStatus { COMUNE = 'COMUNE', TO_TRANSFER = 'TO_TRANSFER', TRANSFERRED = 'TRANSFERRED', TO_RECOVER = 'TO_RECOVER' }`
  - `export interface CostParty { grant_id: number; third_party_id: number; name: string }`
  - `export interface CostInfo { status: CostStatus; parties: CostParty[]; transferred_to: { id: number; name: string } | null; transferred_on: string | Date | null }`
  - `export function costInfo(utility: CostInput): CostInfo`
  - `export function costStatusSql(status: CostStatus, alias?: string): string` (alias default `'Utility'`, condizione WHERE su quell'alias)

- [ ] **Step 1: Test che fallisce**

`backend/src/apis/utility/cost-status.spec.ts`:

```ts
import { CostStatus, costInfo, costStatusSql } from './cost-status';
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
const utility = (grantsPerAsset: unknown[][], extra = {}) => ({
  assets: grantsPerAsset.map((utilizerGrants) => ({ utilizerGrants })),
  ...extra,
});
const transferred = (p: ReturnType<typeof party>, on: string | null = null) => ({
  transferred_to_third_party_id: p.id,
  transferredTo: p,
  transferred_on: on,
});

describe('costInfo', () => {
  it('nessun contratto con voltura: Comune', () => {
    expect(costInfo(utility([[grant(7, [party(3, 'Alfa Srl')], { utilities_to_be_taken_over: false })]])))
      .toEqual({ status: CostStatus.COMUNE, parties: [], transferred_to: null, transferred_on: null });
  });

  it('contratto con voltura, utenza non volturata: da volturare, con le parti', () => {
    const info = costInfo(utility([[grant(7, [party(3, 'Alfa Srl')])]]));
    expect(info.status).toBe(CostStatus.TO_TRANSFER);
    expect(info.parties).toEqual([{ grant_id: 7, third_party_id: 3, name: 'Alfa Srl' }]);
  });

  it('volturata a una parte del contratto: volturata', () => {
    const p = party(3, 'Alfa Srl');
    const info = costInfo(utility([[grant(7, [p])]], transferred(p, '2026-05-01')));
    expect(info.status).toBe(CostStatus.TRANSFERRED);
    expect(info.transferred_to).toEqual({ id: 3, name: 'Alfa Srl' });
    expect(info.transferred_on).toBe('2026-05-01');
  });

  it('volturata a una parte di un contratto attivo senza voltura: volturata', () => {
    const p = party(3, 'Alfa Srl');
    const g = grant(7, [p], { utilities_to_be_taken_over: false });
    expect(costInfo(utility([[g]], transferred(p))).status).toBe(CostStatus.TRANSFERRED);
  });

  it('volturata a un soggetto senza contratto attivo: da riprendere', () => {
    const old = party(3, 'Alfa Srl');
    const g = grant(7, [party(4, 'Beta Spa')]);
    expect(costInfo(utility([[g]], transferred(old))).status).toBe(CostStatus.TO_RECOVER);
    expect(costInfo(utility([], transferred(old))).status).toBe(CostStatus.TO_RECOVER);
  });

  it('flag voltura 1/0 da MySQL', () => {
    expect(costInfo(utility([[grant(7, [party(3, 'A')], { utilities_to_be_taken_over: 1 })]])).status)
      .toBe(CostStatus.TO_TRANSFER);
    expect(costInfo(utility([[grant(7, [party(3, 'A')], { utilities_to_be_taken_over: 0 })]])).status)
      .toBe(CostStatus.COMUNE);
  });

  it.each([
    ['restituito', { status: ContractStatus.RETURNED }],
    ['cessato', { status: ContractStatus.TERMINATED }],
    ['in contenzioso', { status: ContractStatus.DISPUTED }],
    ['passivo', { direction: ContractDirection.PASSIVE }],
    ['cancellato', { deleted: true }],
    ['cancellato (1 da MySQL)', { deleted: 1 }],
  ])('contratto %s non conta', (_label, extra) => {
    const p = party(3, 'Alfa Srl');
    expect(costInfo(utility([[grant(7, [p], extra)]])).status).toBe(CostStatus.COMUNE);
    expect(costInfo(utility([[grant(7, [p], extra)]], transferred(p))).status).toBe(CostStatus.TO_RECOVER);
  });

  it('contratto con voltura senza parti (o con parti cancellate): Comune', () => {
    expect(costInfo(utility([[grant(7, [])]])).status).toBe(CostStatus.COMUNE);
    expect(costInfo(utility([[grant(7, [party(3, 'A', { deleted: true })])]])).status).toBe(CostStatus.COMUNE);
  });

  it('volturata a una parte cancellata dal contratto: da riprendere', () => {
    const p = party(3, 'Alfa Srl');
    const g = grant(7, [{ ...p, deleted: true }]);
    expect(costInfo(utility([[g]], transferred(p))).status).toBe(CostStatus.TO_RECOVER);
  });

  it('due contratti: entrambe le parti; stesso contratto su due immobili: una volta', () => {
    const g = grant(7, [party(3, 'Alfa Srl')]);
    expect(costInfo(utility([[g, grant(8, [party(4, 'Beta Spa')])]])).parties.map((p) => p.third_party_id))
      .toEqual([3, 4]);
    expect(costInfo(utility([[g], [g]])).parties).toHaveLength(1);
  });

  it('persona fisica: cognome nome', () => {
    const p = { id: 5, type: ThirdPartyType.NATURAL, last_name: 'Rossi', first_name: 'Mario', deleted: false };
    expect(costInfo(utility([[grant(7, [p])]])).parties[0].name).toBe('Rossi Mario');
  });

  it('solo impianti o dati mancanti: Comune', () => {
    expect(costInfo({ assets: [] }).status).toBe(CostStatus.COMUNE);
    expect(costInfo({}).status).toBe(CostStatus.COMUNE);
    expect(costInfo({ assets: [{}] } as never).status).toBe(CostStatus.COMUNE);
  });

  it('transferredTo non caricato: nome vuoto ma id presente', () => {
    const info = costInfo({ assets: [], transferred_to_third_party_id: 9 });
    expect(info.transferred_to).toEqual({ id: 9, name: '' });
  });
});

describe('costStatusSql', () => {
  const ACTIVE = "g.deleted = 0 AND g.status = 'ACTIVE' AND g.direction = 'ACTIVE'";

  it.each([
    [CostStatus.COMUNE, 'IS NULL', 'NOT EXISTS', 'g.utilities_to_be_taken_over = 1'],
    [CostStatus.TO_TRANSFER, 'IS NULL', 'EXISTS', 'g.utilities_to_be_taken_over = 1'],
    [CostStatus.TRANSFERRED, 'IS NOT NULL', 'EXISTS', 'tp.id = Utility.transferred_to_third_party_id'],
    [CostStatus.TO_RECOVER, 'IS NOT NULL', 'NOT EXISTS', 'tp.id = Utility.transferred_to_third_party_id'],
  ])('%s', (status, nullCheck, exists, extra) => {
    const sql = costStatusSql(status);
    expect(sql).toContain(`Utility.transferred_to_third_party_id ${nullCheck}`);
    expect(sql).toContain(`${exists} (`);
    if (exists === 'EXISTS') expect(sql).not.toContain('NOT EXISTS');
    expect(sql).toContain(ACTIVE);
    expect(sql).toContain(extra);
    expect(sql).toContain('sa.deleted = 0');
    expect(sql).toContain('tp.deleted = 0');
    expect(sql).toContain('ua.utility_id = Utility.id');
  });

  it('alias personalizzato (anomalie)', () => {
    expect(costStatusSql(CostStatus.TO_TRANSFER, 'u')).toContain('ua.utility_id = u.id');
  });
});
```

- [ ] **Step 2: Verifica RED**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/utility/cost-status.spec.ts --maxWorkers=2`
Expected: FAIL, "Cannot find module './cost-status'".

- [ ] **Step 3: Implementazione**

`backend/src/apis/utility/cost-status.ts`:

```ts
import { ContractDirection, ContractStatus } from '@apis/utilizer-grant/enum/real-estate-contract.enum';
import { PartyFields, partyName } from '@apis/third-parties/third-party.name';

// "A carico di" calcolato (roadmap voce 12). Contratto attivo = contratto
// immobiliare in corso concesso dal Comune su un immobile dell'utenza; con
// voltura = attivo con "Utenze da volturare". Stato:
// - non volturata, nessun contratto con voltura → COMUNE
// - non volturata, contratto con voltura → TO_TRANSFER (paga il Comune finché il terzo non volta)
// - volturata a una parte di un contratto attivo → TRANSFERRED
// - volturata a chi non ha più un contratto attivo → TO_RECOVER
// costStatusSql è la stessa regola in SQL: tenerle allineate.
export enum CostStatus {
  COMUNE = 'COMUNE',
  TO_TRANSFER = 'TO_TRANSFER',
  TRANSFERRED = 'TRANSFERRED',
  TO_RECOVER = 'TO_RECOVER',
}

export interface CostParty {
  grant_id: number;
  third_party_id: number;
  name: string;
}

export interface CostInfo {
  status: CostStatus;
  parties: CostParty[];
  transferred_to: { id: number; name: string } | null;
  transferred_on: string | Date | null;
}

interface PartyLike extends PartyFields {
  id: number;
  deleted?: boolean | number | null;
}

// MySQL tinyint: flag e deleted possono arrivare come 1/0.
interface GrantLike {
  id: number;
  deleted?: boolean | number | null;
  status?: ContractStatus | null;
  direction?: ContractDirection | null;
  utilities_to_be_taken_over?: boolean | number | null;
  parties?: PartyLike[] | null;
}

export interface CostInput {
  assets?: { utilizerGrants?: GrantLike[] | null }[] | null;
  transferred_to_third_party_id?: number | null;
  transferredTo?: PartyLike | null;
  transferred_on?: string | Date | null;
}

const isActive = (g: GrantLike) =>
  !g.deleted && g.status === ContractStatus.ACTIVE && g.direction === ContractDirection.ACTIVE;

export function costInfo(utility: CostInput): CostInfo {
  const grants = (utility.assets ?? []).flatMap((a) => a?.utilizerGrants ?? []).filter(isActive);
  const parties: CostParty[] = [];
  const seen = new Set<string>();
  for (const grant of grants.filter((g) => !!g.utilities_to_be_taken_over)) {
    for (const p of grant.parties ?? []) {
      const key = `${grant.id}:${p.id}`;
      if (p.deleted || seen.has(key)) continue;
      seen.add(key);
      parties.push({ grant_id: grant.id, third_party_id: p.id, name: partyName(p) });
    }
  }

  const toId = utility.transferred_to_third_party_id ?? null;
  const transferredOn = utility.transferred_on ?? null;
  if (toId === null) {
    return {
      status: parties.length ? CostStatus.TO_TRANSFER : CostStatus.COMUNE,
      parties,
      transferred_to: null,
      transferred_on: transferredOn,
    };
  }
  const hasTitle = grants.some((g) => (g.parties ?? []).some((p) => p.id === toId && !p.deleted));
  return {
    status: hasTitle ? CostStatus.TRANSFERRED : CostStatus.TO_RECOVER,
    parties,
    transferred_to: { id: toId, name: utility.transferredTo ? partyName(utility.transferredTo) : '' },
    transferred_on: transferredOn,
  };
}

// Contratti attivi su immobili (non cancellati) dell'utenza, con parti non cancellate.
const activeGrantParties = (alias: string, extra: string) =>
  `SELECT 1 FROM utility_assets ua
     JOIN assets sa ON sa.id = ua.asset_id AND sa.deleted = 0
     JOIN utilizer_grant_assets uga ON uga.asset_id = ua.asset_id
     JOIN utilizer_grant g ON g.id = uga.utilizer_grant_id
       AND g.deleted = 0 AND g.status = 'ACTIVE' AND g.direction = 'ACTIVE'
     JOIN utilizer_grant_parties gp ON gp.utilizer_grant_id = g.id
     JOIN third_parties tp ON tp.id = gp.third_party_id AND tp.deleted = 0
   WHERE ua.utility_id = ${alias}.id AND ${extra}`;

export function costStatusSql(status: CostStatus, alias = 'Utility'): string {
  const transferredTo = `${alias}.transferred_to_third_party_id`;
  const withTransfer = activeGrantParties(alias, 'g.utilities_to_be_taken_over = 1');
  const withTitle = activeGrantParties(alias, `tp.id = ${transferredTo}`);
  switch (status) {
    case CostStatus.COMUNE:
      return `(${transferredTo} IS NULL AND NOT EXISTS (${withTransfer}))`;
    case CostStatus.TO_TRANSFER:
      return `(${transferredTo} IS NULL AND EXISTS (${withTransfer}))`;
    case CostStatus.TRANSFERRED:
      return `(${transferredTo} IS NOT NULL AND EXISTS (${withTitle}))`;
    case CostStatus.TO_RECOVER:
      return `(${transferredTo} IS NOT NULL AND NOT EXISTS (${withTitle}))`;
  }
}
```

- [ ] **Step 4: Verifica GREEN e commit**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/utility/cost-status.spec.ts --maxWorkers=2`
Expected: PASS (tutti).

```bash
git add backend/src/apis/utility/cost-status.ts backend/src/apis/utility/cost-status.spec.ts
git commit -m "feat(utenze): stato a carico di calcolato da contratti immobiliari e volture"
```

---

### Task 3: Voltura sull'utenza (entity, migration additiva, validazione, `cost_info`)

**Files:**
- Modify: `backend/src/apis/utility/entity/utility.entity.ts`, `backend/src/apis/utility/dto/create-utility.dto.ts`, `backend/src/apis/utility/dto/update-utility.dto.ts`, `backend/src/apis/utility/utility.service.ts`
- Test: `backend/src/apis/utility/utility.service.spec.ts`
- Create: `backend/src/database/migrations/1791800000000-AddUtilityTransfer.ts` (scritta prima in `backend/.scratch/`)

**Interfaces:**
- Consumes: `costInfo`, `CostInput` (Task 2).
- Produces: colonne `transferred_to_third_party_id`, `transferred_on`; relazione `Utility.transferredTo: ThirdParty`; campo di risposta `cost_info: CostInfo` su `findAll`/`findOne`/`findBySafeguard`; DTO create/update con `transferred_to_third_party_id?: number | null`, `transferred_on?: string | null`.

- [ ] **Step 1: Test che falliscono**

In `utility.service.spec.ts`, nel `describe` di `findAll`:

```ts
    it('aggiunge cost_info e carica il soggetto della voltura', async () => {
      qb.getMany.mockResolvedValue([
        {
          id: 1,
          assets: [{ utilizerGrants: [{
            id: 7, deleted: false, status: 'ACTIVE', direction: 'ACTIVE', utilities_to_be_taken_over: true,
            parties: [{ id: 3, type: 'LEGAL', company_name: 'Alfa Srl', deleted: false }],
          }] }],
        },
        { id: 2, assets: [] },
      ]);

      const result = (await service.findAll({} as never)) as unknown as { cost_info: { status: string } }[];

      expect(result[0].cost_info.status).toBe('TO_TRANSFER');
      expect(result[1].cost_info.status).toBe('COMUNE');
      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('Utility.transferredTo', 'transferredTo');
    });
```

Nel `describe` di create/update (accanto ai test ARERA):

```ts
    it('voltura a un soggetto inesistente o cancellato: 400', async () => {
      repo.findOne.mockResolvedValue({ id: 5, utility_type_id_fk: 33 });
      repo.manager.query.mockResolvedValue([]);
      await expect(service.update(5, { transferred_to_third_party_id: 99 } as never, 1)).rejects.toThrow(
        'Soggetto della voltura non trovato.',
      );
    });

    it('data di voltura senza soggetto: 400', async () => {
      repo.findOne.mockResolvedValue({ id: 5, transferred_to_third_party_id: null });
      await expect(service.update(5, { transferred_on: '2026-05-01' } as never, 1)).rejects.toThrow(
        "Indicare a chi è stata volturata l'utenza.",
      );
    });

    it('voltura a un soggetto esistente: salvata', async () => {
      repo.findOne.mockResolvedValue({ id: 5, transferred_to_third_party_id: null });
      repo.manager.query.mockResolvedValue([{ id: 3 }]);
      await expect(
        service.update(5, { transferred_to_third_party_id: 3, transferred_on: '2026-05-01' } as never, 1),
      ).resolves.not.toThrow();
      expect(repo.manager.query).toHaveBeenCalledWith(
        'SELECT id FROM third_parties WHERE id = ? AND deleted = 0',
        [3],
      );
    });
```

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/utility/utility.service.spec.ts -t "voltur|cost_info" --maxWorkers=2`
Expected: FAIL sui 4 test. (Se il test "salvata" fallisce per altri mock di `update`, adattare i mock seguendo il test "PATCH senza asset_ids/plant_ids non tocca i collegamenti".)

- [ ] **Step 2: Entity e DTO**

`utility.entity.ts` (import `ThirdParty` da `@apis/third-parties/entity/third-party.entity`):

```ts
  // Voltura: a chi è intestata ora l'utenza (null = Comune). Lo stato
  // "a carico di" si calcola confrontandola con i contratti immobiliari
  // (cost-status.ts).
  @Column({ type: 'int', nullable: true })
  transferred_to_third_party_id: number | null;

  @ManyToOne(() => ThirdParty, { nullable: true })
  @JoinColumn({ name: 'transferred_to_third_party_id' })
  transferredTo: ThirdParty | null;

  @Column({ type: 'date', nullable: true })
  transferred_on: string | null;
```

`create-utility.dto.ts` e `update-utility.dto.ts` (stesso stile delle altre date con `@NormalizeDate()`):

```ts
  @IsOptional()
  @IsInt()
  transferred_to_third_party_id?: number | null;

  @IsOptional()
  @NormalizeDate()
  @IsDateString()
  transferred_on?: string | null;
```

(Controllare in un campo data esistente del DTO l'ordine/nome reale dei decorator e allinearsi.)

- [ ] **Step 3: Service**

In `utility.service.ts`: import `{ costInfo } from './cost-status'`; in `withCurrentContractFields` aggiungere `cost_info: costInfo(utility),`; in `findAll`, `findBySafeguard`, `findOne` aggiungere `qb.leftJoinAndSelect('Utility.transferredTo', 'transferredTo');`.

Validazione:

```ts
  // Voltura: soggetto esistente; la data senza soggetto non ha senso.
  private async assertTransfer(
    thirdPartyId: number | null | undefined,
    transferredOn: string | null | undefined,
  ): Promise<void> {
    if (transferredOn && !thirdPartyId) {
      throw new BadRequestException("Indicare a chi è stata volturata l'utenza.");
    }
    if (!thirdPartyId) return;
    const rows = await this.repo.manager.query(
      'SELECT id FROM third_parties WHERE id = ? AND deleted = 0',
      [thirdPartyId],
    );
    if (!rows.length) throw new BadRequestException('Soggetto della voltura non trovato.');
  }
```

In `create`, dopo `assertAreraCategory`: `await this.assertTransfer(rest.transferred_to_third_party_id, rest.transferred_on);`.
In `update`, dopo il blocco ARERA:

```ts
    if (rest.transferred_to_third_party_id !== undefined || rest.transferred_on !== undefined) {
      const toId =
        rest.transferred_to_third_party_id !== undefined
          ? rest.transferred_to_third_party_id
          : current.transferred_to_third_party_id;
      // Ripresa dal Comune: senza soggetto la data si svuota.
      if (toId === null) payload.transferred_on = null;
      await this.assertTransfer(toId, toId === null ? null : (rest.transferred_on ?? current.transferred_on));
    }
```

(`payload` è dichiarato più sotto in `update`: spostare il blocco subito dopo la dichiarazione di `payload`, o dichiarare `payload` prima.)

- [ ] **Step 4: Migration additiva (scratch → definitiva)**

`backend/.scratch/1791800000000-AddUtilityTransfer.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

// Voltura dell'utenza (roadmap voce 12): a chi è intestata e da quando.
// Sostituisce, con costs_borne_by (rimossa dopo), il "costi a carico di"
// scritto a mano: lo stato si calcola dai contratti immobiliari.
export class AddUtilityTransfer1791800000000 implements MigrationInterface {
  name = 'AddUtilityTransfer1791800000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `utilities` ADD `transferred_to_third_party_id` int NULL');
    await q.query('ALTER TABLE `utilities` ADD `transferred_on` date NULL');
    await q.query(
      'ALTER TABLE `utilities` ADD CONSTRAINT `FK_utilities_transferred_to` FOREIGN KEY (`transferred_to_third_party_id`) REFERENCES `third_parties`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `utilities` DROP FOREIGN KEY `FK_utilities_transferred_to`');
    await q.query('ALTER TABLE `utilities` DROP COLUMN `transferred_on`');
    await q.query('ALTER TABLE `utilities` DROP COLUMN `transferred_to_third_party_id`');
  }
}
```

Spostarla in `backend/src/database/migrations/`, attendere nei log (`docker logs --since 120s utenzepa-api-1 2>&1 | grep -E "AddUtilityTransfer|Found 0 errors|ERROR"`) l'esecuzione; verificare `SHOW COLUMNS FROM utilities LIKE 'transferred%'` → 2 righe. Ciclo: `migration:revert` (comando in CLAUDE.md) → colonne assenti → `docker restart utenzepa-api-1` → colonne presenti.

- [ ] **Step 5: Verifica GREEN e commit**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/utility --maxWorkers=2`
Expected: PASS.

```bash
git add backend/src/apis/utility/entity/utility.entity.ts backend/src/apis/utility/dto/create-utility.dto.ts backend/src/apis/utility/dto/update-utility.dto.ts backend/src/apis/utility/utility.service.ts backend/src/apis/utility/utility.service.spec.ts backend/src/database/migrations/1791800000000-AddUtilityTransfer.ts
git commit -m "feat(utenze): voltura dell'utenza e stato a carico di nelle risposte"
```

---

### Task 4: Filtri nuovi (backend)

**Files:**
- Modify: `backend/src/apis/utility/dto/search-utility.dto.ts`, `backend/src/apis/utility/utility.service.ts`
- Test: `backend/src/apis/utility/dto/search-utility.dto.spec.ts` (create), `backend/src/apis/utility/utility.service.spec.ts`

**Interfaces:**
- Consumes: `CostStatus`, `costStatusSql` (Task 2).
- Produces: query param `asset_function_ids` (CSV di int), `plant_types` (CSV di `PlantType`), `cost_status` (`CostStatus`), `grant_id` (int). Consumati dal frontend (Task 8).

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

  it('cost_status accetta solo i quattro stati', async () => {
    for (const s of ['COMUNE', 'TO_TRANSFER', 'TRANSFERRED', 'TO_RECOVER']) {
      expect((await parse({ cost_status: s })).errors).toEqual([]);
    }
    expect((await parse({ cost_status: 'ALTRO' })).errors).not.toEqual([]);
  });

  it('grant_id numerico', async () => {
    expect((await parse({ grant_id: '12' })).dto.grant_id).toBe(12);
  });
});
```

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/utility/dto/search-utility.dto.spec.ts --maxWorkers=2`
Expected: FAIL.

- [ ] **Step 2: DTO**

In `search-utility.dto.ts` (import `IsEnum`, `IsIn` se mancanti; `PlantType` da `@apis/plants/enum/plant.enum`; `CostStatus` da `../cost-status`):

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

  // A carico di (calcolato, cost-status.ts).
  @IsOptional()
  @IsEnum(CostStatus)
  cost_status?: CostStatus;

  // Utenze collegate agli immobili di un contratto immobiliare (scheda contratto).
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsInt()
  grant_id?: number;
```

Run: comando dello Step 1. Expected: PASS.

- [ ] **Step 3: Test service che fallisce**

In `utility.service.spec.ts`, accanto al test "filtro per parte con sottoquery":

```ts
    it('filtro per funzione immobile con sotto-query', async () => {
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

    it('filtro a carico di usa costStatusSql', async () => {
      await service.findAll({ cost_status: 'TO_TRANSFER' } as never);
      expect(qb.andWhere).toHaveBeenCalledWith(costStatusSql(CostStatus.TO_TRANSFER));
    });

    it('filtro per contratto immobiliare con sotto-query', async () => {
      await service.findAll({ grant_id: 12 } as never);
      const call = qb.andWhere.mock.calls.find((c) => String(c[0]).includes('uga.utilizer_grant_id = :grant_id'));
      expect(call?.[1]).toEqual({ grant_id: 12 });
    });

    it('liste vuote: nessun filtro', async () => {
      await service.findAll({ asset_function_ids: [], plant_types: [] } as never);
      const sql = qb.andWhere.mock.calls.map((c) => String(c[0])).join('\n');
      expect(sql).not.toContain('function_id');
      expect(sql).not.toContain('p.type');
    });
```

(import `{ CostStatus, costStatusSql } from './cost-status'` in testa allo spec.)

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/utility/utility.service.spec.ts -t "filtro|liste vuote" --maxWorkers=2`
Expected: FAIL sui test nuovi.

- [ ] **Step 4: Service**

In `findAll`, dopo `if (filters.asset_id) {...}`:

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
    if (filters?.grant_id) {
      qb.andWhere(
        `Utility.id IN (SELECT ua.utility_id FROM utility_assets ua
           JOIN utilizer_grant_assets uga ON uga.asset_id = ua.asset_id
           WHERE uga.utilizer_grant_id = :grant_id)`,
        { grant_id: filters.grant_id },
      );
    }
    if (filters?.cost_status) {
      qb.andWhere(costStatusSql(filters.cost_status));
    }
```

Aggiungere `'asset_function_ids', 'plant_types', 'cost_status', 'grant_id'` all'elenco di esclusione di `this.applyFilters(...)`.

- [ ] **Step 5: Verifica GREEN e commit**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/utility --maxWorkers=2`
Expected: PASS.
Verifica SQL reale (correlazione su `Utility.id`): con il container su, `curl` (sandbox disattivata, porta 3010) a `/api/v1/utilities?cost_status=TO_TRANSFER` autenticato, oppure aspettare l'E2E del Task 9; in alternativa eseguire in MySQL la stessa condizione con alias `u`: `SELECT COUNT(*) FROM utilities u WHERE u.deleted=0 AND <costStatusSql(TO_TRANSFER,'u')>` → numero > 0.

```bash
git add backend/src/apis/utility/dto/search-utility.dto.ts backend/src/apis/utility/dto/search-utility.dto.spec.ts backend/src/apis/utility/utility.service.ts backend/src/apis/utility/utility.service.spec.ts
git commit -m "feat(utenze): filtri per funzione immobile, tipo impianto, contratto immobiliare e a carico di"
```

---

### Task 5: Anomalie volture

**Files:**
- Modify: `backend/src/apis/anomalies/anomalies.service.ts`
- Test: `backend/src/apis/anomalies/anomalies.service.spec.ts`

**Interfaces:**
- Consumes: `CostStatus`, `costStatusSql(status, 'u')` (Task 2).
- Produces: `Anomalies.utilities_to_transfer: AnomalyList<UtilityAnomaly>` (in `contracts`: "parti · dal gg/mm/aaaa"), `Anomalies.utilities_to_recover: AnomalyList<UtilityAnomaly>` (in `contracts`: soggetto della voltura).

- [ ] **Step 1: Test che fallisce**

Leggere lo spec esistente per il mock di `dataSource.query` (le query sono chiamate in ordine; la 11ª e 12ª sono ARERA e gas). Aggiungere un test che, con `query` mockata per restituire righe diverse per la 13ª e 14ª chiamata, verifichi:

```ts
  it('utenze da volturare e da riprendere, solo forniture attive', async () => {
    // ...mock come negli altri test, 13ª chiamata: [{ id: 1, utility_id: 'IT001E1', type: 'luce', contracts: 'Alfa Srl · dal 01/05/2026' }]
    // 14ª chiamata: [{ id: 2, utility_id: 'IT001E2', type: 'luce', contracts: 'Beta Spa' }]
    const result = await service.getAnomalies();
    expect(result.utilities_to_transfer.count).toBe(1);
    expect(result.utilities_to_recover.items[0].contracts).toBe('Beta Spa');
    const sqls = dataSource.query.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((s) => s.includes(costStatusSql(CostStatus.TO_TRANSFER, 'u')))).toBe(true);
    expect(sqls.some((s) => s.includes(costStatusSql(CostStatus.TO_RECOVER, 'u')))).toBe(true);
  });
```

(Completare i mock seguendo esattamente il pattern dei test esistenti dello stesso file.)

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/anomalies --maxWorkers=2`
Expected: FAIL.

- [ ] **Step 2: Implementazione**

In `anomalies.service.ts`: import `{ CostStatus, costStatusSql } from '@apis/utility/cost-status'`; aggiungere a `Anomalies` i due campi; dopo la query gas:

```ts
    // Contratto immobiliare con voltura attivo, utenza non ancora volturata:
    // paga il Comune finché il terzo non volta. Le più vecchie prima.
    const toTransfer: UtilityAnomaly[] = await this.dataSource.query(
      `SELECT ${utilityColumns},
              (SELECT CONCAT(GROUP_CONCAT(DISTINCT ${partyNameSql('tp')} SEPARATOR ', '),
                             IFNULL(CONCAT(' · dal ', DATE_FORMAT(MIN(g.start_date), '%d/%m/%Y')), ''))
                 FROM utility_assets ua
                 JOIN utilizer_grant_assets uga ON uga.asset_id = ua.asset_id
                 JOIN utilizer_grant g ON g.id = uga.utilizer_grant_id AND g.deleted = 0
                   AND g.status = 'ACTIVE' AND g.direction = 'ACTIVE' AND g.utilities_to_be_taken_over = 1
                 JOIN utilizer_grant_parties gp ON gp.utilizer_grant_id = g.id
                 JOIN third_parties tp ON tp.id = gp.third_party_id AND tp.deleted = 0
                WHERE ua.utility_id = u.id) AS contracts
       ${activeUtilities}
       AND ${costStatusSql(CostStatus.TO_TRANSFER, 'u')}
       ORDER BY contracts, u.utility_id`,
    );

    // Volturata a chi non ha più un contratto attivo sull'immobile.
    const toRecover: UtilityAnomaly[] = await this.dataSource.query(
      `SELECT ${utilityColumns}, ${partyNameSql('vt')} AS contracts
       ${activeUtilities.replace('FROM utilities u', 'FROM utilities u LEFT JOIN third_parties vt ON vt.id = u.transferred_to_third_party_id')}
       AND ${costStatusSql(CostStatus.TO_RECOVER, 'u')}
       ORDER BY u.utility_id`,
    );
```

Prima di scriverle, leggere la definizione reale di `utilityColumns` e `activeUtilities` nel file: se `activeUtilities` non comincia con `FROM utilities u`, inserire il `LEFT JOIN` nel punto corretto invece del `replace`; l'ordinamento per data va fatto su `MIN(g.start_date)` se `contracts` non ordina bene (preferibile: colonna `since` in più usata solo per `ORDER BY`). Nel `return`: `utilities_to_transfer: list(toTransfer)`, `utilities_to_recover: list(toRecover)`.

- [ ] **Step 3: Verifica GREEN, SQL reale e commit**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/anomalies --maxWorkers=2`
Expected: PASS.
Verifica SQL reale: chiamata `/api/v1/anomalies` (o la stessa query in MySQL) senza errori.

```bash
git add backend/src/apis/anomalies/anomalies.service.ts backend/src/apis/anomalies/anomalies.service.spec.ts
git commit -m "feat(anomalie): utenze da volturare e da riprendere"
```

---

### Task 6: Dati parte B — volture del pregresso (con conferma dell'utente)

Richiede `AddUtilityTransfer` applicata (Task 3) e `costs_borne_by` ancora presente. Nessun file del repo; SQL nello scratchpad. Ogni lista va mostrata all'utente (id, POD, immobili, contratti, ragioni sociali; persone fisiche indicate come tali) e applicata dopo il suo ok.

- [ ] **Step 1: "concessionario" e "azienda speciale" con contratto attivo → volturate**

```sql
SELECT u.id, u.utility_id, c.name costo, GROUP_CONCAT(DISTINCT g.id) contratti, COUNT(DISTINCT tp.id) parti, MIN(tp.id) parte FROM utilities u JOIN costs_borne_by c ON c.id=u.costs_borne_by_id_fk JOIN utility_assets ua ON ua.utility_id=u.id JOIN assets sa ON sa.id=ua.asset_id AND sa.deleted=0 JOIN utilizer_grant_assets uga ON uga.asset_id=ua.asset_id JOIN utilizer_grant g ON g.id=uga.utilizer_grant_id AND g.deleted=0 AND g.status='ACTIVE' AND g.direction='ACTIVE' JOIN utilizer_grant_parties gp ON gp.utilizer_grant_id=g.id JOIN third_parties tp ON tp.id=gp.third_party_id AND tp.deleted=0 WHERE u.deleted=0 AND c.name IN ('concessionario','azienda speciale') GROUP BY u.id;
```

Righe con `parti = 1`: dopo conferma `UPDATE utilities SET transferred_to_third_party_id=<parte>, update_date=update_date WHERE id IN (...)` (un UPDATE per parte). Righe con più parti: l'utente sceglie.

- [ ] **Step 2: "concessionario" senza contratto attivo**

```sql
SELECT u.id, u.utility_id, u.supply_active, GROUP_CONCAT(DISTINCT sa.asset_name) immobili FROM utilities u JOIN costs_borne_by c ON c.id=u.costs_borne_by_id_fk LEFT JOIN utility_assets ua ON ua.utility_id=u.id LEFT JOIN assets sa ON sa.id=ua.asset_id WHERE u.deleted=0 AND c.name='concessionario' AND u.transferred_to_third_party_id IS NULL GROUP BY u.id ORDER BY immobili;
```

Per gruppi di immobile: l'utente indica il contratto da aggiungere/correggere (dalla UI) e il soggetto, oppure "Comune" (nessun intervento). Applicare le volture indicate.

- [ ] **Step 3: valori specifici → note**

```sql
UPDATE utilities u JOIN costs_borne_by c ON c.id=u.costs_borne_by_id_fk SET u.notes=TRIM(CONCAT_WS('\n', NULLIF(u.notes,''), CONCAT('Ex costi a carico Access: ', c.name))), u.update_date=u.update_date WHERE u.deleted=0 AND c.name NOT IN ('comune','concessionario','COMUNE C/O ENGIE','azienda speciale');
```

Expected: 9 righe (GUARDIA COSTIERA 6, asl 2, il caso "il Comune rimborsa" 1), dopo conferma.

- [ ] **Step 4: Riepilogo**

```sql
SELECT 'COMUNE' s, COUNT(*) FROM utilities u WHERE u.deleted=0 AND <costStatusSql COMUNE con alias u> UNION ALL ...
```

(una riga per stato, condizioni copiate da `costStatusSql` con alias `u`). Annotare gli esiti nel ledger per la roadmap (Task 9). Nessun commit.

---

### Task 7: Rimozione backend di aggregati e costi a carico + migration

**Files:**
- Delete: `backend/src/apis/utility-aggregators/`, `backend/src/apis/costs-borne-by/`, `backend/src/apis/shared/entities/utility_cost_borne_by.entity.ts`
- Modify: `backend/src/app.module.ts`, `backend/src/apis/utility/entity/utility.entity.ts`, `backend/src/apis/utility/dto/{create,update,search}-utility.dto.ts`, `backend/src/apis/utility/utility.service.ts`, `backend/src/apis/utility/utility.service.spec.ts`
- Create: `backend/src/database/migrations/1791900000000-DropUtilityAggregators.ts`, `backend/src/database/migrations/1792000000000-DropCostsBorneBy.ts` (prima in `backend/.scratch/`)

**Interfaces:**
- Consumes: Task 1 e Task 6 completati.
- Produces: API utenza senza `aggregator_id_fk`, `aggregator`, `utilityAggregator`, `costs_borne_by_id_fk`, `costsBorneBy`; endpoint `/utility-aggregators` e `/costs-borne-by` rimossi.

- [ ] **Step 1: Test che fallisce**

Nel test "risolve il contratto corrente…": togliere `utilityAggregator: { id: 2 },`, togliere `aggregator: unknown;` dal tipo e sostituire `expect(enriched.aggregator).toEqual({ id: 2 });` con `expect(enriched).not.toHaveProperty('aggregator');`. Aggiungere:

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

- `utility.service.ts`: togliere `aggregator: utility.utilityAggregator ?? null,`; le tre `leftJoinAndSelect` su `Utility.costsBorneBy` e le due su `Utility.utilityAggregator`.
- `utility.entity.ts`: togliere import di `UtilityAggregator` e `CostsBorneBy`, colonne `costs_borne_by_id_fk`, `aggregator_id_fk` e relazioni `costsBorneBy`, `utilityAggregator`.
- DTO: togliere `costs_borne_by_id_fk` (in create con `@IsNotEmpty` obbligatorio) e `aggregator_id_fk` da create/update/search.
- `app.module.ts`: togliere `UtilityAggregatorsModule` e `CostsBorneByModule`.
- `git rm -r backend/src/apis/utility-aggregators backend/src/apis/costs-borne-by backend/src/apis/shared/entities/utility_cost_borne_by.entity.ts`
- `grep -rn "UtilityAggregator\|utilityAggregator\|aggregator_id_fk\|CostsBorneBy\|costsBorneBy\|costs_borne_by" backend/src --include=*.ts | grep -v migrations/` → nessun risultato.

- [ ] **Step 3: Migration (scratch)**

`backend/.scratch/1791900000000-DropUtilityAggregators.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

// Aggregati utenze eliminati (roadmap voce 11): l'informazione è nei
// collegamenti a immobili (funzione) e impianti (tipo). Solo schema.
export class DropUtilityAggregators1791900000000 implements MigrationInterface {
  name = 'DropUtilityAggregators1791900000000';

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

`backend/.scratch/1792000000000-DropCostsBorneBy.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

// "Costi a carico di" scritto a mano sostituito da voltura + stato calcolato
// (roadmap voce 12, apis/utility/cost-status.ts). Solo schema.
export class DropCostsBorneBy1792000000000 implements MigrationInterface {
  name = 'DropCostsBorneBy1792000000000';

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

L'indice `FK_…` sparisce con `DROP COLUMN`; nel `down()` lo ricrea `ADD CONSTRAINT … FOREIGN KEY`. Se una DDL fallisce a metà, pulire a mano schema e riga `migrations` come da CLAUDE.md.

- [ ] **Step 4: Verifica GREEN unit**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/utility --maxWorkers=2` → PASS. `docker exec utenzepa-api-1 pnpm run type-check` → nessun errore.

- [ ] **Step 5: Backup e ciclo migration**

```bash
P=$(grep '^MYSQL_PASSWORD=' .env | cut -d= -f2-); docker exec utenzepa-mysql-1 mysqldump -uroot -p"$P" mydatabase utilities utility_aggregators costs_borne_by > "<scratchpad>/pre-v190.sql"
```

Spostare i due file in `backend/src/database/migrations/`, attendere i log. Verificare colonne `aggregator_id_fk`/`costs_borne_by_id_fk` assenti e tabelle `utility_aggregators`/`costs_borne_by` assenti. Ciclo: `migration:revert` due volte → colonne/tabelle presenti e vuote → `docker restart utenzepa-api-1` → di nuovo assenti. `SELECT COUNT(*), SUM(CRC32(CONCAT_WS('|',id,notes,transferred_to_third_party_id))) FROM utilities` uguale prima e dopo il ciclo.

- [ ] **Step 6: Commit**

```bash
git add backend/src/app.module.ts backend/src/apis/utility backend/src/database/migrations/1791900000000-DropUtilityAggregators.ts backend/src/database/migrations/1792000000000-DropCostsBorneBy.ts
git commit -m "feat!: rimossi aggregati utenze e costi a carico manuali"
```

---

### Task 8: Frontend

**Files:**
- Delete: `frontend/src/app/pages/utility-aggregator/`, `frontend/src/app/pages/costs-borne-by/`
- Modify: `frontend/src/app/app.routes.ts`, `frontend/src/app/comp/sidebar/sidebar.component.ts`, `frontend/src/app/core/helpers/entity-status.ts`, `frontend/src/app/pages/utilities/entity/utility.{entity,interface}.ts`, `frontend/src/app/pages/utilities/utility-edit-dialog.component.{ts,html}`, `frontend/src/app/pages/utilities/utility-filter-dialog.component.{ts,html}`, `frontend/src/app/pages/utilities/search-utilities.component.ts`, `frontend/src/app/pages/utilities/data-table-utilities.component.{ts,html}`, `frontend/src/app/pages/utilizer-grant/utilizer-grant-edit-dialog.component.{ts,html}`, `frontend/src/app/pages/dashboard/anomalies-card.component.ts`

**Interfaces:**
- Consumes: `cost_info` (Task 3), campi `transferred_to_third_party_id`/`transferred_on`/`transferredTo`, filtri `asset_function_ids`, `plant_types`, `cost_status`, `grant_id` (Task 4), anomalie `utilities_to_transfer`/`utilities_to_recover` (Task 5).

- [ ] **Step 1: Modello e badge**

`utility.interface.ts`: togliere `ICostsBorneBy`/`UtilityAggregator`, `aggregator`, `aggregator_id_fk`, `costs_borne_by_id_fk`, `costsBorneBy`; aggiungere:

```ts
export type CostStatus = 'COMUNE' | 'TO_TRANSFER' | 'TRANSFERRED' | 'TO_RECOVER';

export interface CostInfo {
  status: CostStatus;
  parties: {grant_id: number; third_party_id: number; name: string}[];
  transferred_to: {id: number; name: string} | null;
  transferred_on: string | null;
}
```

e nell'interfaccia utenza `cost_info?: CostInfo; transferred_to_third_party_id?: number | null; transferred_on?: string | null;`. Stessi campi in `utility.entity.ts` (togliere anche il getter `isHighlighted`).

`entity-status.ts`:

```ts
export function costStatus(info: {status: string} | null | undefined): StatusInfo {
  switch (info?.status) {
    case 'TO_TRANSFER': return {tone: 'warn', label: 'Da volturare', icon: 'pending_actions'};
    case 'TRANSFERRED': return {tone: 'info', label: 'Volturata', icon: 'swap_horiz'};
    case 'TO_RECOVER': return {tone: 'danger', label: 'Da riprendere', icon: 'assignment_return'};
    default: return {tone: 'ok', label: 'Comune', icon: 'account_balance'};
  }
}
```

- [ ] **Step 2: Pagine, route, sidebar**

`git rm -r frontend/src/app/pages/utility-aggregator frontend/src/app/pages/costs-borne-by`; togliere route e voci di sidebar corrispondenti.

- [ ] **Step 3: Scheda utenza**

`utility-edit-dialog.component.ts`: togliere `UtilityAggregatorsService`, `CostsBorneByService`, `aggregatorOptions`, `costsBorneByOptions`, controlli `aggregator_id_fk`/`costs_borne_by_id_fk` e relative `search()`, `grantsByAsset()`, `counterpartCount()`. Aggiungere al form:

```ts
    transferred_to_third_party_id: [this.data.item.transferred_to_third_party_id ?? null],
    transferred_on: [this.toDate(this.data.item.transferred_on)],
```

e:

```ts
  readonly costStatus = costStatus;

  // Soggetti a cui si può volturare: parti dei contratti con voltura più
  // l'intestatario attuale (anche se senza contratto).
  get transferOptions(): TOption[] {
    const info = this.data.item.cost_info;
    const opts = new Map<number, string>();
    for (const p of info?.parties ?? []) opts.set(p.third_party_id, p.name);
    if (info?.transferred_to) opts.set(info.transferred_to.id, info.transferred_to.name);
    return [...opts].map(([value, label]) => ({value, label}));
  }

  markTransferredToday(): void {
    const parties = this.data.item.cost_info?.parties ?? [];
    if (parties.length !== 1) return;
    this.form.patchValue({transferred_to_third_party_id: parties[0].third_party_id, transferred_on: new Date()});
    this.form.markAsDirty();
  }

  recoverToComune(): void {
    this.form.patchValue({transferred_to_third_party_id: null, transferred_on: null});
    this.form.markAsDirty();
  }

  openGrant(id: number): void {
    this.navigator.openGrant(id).subscribe();
  }
```

`transferOptions` come getter va bene solo per `mat-select` (non per `app-linked-table`/`FilterableSelect`, vedi CLAUDE.md): usare `mat-select`.

`utility-edit-dialog.component.html`: togliere i blocchi "ID Aggregato" e "Costi a Carico di", `'costs_borne_by_id_fk'` da `invalid(...)`, il tab Controparti. Dopo il `</div>` della griglia "Capitolo di Spesa", prima di "Indirizzo e posizione":

```html
        @if (!isNew) {
          <div class="sheet-section-title"><mat-icon>payments</mat-icon>A carico di</div>
          <div class="sheet-grid">
            <div class="span-all" style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
              <app-status-badge [info]="costStatus(data.item.cost_info)"></app-status-badge>
              @for (p of data.item.cost_info?.parties ?? []; track p.grant_id + '-' + p.third_party_id) {
                <a href="javascript:void(0)" (click)="openGrant(p.grant_id)">{{ p.name }}</a>
              }
              @if (canEdit && data.item.cost_info?.status === 'TO_TRANSFER' && data.item.cost_info?.parties?.length === 1) {
                <button mat-stroked-button type="button" (click)="markTransferredToday()">Segna volturata oggi</button>
              }
              @if (canEdit && form.controls.transferred_to_third_party_id.value) {
                <button mat-button type="button" (click)="recoverToComune()">Ripresa dal Comune</button>
              }
            </div>
            <mat-form-field class="span-2">
              <mat-label>Volturata a</mat-label>
              <mat-select formControlName="transferred_to_third_party_id">
                <mat-option [value]="null">Non volturata (Comune)</mat-option>
                @for (opt of transferOptions; track opt.value) {
                  <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field>
              <mat-label>Volturata il</mat-label>
              <input matInput [matDatepicker]="transferredOnPicker" formControlName="transferred_on">
              <mat-datepicker-toggle matSuffix [for]="transferredOnPicker"></mat-datepicker-toggle>
              <mat-datepicker #transferredOnPicker></mat-datepicker>
            </mat-form-field>
          </div>
        }
```

(Lo stato mostrato è quello salvato: si aggiorna dopo Salva, quando la scheda viene ricaricata. Se `canEdit` ha un altro nome nel componente, usare quello.)

- [ ] **Step 4: Scheda contratto immobiliare — tab Utenze**

In `utilizer-grant-edit-dialog.component.ts`: iniettare `UtilitiesService` (path reale in `pages/utilities/`), proprietà `utilityRows: Utility[] = []`, colonne per `app-linked-table` (stesso formato di `assetColumns`): `{label: 'POD/PDR', value: u => u.utility_id}`, `{label: 'Tipo', value: u => u.utilityType?.name ?? ''}`, `{label: 'Volturata a', value: u => u.cost_info?.transferred_to?.name ?? ''}`; `readonly utilityStatusOf = (u: Utility): StatusInfo => costStatus(u.cost_info);`. Caricamento in `ngOnInit` se il contratto esiste: `this.utilitiesService.search({grant_id: this.data.item.id, deleted: false} as never).subscribe(rows => this.utilityRows = rows);` (campo cache, non getter). `openUtility(id)` via `this.navigator.openUtility(id).subscribe(() => ricarica)`.

HTML, dopo il tab Immobili:

```html
      @if (!isNew) {
        <mat-tab aria-label="Utenze">
          <ng-template mat-tab-label>
            <app-tab-label icon="bolt" label="Utenze" [count]="utilityRows.length"></app-tab-label>
          </ng-template>
          <p class="sheet-hint">Le volture si segnano dalla scheda dell'utenza.</p>
          <app-linked-table
            [columns]="utilityColumns"
            [rows]="utilityRows"
            [rowStatus]="utilityStatusOf"
            emptyText="Nessuna utenza sugli immobili del contratto."
            (open)="openUtility($event.id)">
          </app-linked-table>
        </mat-tab>
      }
```

(adattare `isNew` al nome reale del flag nel componente.)

- [ ] **Step 5: Filtri e tabella**

`utility-filter-dialog.component.ts`: togliere aggregati e costi a carico (servizi, opzioni, campi, form). Aggiungere a `UtilityFilterValues` `asset_function_ids: number[] | null; plant_types: string[] | null; cost_status: string | null;`, al form `asset_function_ids: [this.data.values.asset_function_ids ?? []]`, `plant_types: [this.data.values.plant_types ?? []]`, `cost_status: [this.data.values.cost_status ?? null]`; opzioni:

```ts
  assetFunctionOptions: TOption[] = [];
  readonly plantTypeOptions: TOption[] = (Object.keys(PLANT_TYPE_LABEL) as PlantType[])
    .map(t => ({label: PLANT_TYPE_LABEL[t], value: t}))
    .sort((a, b) => a.label.localeCompare(b.label));
  readonly costStatusOptions: TOption[] = [
    {label: 'Comune', value: 'COMUNE'},
    {label: 'Da volturare', value: 'TO_TRANSFER'},
    {label: 'Volturata', value: 'TRANSFERRED'},
    {label: 'Da riprendere', value: 'TO_RECOVER'},
  ];
```

caricamento funzioni con `AssetFunctionsService.search({deleted: false})` → `{label: f.name, value: f.id}` ordinati.

HTML: al posto di "Aggregato" due `mat-select multiple` ("Funzione immobile" su `asset_function_ids`, "Tipo impianto" su `plant_types`); al posto di "Costi a Carico di" un `mat-select` "A carico di" su `cost_status` con opzione `null` "Tutti" e `costStatusOptions`.

`search-utilities.component.ts`: sostituire `costs_borne_by_id_fk: [null]`, `aggregator_id_fk: [null]` con `asset_function_ids: [[]]`, `plant_types: [[]]`, `cost_status: [null]`; se c'è un conteggio filtri attivi, un array vuoto non deve contare.

`data-table-utilities.component.ts/html`: togliere aggregati (servizio, mappa, colonna `aggregator.description`, case del sorting); colonna `costsBorneBy.name` → `{field: 'cost_info', header: 'A carico di', minWidth: '170px'}` (anche tra le colonne di default), sorting/export con:

```ts
  payerLabel(utility: Utility): string {
    const info = utility.cost_info;
    const name = info?.transferred_to?.name || (info?.parties ?? []).map(p => p.name).join(', ');
    return [costStatus(info).label, name].filter(Boolean).join(' · ');
  }
```

HTML:

```html
  <ng-container matColumnDef="cost_info">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>A carico di</th>
    <td mat-cell *matCellDef="let item">
      <app-status-badge size="sm" [info]="costStatus(item.cost_info)"></app-status-badge>
      {{ item.cost_info?.transferred_to?.name || '' }}
    </td>
  </ng-container>
```

(import `StatusBadgeComponent` nel componente tabella se manca, `readonly costStatus = costStatus`.)

- [ ] **Step 6: Card anomalie**

`anomalies-card.component.ts`: due campi nell'interfaccia (`utilities_to_transfer`, `utilities_to_recover`: `AnomalyList<UtilityAnomaly>`), due pannelli sul modello di "Utenze gas attive senza categoria d'uso" con titoli "Utenze da volturare" e "Utenze volturate da riprendere", riga `{{ u.utility_id }} · {{ u.type }} · {{ u.contracts }}`, click `openUtility(u.id)`; sommare i due `count` al totale.

- [ ] **Step 7: Compilazione e commit**

`grep -rn "ggregator_id_fk\|utilityAggregator\|UtilityAggregator\|costs_borne\|costsBorne\|CostsBorne\|utility-aggregator\|costs-borne-by" frontend/src/app --include=*.ts --include=*.html` → nessun risultato.
`docker logs --since 60s utenzepa-frontend-1 2>&1 | grep -E "✘|generation"` → "generation complete", nessun `✘`.

```bash
git add frontend/src/app/app.routes.ts frontend/src/app/comp/sidebar/sidebar.component.ts frontend/src/app/core/helpers/entity-status.ts frontend/src/app/pages/utilities frontend/src/app/pages/utilizer-grant frontend/src/app/pages/dashboard/anomalies-card.component.ts
git commit -m "feat(frontend): volture e a carico di calcolato, filtri per funzione immobile e tipo impianto"
```

---

### Task 9: E2E, documentazione, versione

**Files:**
- Modify: `CLAUDE.md`, `docs/roadmap-patrimonio.md`, `publiccode.yml`

- [ ] **Step 1: E2E Playwright**

Utente temporaneo come da CLAUDE.md (creato via SQL, eliminato a fine test con `audit_logs`). Aprendo le schede dalla riga dell'elenco:
1. Filtri → Funzione immobile = Istruzione: utenze delle scuole; Tipo impianto = Fontana; A carico di = Da volturare: righe con badge "Da volturare".
2. Scheda di un'utenza Da volturare con una sola parte: "Segna volturata oggi" → Salva → riaperta: badge "Volturata", "Volturata a" e data valorizzati. Poi "Ripresa dal Comune" → Salva → torna "Da volturare". Ripristinare lo stato iniziale.
3. Click sul nome della parte → si apre la scheda del contratto immobiliare; tab Utenze con stati.
4. Dashboard: pannelli "Utenze da volturare" e "Utenze volturate da riprendere".
5. Nuova utenza (immobile + capitolo): salva senza errori; poi DELETE fisico (con `utility_assets`, `audit_logs`).
6. Nessuna voce "Aggregati Utenze" né campi Aggregato/Costi a carico/tab Controparti.

- [ ] **Step 2: Documentazione**

- `CLAUDE.md`: dall'elenco moduli togliere `utility-aggregators` e `costs-borne-by`; nella nota "Disalimentabilità utenza…" aggiungere: "A carico di: `utilities.transferred_to_third_party_id`/`transferred_on` (voltura) + stato calcolato in `apis/utility/cost-status.ts` (`costInfo` su dati caricati, gemella SQL `costStatusSql` per filtro e anomalie: tenerle allineate). Aggregati utenze e lista costi a carico non esistono più."
- Roadmap: righe 11 e 12 → "fatto, v1.8.1 (…esito liste dal ledger…)"; sezioni 11 e 12 con "Fatto in v1.8.1: spec …", esiti e residui (capitolo delle 10 SPRAR alla ragioneria, 7 immobili senza funzione, utenze "Da volturare" da verificare). "Aggiornata:" → 2026-10-03.
- `publiccode.yml`: `softwareVersion: 1.8.1`, `releaseDate` = data di rilascio.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/roadmap-patrimonio.md publiccode.yml
git commit -m "docs: voci 11 e 12 della roadmap, v1.8.1"
```

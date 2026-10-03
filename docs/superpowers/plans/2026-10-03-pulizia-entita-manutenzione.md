# Pulizia entità e manutenzione a carico — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminare tabelle morte, aggregati immobili e gestori manutenzione; introdurre "Manutenzione a carico di" calcolata da due spunte sui contratti; anomalia immobili senza natura o funzione. Release v1.9.0.

**Architecture:** Stesso schema di "A carico di" (v1.8.1): funzione pura `maintenanceInfo` sui dati che `UtilitiesService` già carica + gemella SQL `maintenanceStatusSql` per il filtro. Migration solo schema (dati già sistemati sul DB locale, one-shot fuori dal repo). Frontend: badge da `entity-status.ts`, spunte nelle schede contratto, rimozione pagine.

**Tech Stack:** NestJS 11 + TypeORM/MySQL 8, Angular 22 + Material, jest (backend), E2E Playwright MCP (frontend).

**Spec:** `docs/superpowers/specs/2026-10-03-pulizia-entita-manutenzione-design.md`

## Global Constraints

- Niente dati personali in doc, test, commit: nomi fittizi (es. "Alfa Srl"), mai nominativi/CF reali.
- Migration dei dati sempre one-shot fuori dal repo (SQL nello scratchpad); le migration del repo toccano solo lo schema.
- Bozze delle migration in `backend/.scratch/`, spostate in `backend/src/database/migrations/` solo a contenuto finale (il watcher le esegue appena compaiono).
- Comandi jest sempre `--maxWorkers=2`, dentro il container: `docker exec utenzepa-api-1 pnpm exec jest <path> --maxWorkers=2`. Comandi Docker uno alla volta, mai in parallelo.
- Mai `git add .`/`-A`: elencare i file. Dopo un lint nel container scartare i file `0 0` di `git diff --numstat`.
- Frontend: nessun test runner; verifica = log di `ng serve` (`docker logs --since 60s utenzepa-frontend-1 2>&1 | grep -E "✘|generation"`) + `ng build` finale + E2E Playwright.
- Conflitti/errori di validazione: sempre 400 con messaggio italiano, mai 409.
- Etichette UI: "Manutenzione", stati "Comune" / "Fornitore" / "Controparte"; spunte "Manutenzione inclusa" (contratto di fornitura) e "Manutenzione a carico della controparte" (contratto immobiliare).
- Versione: `publiccode.yml` `softwareVersion: "v1.9.0"`, `releaseDate: "2026-10-03"`.

## Review Focus

1. Utenza collegata a più contratti di fornitura (rinnovi Consip) di cui solo uno chiuso con il flag: deve restare Comune, il flag conta solo sui contratti aperti → test in Task 2.
2. Contratto immobiliare passivo (il Comune è conduttore) con il flag: deve dare Controparte, a differenza di "A carico di" che lo ignora → test in Task 2.
3. Immobile legacy ancora senza natura/funzione aperto e salvato dopo la rimozione degli aggregati: il Salva non deve bloccarsi; un immobile già classificato non deve poter tornare vuoto → Task 6, regola `mustClassify` + E2E.
4. `invoice_budget_chapter` in produzione con o senza FK e con eventuali righe orfane: la migration non deve fallire a metà né duplicare la FK → test in Task 1.
5. Utenza con `maintenance_info` nel payload di Salva: il backend usa `forbidNonWhitelisted`, il campo calcolato non deve tornare indietro → `@Exclude({toPlainOnly: true})` in Task 7 + E2E di salvataggio.

---

### Task 1: Tabelle morte e FK di `invoice_budget_chapter`

**Files:**
- Delete: `backend/src/apis/shared/entities/acaKeys.entity.ts`
- Create: `backend/src/database/migrations/1792100000000-DropDeadTables.ts`
- Create: `backend/src/database/migrations/1792200000000-InvoiceBudgetChapterFk.ts`
- Test: `backend/src/database/invoice-budget-chapter-fk.migration.spec.ts` (fuori da `migrations/`: il glob caricherebbe lo spec come migration)

**Interfaces:**
- Produces: nessuna interfaccia di codice; schema senza `fk_test`/`aca_keys`, FK su `invoice_budget_chapter`.

Nel DB locale `invoice_budget_chapter` non ha FK (drift: `InitialSchema` le creava, `FK_891310b3d845fe3f7d00346e65b` su `invoice_id` e `FK_9cffdf1bcf101d43271ac87c53d` su `budget_chapter_id`); in produzione potrebbero esserci. La migration le aggiunge solo se mancano.

- [ ] **Step 1: Verificare che `AcaKeys` non sia referenziato**

Run: `grep -rn "AcaKeys\|acaKeys" backend/src --include=*.ts | grep -v migrations`
Expected: solo `backend/src/apis/shared/entities/acaKeys.entity.ts`. Cancellare il file.

- [ ] **Step 2: Scrivere il test della migration FK (fallisce: file inesistente)**

```ts
import { InvoiceBudgetChapterFk1792200000000 } from './migrations/1792200000000-InvoiceBudgetChapterFk';

// QueryRunner simulato: risponde alle SELECT di controllo, registra le DDL.
const runner = (existing: string[], orphans: number) => {
  const ddl: string[] = [];
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('information_schema')) return existing.map((name) => ({ name }));
    if (sql.includes('orphans')) return [{ orphans }];
    ddl.push(sql);
    return [];
  });
  return { q: { query } as never, ddl };
};

describe('InvoiceBudgetChapterFk', () => {
  const m = new InvoiceBudgetChapterFk1792200000000();

  it('aggiunge le due FK se mancano', async () => {
    const { q, ddl } = runner([], 0);
    await m.up(q);
    expect(ddl).toHaveLength(2);
    expect(ddl[0]).toContain('FK_891310b3d845fe3f7d00346e65b');
    expect(ddl[1]).toContain('FK_9cffdf1bcf101d43271ac87c53d');
  });

  it('non duplica le FK già presenti', async () => {
    const { q, ddl } = runner(['FK_891310b3d845fe3f7d00346e65b', 'FK_9cffdf1bcf101d43271ac87c53d'], 0);
    await m.up(q);
    expect(ddl).toHaveLength(0);
  });

  it('si ferma con errore leggibile se ci sono righe orfane', async () => {
    const { q, ddl } = runner([], 3);
    await expect(m.up(q)).rejects.toThrow('invoice_budget_chapter: 3 righe orfane');
    expect(ddl).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Eseguire il test**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/database/invoice-budget-chapter-fk.migration.spec.ts --maxWorkers=2`
Expected: FAIL, "Cannot find module './migrations/1792200000000-InvoiceBudgetChapterFk'".

- [ ] **Step 4: Scrivere le due migration in `backend/.scratch/`, poi spostarle in `src/database/migrations/`**

`1792100000000-DropDeadTables.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

// Tabelle morte (roadmap voce 18): fk_test (residuo di prove, senza entity) e
// aca_keys (mai usata, avrebbe tenuto credenziali in chiaro). Solo schema.
export class DropDeadTables1792100000000 implements MigrationInterface {
  name = 'DropDeadTables1792100000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS `fk_test`');
    await q.query('DROP TABLE IF EXISTS `aca_keys`');
  }

  // Ricrea le strutture vuote.
  public async down(q: QueryRunner): Promise<void> {
    await q.query('CREATE TABLE `fk_test` (`id` int NOT NULL, PRIMARY KEY (`id`)) ENGINE=InnoDB');
    await q.query(
      'CREATE TABLE `aca_keys` (`id` int NOT NULL AUTO_INCREMENT, `username` varchar(100) NOT NULL, `password` varchar(255) NOT NULL, `utility_id` int NULL, `create_date` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `update_date` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), `created_by_user_id` int NOT NULL, `updated_by_user_id` int NOT NULL, `deleted` tinyint NOT NULL DEFAULT 0, UNIQUE INDEX `REL_a23304180e4457edc6e985c8a7` (`utility_id`), INDEX `IDX_8a11ef487d5449dc70defd8bf1` (`created_by_user_id`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await q.query(
      'ALTER TABLE `aca_keys` ADD CONSTRAINT `FK_a23304180e4457edc6e985c8a73` FOREIGN KEY (`utility_id`) REFERENCES `utilities`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await q.query(
      'ALTER TABLE `aca_keys` ADD CONSTRAINT `FK_8a11ef487d5449dc70defd8bf17` FOREIGN KEY (`created_by_user_id`) REFERENCES `system_users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await q.query(
      'ALTER TABLE `aca_keys` ADD CONSTRAINT `FK_d3445744fbdb002ec5d9abaf3ab` FOREIGN KEY (`updated_by_user_id`) REFERENCES `system_users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
  }
}
```

`1792200000000-InvoiceBudgetChapterFk.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

// invoice_budget_chapter senza FK (drift del DB di sviluppo): le righe restavano
// orfane quando le fatture cambiavano id. Aggiunge le FK di InitialSchema solo
// se mancano; con righe orfane si ferma prima di ogni DDL (commit implicito).
const FKS = [
  {
    name: 'FK_891310b3d845fe3f7d00346e65b',
    sql: 'ALTER TABLE `invoice_budget_chapter` ADD CONSTRAINT `FK_891310b3d845fe3f7d00346e65b` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
  },
  {
    name: 'FK_9cffdf1bcf101d43271ac87c53d',
    sql: 'ALTER TABLE `invoice_budget_chapter` ADD CONSTRAINT `FK_9cffdf1bcf101d43271ac87c53d` FOREIGN KEY (`budget_chapter_id`) REFERENCES `budget_chapters`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
  },
];

export class InvoiceBudgetChapterFk1792200000000 implements MigrationInterface {
  name = 'InvoiceBudgetChapterFk1792200000000';

  public async up(q: QueryRunner): Promise<void> {
    const existing: { name: string }[] = await q.query(
      "SELECT CONSTRAINT_NAME AS name FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoice_budget_chapter' AND CONSTRAINT_TYPE = 'FOREIGN KEY'",
    );
    const missing = FKS.filter((fk) => !existing.some((e) => e.name === fk.name));
    if (!missing.length) return;
    const [{ orphans }]: { orphans: number | string }[] = await q.query(
      'SELECT COUNT(*) AS orphans FROM `invoice_budget_chapter` ibc LEFT JOIN `invoices` i ON i.id = ibc.invoice_id LEFT JOIN `budget_chapters` b ON b.id = ibc.budget_chapter_id WHERE i.id IS NULL OR b.id IS NULL',
    );
    if (Number(orphans) > 0) {
      throw new Error(
        `invoice_budget_chapter: ${Number(orphans)} righe orfane (fattura o capitolo inesistente). Cancellarle prima di rilanciare la migration.`,
      );
    }
    for (const fk of missing) await q.query(fk.sql);
  }

  // Nessun down: le FK potevano esistere già prima (produzione), toglierle
  // lascerebbe lo schema peggiore di prima.
  public async down(): Promise<void> {}
}
```

Prima di spostare `InvoiceBudgetChapterFk` nella cartella definitiva verificare sul DB locale che le righe orfane siano 0: `docker exec utenzepa-mysql-1 mysql -uroot -p'<MYSQL_PASSWORD>' mydatabase -e "SELECT COUNT(*) FROM invoice_budget_chapter"` → 0.

- [ ] **Step 5: Eseguire il test**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/database/invoice-budget-chapter-fk.migration.spec.ts --maxWorkers=2`
Expected: PASS 3/3.

- [ ] **Step 6: Verificare l'esecuzione reale**

Run: `docker logs --since 120s utenzepa-api-1 2>&1 | grep -E "DropDeadTables|InvoiceBudgetChapterFk|ERROR|Found 0 errors"` poi `SHOW TABLES LIKE 'fk_test'; SHOW TABLES LIKE 'aca_keys';` (vuoti) e la query FK su `information_schema.TABLE_CONSTRAINTS` per `invoice_budget_chapter` (2 righe).

- [ ] **Step 7: Commit**

```bash
git add backend/src/apis/shared/entities/acaKeys.entity.ts backend/src/database/migrations/1792100000000-DropDeadTables.ts backend/src/database/migrations/1792200000000-InvoiceBudgetChapterFk.ts backend/src/database/invoice-budget-chapter-fk.migration.spec.ts
git commit -m "feat: tabelle morte eliminate e FK su invoice_budget_chapter"
```

---

### Task 2: `maintenanceInfo` e `maintenanceStatusSql`

**Files:**
- Create: `backend/src/apis/utility/maintenance-status.ts`
- Test: `backend/src/apis/utility/maintenance-status.spec.ts`

**Interfaces:**
- Consumes: `partyName`, `PartyFields` da `@apis/third-parties/third-party.name`; `ContractStatus` da `@apis/utilizer-grant/enum/real-estate-contract.enum`.
- Produces:
  - `enum MaintenanceStatus { COMUNE = 'COMUNE', SUPPLIER = 'SUPPLIER', COUNTERPARTY = 'COUNTERPARTY' }`
  - `interface MaintenanceInfo { status: MaintenanceStatus; contracts: { id: number; name: string }[]; parties: { grant_id: number; third_party_id: number; name: string }[] }`
  - `maintenanceInfo(utility: MaintenanceInput): MaintenanceInfo` dove `MaintenanceInput = { contratti?: SupplyContractLike[] | null; assets?: { utilizerGrants?: GrantLike[] | null }[] | null }`
  - `maintenanceStatusSql(status: MaintenanceStatus, alias = 'Utility'): string`

- [ ] **Step 1: Scrivere il test**

```ts
import { MaintenanceStatus, maintenanceInfo, maintenanceStatusSql } from './maintenance-status';
import {
  ContractDirection,
  ContractStatus,
} from '@apis/utilizer-grant/enum/real-estate-contract.enum';
import { ThirdPartyType } from '@apis/third-parties/enum/third-party.enum';

const party = (id: number, name: string, extra = {}) => ({
  id,
  type: ThirdPartyType.LEGAL,
  company_name: name,
  deleted: false,
  ...extra,
});
const supply = (id: number, supplier: ReturnType<typeof party> | null, extra = {}) => ({
  id,
  deleted: false,
  closed: false,
  maintenance_included: true,
  supplier,
  ...extra,
});
const grant = (id: number, parties: unknown[], extra = {}) => ({
  id,
  deleted: false,
  status: ContractStatus.ACTIVE,
  direction: ContractDirection.ACTIVE,
  maintenance_by_counterparty: true,
  parties,
  ...extra,
});
const utility = (contratti: unknown[], grantsPerAsset: unknown[][] = []) =>
  ({ contratti, assets: grantsPerAsset.map((utilizerGrants) => ({ utilizerGrants })) }) as never;

describe('maintenanceInfo', () => {
  it('nessun contratto con flag: Comune', () => {
    expect(
      maintenanceInfo(
        utility(
          [supply(1, party(9, 'Luce Spa'), { maintenance_included: false })],
          [[grant(7, [party(3, 'Alfa Srl')], { maintenance_by_counterparty: false })]],
        ),
      ),
    ).toEqual({ status: MaintenanceStatus.COMUNE, contracts: [], parties: [] });
  });

  it('fornitura aperta con manutenzione inclusa: Fornitore, con nome', () => {
    const info = maintenanceInfo(utility([supply(1, party(9, 'Luce Spa'))]));
    expect(info.status).toBe(MaintenanceStatus.SUPPLIER);
    expect(info.contracts).toEqual([{ id: 1, name: 'Luce Spa' }]);
  });

  it.each([
    ['chiusa', { closed: true }],
    ['chiusa (1 da MySQL)', { closed: 1 }],
    ['cancellata', { deleted: true }],
  ])('fornitura %s con flag non conta', (_l, extra) => {
    expect(maintenanceInfo(utility([supply(1, party(9, 'Luce Spa'), extra)])).status).toBe(
      MaintenanceStatus.COMUNE,
    );
  });

  it('rinnovi: contratto chiuso con flag e aperto senza → Comune', () => {
    const info = maintenanceInfo(
      utility([
        supply(1, party(9, 'Luce Spa'), { closed: true }),
        supply(2, party(9, 'Luce Spa'), { maintenance_included: false }),
      ]),
    );
    expect(info.status).toBe(MaintenanceStatus.COMUNE);
  });

  it('fornitore non caricato: nome vuoto', () => {
    expect(maintenanceInfo(utility([supply(1, null)])).contracts).toEqual([{ id: 1, name: '' }]);
  });

  it.each([
    ['attivo', ContractDirection.ACTIVE],
    ['passivo', ContractDirection.PASSIVE],
  ])('contratto immobiliare %s con flag: Controparte', (_l, direction) => {
    const info = maintenanceInfo(utility([], [[grant(7, [party(3, 'Alfa Srl')], { direction })]]));
    expect(info.status).toBe(MaintenanceStatus.COUNTERPARTY);
    expect(info.parties).toEqual([{ grant_id: 7, third_party_id: 3, name: 'Alfa Srl' }]);
  });

  it.each([
    ['cessato', { status: ContractStatus.TERMINATED }],
    ['restituito', { status: ContractStatus.RETURNED }],
    ['cancellato', { deleted: 1 }],
  ])('contratto immobiliare %s non conta', (_l, extra) => {
    expect(
      maintenanceInfo(utility([], [[grant(7, [party(3, 'Alfa Srl')], extra)]])).status,
    ).toBe(MaintenanceStatus.COMUNE);
  });

  it('contratto con flag senza parti valide: Comune', () => {
    expect(
      maintenanceInfo(utility([], [[grant(7, [party(3, 'A', { deleted: true })])]])).status,
    ).toBe(MaintenanceStatus.COMUNE);
  });

  it('entrambi: prevale Fornitore', () => {
    const info = maintenanceInfo(
      utility([supply(1, party(9, 'Luce Spa'))], [[grant(7, [party(3, 'Alfa Srl')])]]),
    );
    expect(info.status).toBe(MaintenanceStatus.SUPPLIER);
  });

  it('stesso contratto su due immobili: una volta; flag 1 da MySQL', () => {
    const g = grant(7, [party(3, 'Alfa Srl')], { maintenance_by_counterparty: 1 });
    expect(maintenanceInfo(utility([], [[g], [g]])).parties).toHaveLength(1);
  });

  it('dati mancanti: Comune', () => {
    expect(maintenanceInfo({}).status).toBe(MaintenanceStatus.COMUNE);
    expect(maintenanceInfo({ assets: [{}] } as never).status).toBe(MaintenanceStatus.COMUNE);
  });
});

describe('maintenanceStatusSql', () => {
  const supplier = 'c.maintenance_included = 1';
  const grantFlag = 'g.maintenance_by_counterparty = 1';

  it('Fornitore: EXISTS sulle forniture aperte con flag', () => {
    const sql = maintenanceStatusSql(MaintenanceStatus.SUPPLIER);
    expect(sql).toContain('EXISTS (');
    expect(sql).not.toContain('NOT EXISTS');
    expect(sql).toContain(supplier);
    expect(sql).toContain('c.closed = 0');
    expect(sql).toContain('cu.utility_id = Utility.id');
  });

  it('Controparte: niente fornitura con flag, contratto immobiliare con flag in entrambe le direzioni', () => {
    const sql = maintenanceStatusSql(MaintenanceStatus.COUNTERPARTY);
    expect(sql).toContain(`NOT EXISTS (`);
    expect(sql).toContain(grantFlag);
    expect(sql).toContain("g.status = 'ACTIVE'");
    expect(sql).not.toContain('g.direction');
    expect(sql).toContain('tp.deleted = 0');
    expect(sql).toContain('sa.deleted = 0');
  });

  it('Comune: nessuna delle due', () => {
    const sql = maintenanceStatusSql(MaintenanceStatus.COMUNE);
    expect(sql.match(/NOT EXISTS \(/g)).toHaveLength(2);
  });

  it('alias personalizzato', () => {
    expect(maintenanceStatusSql(MaintenanceStatus.SUPPLIER, 'u')).toContain('cu.utility_id = u.id');
  });
});
```

- [ ] **Step 2: Eseguire il test**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/utility/maintenance-status.spec.ts --maxWorkers=2`
Expected: FAIL, "Cannot find module './maintenance-status'".

- [ ] **Step 3: Implementare**

```ts
import { ContractStatus } from '@apis/utilizer-grant/enum/real-estate-contract.enum';
import { PartyFields, partyName } from '@apis/third-parties/third-party.name';

// "Manutenzione a carico di" calcolata (roadmap voce 18). In ordine:
// - contratto di fornitura aperto con "Manutenzione inclusa" → SUPPLIER
// - contratto immobiliare attivo (qualsiasi direzione) con "Manutenzione a
//   carico della controparte" su un immobile dell'utenza → COUNTERPARTY
// - altrimenti → COMUNE
// maintenanceStatusSql è la stessa regola in SQL: tenerle allineate.
export enum MaintenanceStatus {
  COMUNE = 'COMUNE',
  SUPPLIER = 'SUPPLIER',
  COUNTERPARTY = 'COUNTERPARTY',
}

export interface MaintenanceInfo {
  status: MaintenanceStatus;
  // Contratti di fornitura con manutenzione inclusa (nome = fornitore).
  contracts: { id: number; name: string }[];
  // Parti dei contratti immobiliari con manutenzione a carico della controparte.
  parties: { grant_id: number; third_party_id: number; name: string }[];
}

interface PartyLike extends PartyFields {
  id: number;
  deleted?: boolean | number | null;
}

// MySQL tinyint: flag, closed e deleted possono arrivare come 1/0.
interface SupplyContractLike {
  id: number;
  deleted?: boolean | number | null;
  closed?: boolean | number | null;
  maintenance_included?: boolean | number | null;
  supplier?: PartyLike | null;
}

interface GrantLike {
  id: number;
  deleted?: boolean | number | null;
  status?: ContractStatus | null;
  maintenance_by_counterparty?: boolean | number | null;
  parties?: PartyLike[] | null;
}

export interface MaintenanceInput {
  contratti?: SupplyContractLike[] | null;
  assets?: { utilizerGrants?: GrantLike[] | null }[] | null;
}

export function maintenanceInfo(utility: MaintenanceInput): MaintenanceInfo {
  const contracts = (utility.contratti ?? [])
    .filter((c) => !c.deleted && !c.closed && !!c.maintenance_included)
    .map((c) => ({ id: c.id, name: c.supplier ? partyName(c.supplier) : '' }));
  if (contracts.length) return { status: MaintenanceStatus.SUPPLIER, contracts, parties: [] };

  const parties: MaintenanceInfo['parties'] = [];
  const seen = new Set<string>();
  for (const grant of (utility.assets ?? []).flatMap((a) => a?.utilizerGrants ?? [])) {
    if (grant.deleted || grant.status !== ContractStatus.ACTIVE) continue;
    if (!grant.maintenance_by_counterparty) continue;
    for (const p of grant.parties ?? []) {
      const key = `${grant.id}:${p.id}`;
      if (p.deleted || seen.has(key)) continue;
      seen.add(key);
      parties.push({ grant_id: grant.id, third_party_id: p.id, name: partyName(p) });
    }
  }
  return {
    status: parties.length ? MaintenanceStatus.COUNTERPARTY : MaintenanceStatus.COMUNE,
    contracts: [],
    parties,
  };
}

const supplierSql = (alias: string) =>
  `SELECT 1 FROM contract_utilities cu
     JOIN contracts c ON c.id = cu.contract_id
       AND c.deleted = 0 AND c.closed = 0 AND c.maintenance_included = 1
   WHERE cu.utility_id = ${alias}.id`;

// Contratti immobiliari attivi, in entrambe le direzioni, su immobili non
// cancellati dell'utenza, con parti non cancellate.
const counterpartySql = (alias: string) =>
  `SELECT 1 FROM utility_assets ua
     JOIN assets sa ON sa.id = ua.asset_id AND sa.deleted = 0
     JOIN utilizer_grant_assets uga ON uga.asset_id = ua.asset_id
     JOIN utilizer_grant g ON g.id = uga.utilizer_grant_id
       AND g.deleted = 0 AND g.status = 'ACTIVE' AND g.maintenance_by_counterparty = 1
     JOIN utilizer_grant_parties gp ON gp.utilizer_grant_id = g.id
     JOIN third_parties tp ON tp.id = gp.third_party_id AND tp.deleted = 0
   WHERE ua.utility_id = ${alias}.id`;

export function maintenanceStatusSql(status: MaintenanceStatus, alias = 'Utility'): string {
  const supplier = supplierSql(alias);
  const counterparty = counterpartySql(alias);
  switch (status) {
    case MaintenanceStatus.SUPPLIER:
      return `(EXISTS (${supplier}))`;
    case MaintenanceStatus.COUNTERPARTY:
      return `(NOT EXISTS (${supplier}) AND EXISTS (${counterparty}))`;
    case MaintenanceStatus.COMUNE:
      return `(NOT EXISTS (${supplier}) AND NOT EXISTS (${counterparty}))`;
  }
}
```

- [ ] **Step 4: Eseguire il test**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/utility/maintenance-status.spec.ts --maxWorkers=2`
Expected: PASS (tutti).

- [ ] **Step 5: Commit**

```bash
git add backend/src/apis/utility/maintenance-status.ts backend/src/apis/utility/maintenance-status.spec.ts
git commit -m "feat: manutenzione a carico di calcolata (regola e gemella SQL)"
```

---

### Task 3: Flag sui contratti, `maintenance_info` sulle utenze, via i gestori manutenzione

**Files:**
- Modify: `backend/src/apis/contracts/entity/contract.entity.ts` (dopo `cig_exempt`), `backend/src/apis/contracts/dto/create-contract.dto.ts`, `backend/src/apis/contracts/dto/update-contract.dto.ts`
- Modify: `backend/src/apis/utilizer-grant/entity/utilizer-grant.entity.ts` (dopo `utilities_to_be_taken_over`), `backend/src/apis/utilizer-grant/dto/create-utilizer-grant.dto.ts`, `backend/src/apis/utilizer-grant/dto/update-utilizer-grant.dto.ts`
- Modify: `backend/src/apis/utility/entity/utility.entity.ts`, `backend/src/apis/utility/dto/create-utility.dto.ts`, `update-utility.dto.ts`, `search-utility.dto.ts`, `backend/src/apis/utility/utility.service.ts`, `backend/src/apis/utility/utility.service.spec.ts`, `backend/src/apis/utility/dto/search-utility.dto.spec.ts`
- Modify: `backend/src/app.module.ts`
- Delete: `backend/src/apis/maintenance-managers/` (cartella), `backend/src/apis/shared/entities/maintenanceManagers.entity.ts`
- Create: `backend/src/database/migrations/1792300000000-AddMaintenanceFlags.ts`, `backend/src/database/migrations/1792400000000-DropMaintenanceManagers.ts`

**Interfaces:**
- Consumes: `maintenanceInfo`, `maintenanceStatusSql`, `MaintenanceStatus` (Task 2).
- Produces: campi API `contracts.maintenance_included: boolean`, `utilizer_grant.maintenance_by_counterparty: boolean`, `utility.maintenance_info: MaintenanceInfo`; filtro `GET /utilities?maintenance_status=COMUNE|SUPPLIER|COUNTERPARTY`. Spariscono `maintenance_management_id_fk` e `maintenanceManager`.

- [ ] **Step 1: Test del filtro e del DTO (falliscono)**

In `search-utility.dto.spec.ts`, accanto ai test di `cost_status`:

```ts
it('maintenance_status: accetta i tre stati, rifiuta altro', async () => {
  const ok = plainToInstance(SearchUtilityDto, { maintenance_status: 'SUPPLIER' });
  expect(await validate(ok)).toHaveLength(0);
  const ko = plainToInstance(SearchUtilityDto, { maintenance_status: 'ALTRO' });
  expect(await validate(ko)).not.toHaveLength(0);
});
```

In `utility.service.spec.ts`, accanto al test che verifica `costStatusSql` nel `findAll` (copiarne la struttura del querybuilder mockato):

```ts
it('filtro maintenance_status: aggiunge la condizione SQL dello stato', async () => {
  await service.findAll({ maintenance_status: MaintenanceStatus.SUPPLIER } as never);
  expect(qb.andWhere).toHaveBeenCalledWith(maintenanceStatusSql(MaintenanceStatus.SUPPLIER));
});

it('maintenance_info su ogni utenza restituita', async () => {
  // riga con contratto di fornitura aperto con flag, come i dati caricati da findAll
  // (stesso setup del test "cost_info su ogni utenza")
  const [u] = (await service.findAll({} as never)).data ?? (await service.findAll({} as never));
  expect(u.maintenance_info.status).toBeDefined();
});
```

Adattare il secondo test alla forma reale del risultato di `findAll` usata dal test `cost_info` esistente (stesso file): stessa riga mockata con `contratti: [{ id: 1, deleted: false, closed: false, maintenance_included: true, supplier: { id: 9, type: 'LEGAL', company_name: 'Luce Spa' } }]` e attesa `expect(u.maintenance_info).toEqual({ status: 'SUPPLIER', contracts: [{ id: 1, name: 'Luce Spa' }], parties: [] })`.

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/utility --maxWorkers=2`
Expected: FAIL sui nuovi test (`maintenance_status` sconosciuto per `forbidNonWhitelisted`/`IsEnum` assente, `maintenance_info` undefined).

- [ ] **Step 2: Entity e DTO dei contratti**

`contract.entity.ts`, dopo `cig_exempt`:

```ts
  // Manutenzione compresa nel contratto di fornitura (es. convenzione Consip
  // Luce): le utenze collegate risultano "Manutenzione: Fornitore".
  @Column({ type: 'boolean', default: false })
  maintenance_included: boolean;
```

`create-contract.dto.ts` e `update-contract.dto.ts`, dopo `cig_exempt`:

```ts
  @IsOptional()
  @IsBoolean()
  maintenance_included?: boolean;
```

`utilizer-grant.entity.ts`, dopo `utilities_to_be_taken_over`:

```ts
  // Manutenzione a carico dell'altra parte: conduttore/concessionario nei
  // contratti attivi, locatore nei passivi.
  @Column({ type: 'boolean', default: false })
  maintenance_by_counterparty: boolean;
```

`create-utilizer-grant.dto.ts` e `update-utilizer-grant.dto.ts`, dopo `utilities_to_be_taken_over`:

```ts
  @IsOptional()
  @IsBoolean()
  maintenance_by_counterparty?: boolean;
```

- [ ] **Step 3: Utenza**

- `utility.entity.ts`: togliere colonna `maintenance_management_id_fk`, relazione `maintenanceManager` e import di `MaintenanceManager`.
- `create-utility.dto.ts`, `update-utility.dto.ts`, `search-utility.dto.ts`: togliere `maintenance_management_id_fk`.
- `search-utility.dto.ts`, accanto a `cost_status`:

```ts
  @IsOptional()
  @IsEnum(MaintenanceStatus)
  maintenance_status?: MaintenanceStatus;
```

(import `MaintenanceStatus` da `'../maintenance-status'`).
- `utility.service.ts`:
  - togliere i tre `leftJoinAndSelect('Utility.maintenanceManager', ...)` (righe ~223, ~498, ~527) e ogni altro riferimento a `maintenance_management_id_fk` (`grep -n maintenance` deve restare solo sul nuovo codice);
  - in `withCurrentContractFields` accanto a `cost_info: costInfo(utility)`: `maintenance_info: maintenanceInfo(utility),` (i tre metodi caricano già `contratti` e `contratti.supplier`, e `assets.utilizerGrants.parties`);
  - accanto al filtro `cost_status`:

```ts
    if (filters?.maintenance_status) {
      qb.andWhere(maintenanceStatusSql(filters.maintenance_status));
    }
```

  - aggiungere `'maintenance_status'` all'elenco dei filtri esclusi dalla where generica, accanto a `'cost_status'` (riga ~426).
- `app.module.ts`: togliere `MaintenanceManagersModule` (import e registrazione). Cancellare `backend/src/apis/maintenance-managers/` e `shared/entities/maintenanceManagers.entity.ts`.
- `grep -rn "MaintenanceManager\|maintenance_management\|maintenanceManager" backend/src --include=*.ts | grep -v migrations` → nessun risultato.

- [ ] **Step 4: Migration (bozze in `backend/.scratch/`, poi in `migrations/`)**

`1792300000000-AddMaintenanceFlags.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

// "Manutenzione a carico di" (roadmap voce 18): spunte sui due tipi di contratto.
export class AddMaintenanceFlags1792300000000 implements MigrationInterface {
  name = 'AddMaintenanceFlags1792300000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `contracts` ADD `maintenance_included` tinyint NOT NULL DEFAULT 0');
    await q.query(
      'ALTER TABLE `utilizer_grant` ADD `maintenance_by_counterparty` tinyint NOT NULL DEFAULT 0',
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `utilizer_grant` DROP COLUMN `maintenance_by_counterparty`');
    await q.query('ALTER TABLE `contracts` DROP COLUMN `maintenance_included`');
  }
}
```

`1792400000000-DropMaintenanceManagers.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

// Gestori manutenzione eliminati (roadmap voce 18): sostituiti dalla
// "Manutenzione a carico di" calcolata dai contratti. Solo schema.
export class DropMaintenanceManagers1792400000000 implements MigrationInterface {
  name = 'DropMaintenanceManagers1792400000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `utilities` DROP FOREIGN KEY `FK_42f396edfa8f09d9dc694e4ddc9`');
    await q.query('ALTER TABLE `utilities` DROP COLUMN `maintenance_management_id_fk`');
    await q.query('DROP TABLE `maintenance_managers`');
  }

  // Ricrea la struttura vuota: i valori non si ricostruiscono.
  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      'CREATE TABLE `maintenance_managers` (`id` int NOT NULL AUTO_INCREMENT, `code` varchar(100) NOT NULL, `description` text NULL, `create_date` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `update_date` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), `created_by_user_id` int NULL, `updated_by_user_id` int NULL, `deleted` tinyint NOT NULL DEFAULT 0, UNIQUE INDEX `IDX_896871741dba2db44c2d08ae8a` (`code`), INDEX `IDX_91641df4170a721a4f9e696071` (`created_by_user_id`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await q.query(
      'ALTER TABLE `maintenance_managers` ADD CONSTRAINT `FK_91641df4170a721a4f9e696071d` FOREIGN KEY (`created_by_user_id`) REFERENCES `system_users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await q.query(
      'ALTER TABLE `maintenance_managers` ADD CONSTRAINT `FK_f19fa975d5bb5c3a90a03289401` FOREIGN KEY (`updated_by_user_id`) REFERENCES `system_users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await q.query('ALTER TABLE `utilities` ADD `maintenance_management_id_fk` int NULL');
    await q.query(
      'ALTER TABLE `utilities` ADD CONSTRAINT `FK_42f396edfa8f09d9dc694e4ddc9` FOREIGN KEY (`maintenance_management_id_fk`) REFERENCES `maintenance_managers`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
  }
}
```

Prima di spostare `DropMaintenanceManagers` nella cartella definitiva: verificare che le note "Ex gestore manutenzione Access" siano presenti (`SELECT COUNT(*) FROM utilities WHERE notes LIKE '%Ex gestore manutenzione Access:%'` → 229).

- [ ] **Step 5: Dato one-shot sul DB locale (scratchpad, non nel repo)**

Dopo che `AddMaintenanceFlags` è girata: `UPDATE contracts SET maintenance_included = 1, update_date = update_date WHERE id = 10;` e verificare che il contratto 10 sia quello Engie della convenzione Luce 3 (`SELECT c.id, ca.name FROM contracts c LEFT JOIN consip_agreement ca ON ca.id = c.consip_agreement_id WHERE c.id = 10`).

- [ ] **Step 6: Test**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/utility src/apis/contracts src/apis/utilizer-grant --maxWorkers=2`
Expected: PASS. Poi `docker exec utenzepa-api-1 pnpm run type-check` → nessun errore.

- [ ] **Step 7: Verifica API**

Con login via API (vedi CLAUDE.md, `dangerouslyDisableSandbox` per curl): `GET /api/v1/utilities?maintenance_status=SUPPLIER` → 125 risultati circa (utenze del contratto 10), ognuna con `maintenance_info.status = 'SUPPLIER'` e `contracts[0].name` = fornitore.

- [ ] **Step 8: Commit**

```bash
git add <file elencati in Files, inclusi i cancellati>
git commit -m "feat: manutenzione a carico di sulle utenze, gestori manutenzione eliminati"
```

---

### Task 4: Anomalia "Immobili senza natura o funzione"

**Files:**
- Modify: `backend/src/apis/anomalies/anomalies.service.ts`, `backend/src/apis/anomalies/anomalies.service.spec.ts`
- Modify: `frontend/src/app/pages/dashboard/anomalies-card.component.ts`

**Interfaces:**
- Produces: `Anomalies.assets_without_classification: AnomalyList<{ id: number; asset_name: string; missing: string }>` (`missing` = "natura", "funzione" o "natura e funzione").

- [ ] **Step 1: Test (fallisce)**

In `anomalies.service.spec.ts`:

```ts
it('immobili senza natura o funzione, esclusi i cancellati', async () => {
  query.mockImplementation(async (sql: string) =>
    sql.includes('FROM assets a')
      ? [{ id: '5', asset_name: 'Immobile prova', missing: 'natura e funzione' }]
      : [],
  );
  const result = await service.getAnomalies();
  expect(result.assets_without_classification).toEqual({
    count: 1,
    items: [{ id: 5, asset_name: 'Immobile prova', missing: 'natura e funzione' }],
  });
  const sql = query.mock.calls.map(([s]) => s).find((s) => s.includes('FROM assets a'));
  expect(sql).toContain('a.deleted = 0');
  expect(sql).toContain('a.nature_id IS NULL OR a.function_id IS NULL');
});
```

Aggiornare nel primo test `expect(query).toHaveBeenCalledTimes(14)` → `15`.

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/anomalies --maxWorkers=2`
Expected: FAIL (`assets_without_classification` undefined, 14 chiamate).

- [ ] **Step 2: Implementare** (in coda alle altre query, prima del `return`)

```ts
    // Natura e funzione sono l'unica classificazione dell'immobile.
    const assetsWithoutClassification: { id: unknown; asset_name: string; missing: string }[] =
      await this.dataSource.query(
        `SELECT a.id, a.asset_name,
                CASE WHEN a.nature_id IS NULL AND a.function_id IS NULL THEN 'natura e funzione'
                     WHEN a.nature_id IS NULL THEN 'natura' ELSE 'funzione' END AS missing
           FROM assets a
          WHERE a.deleted = 0 AND (a.nature_id IS NULL OR a.function_id IS NULL)
          ORDER BY a.asset_name`,
      );
```

Nell'interfaccia `Anomalies`: `assets_without_classification: AnomalyList<{ id: number; asset_name: string; missing: string }>;` e nel `return`:

```ts
      assets_without_classification: list(
        assetsWithoutClassification.map((a) => ({
          id: Number(a.id),
          asset_name: a.asset_name,
          missing: a.missing,
        })),
      ),
```

- [ ] **Step 3: Test**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/anomalies --maxWorkers=2`
Expected: PASS.

- [ ] **Step 4: Frontend**

`anomalies-card.component.ts`: nell'interfaccia `Anomalies` aggiungere `assets_without_classification: AnomalyList<{id: number; asset_name: string; missing: string}>;`; nel template, dopo il pannello "Ascensori, antincendio e termici senza immobile":

```html
            <mat-expansion-panel [disabled]="data.assets_without_classification.count === 0">
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count" [class.zero]="data.assets_without_classification.count === 0">{{ data.assets_without_classification.count }}</span>
                  Immobili senza natura o funzione
                </mat-panel-title>
              </mat-expansion-panel-header>
              <ul class="anomaly-list">
                @for (a of data.assets_without_classification.items; track a.id) {
                  <li (click)="openAsset(a.id)">{{ a.asset_name }} · manca {{ a.missing }}</li>
                }
              </ul>
            </mat-expansion-panel>
```

e il metodo (accanto a `openPlant`), con lo stesso schema di `openUtility`:

```ts
  openAsset(id: number): void {
    this.navigator.openAsset(id).subscribe(saved => {
      if (saved) this.reload();
    });
  }
```

(se `openUtility` usa un nome diverso da `reload()` per ricaricare, usare quello).

Run: `docker logs --since 60s utenzepa-frontend-1 2>&1 | grep -E "✘|generation"`
Expected: "generation complete", nessun `✘`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/apis/anomalies/anomalies.service.ts backend/src/apis/anomalies/anomalies.service.spec.ts frontend/src/app/pages/dashboard/anomalies-card.component.ts
git commit -m "feat: anomalia immobili senza natura o funzione"
```

---

### Task 5: Aggregati immobili eliminati (backend)

**Files:**
- Modify: `backend/src/apis/asset/entity/asset.entity.ts`, `backend/src/apis/asset/dto/search-asset.dto.ts`, `backend/src/apis/asset/assets.service.ts`, `backend/src/apis/asset/assets.service.spec.ts`, `backend/src/apis/asset/assets.module.ts`
- Modify: `backend/src/apis/map/map.service.ts`, `backend/src/apis/map/dto/map-query.dto.ts`, `backend/src/apis/map/map.service.spec.ts`
- Modify: `backend/src/apis/asset-functions/entity/asset-function.entity.ts` (solo commenti), `backend/src/apis/shared/base.service.ts` e `backend/src/core/database/mysql/mysql.module.ts` (solo commenti che citano `AssetAggregator`), `backend/src/apis/audit-log/audit-log.service.spec.ts` (se usa `asset_type_id`/`AssetAggregator` come esempio, sostituire con `function_id`/`AssetFunction`)
- Modify: `backend/src/app.module.ts`
- Delete: `backend/src/apis/asset-aggregators/`
- Create: `backend/src/database/migrations/1792500000000-DropAssetAggregators.ts`

**Interfaces:**
- Produces: `Asset` senza `asset_type_id`/`assetAggregator`; `MapQueryDto` senza `assetAggregatorIds` (resta `functionIds`); punto mappa immobile con `icon = assetFunction?.icon ?? null`.

- [ ] **Step 1: Test mappa (fallisce)**

In `map.service.spec.ts`: cancellare i test "un asset con aggregato che ha un'icona custom…" e "assetAggregatorIds filtra anche le utility…"; sostituire "icona immobile: funzione se presente, altrimenti vecchio aggregato" con:

```ts
it('icona immobile: solo dalla funzione', async () => {
  assetRepo.find.mockResolvedValue([
    { id: 5, asset_name: 'A', address: 'x', latitude: '42.5', longitude: '14.1', assetFunction: { icon: 'sports_soccer' } },
    { id: 6, asset_name: 'B', address: 'x', latitude: '42.6', longitude: '14.2', assetFunction: null },
  ]);
  const { points } = await service.getPoints({ showUtilities: false } as never);
  expect(points.map((p) => p.icon)).toEqual(['sports_soccer', null]);
  expect(assetRepo.find).toHaveBeenCalledWith(
    expect.objectContaining({ relations: { assetFunction: true } }),
  );
});
```

(adattare nomi di mock/risultato a quelli usati dal test sostituito nello stesso file).

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/map --maxWorkers=2`
Expected: FAIL (relations contiene ancora `assetAggregator`).

- [ ] **Step 2: Rimuovere gli aggregati**

- `map.service.ts`: togliere la riga `assetAggregatorIds` da `assetClassWhere`, `relations: { assetFunction: true }`, `icon: asset.assetFunction?.icon ?? null`, aggiornare il commento del campo `icon` ("ligature Material Icons della funzione dell'immobile, null se assente") e il commento sul "filtro aggregato".
- `map-query.dto.ts`: togliere `assetAggregatorIds` e aggiornare l'esempio nel commento (`?functionIds=1,2`).
- `asset.entity.ts`: togliere colonna `asset_type_id`, relazione `assetAggregator`, import.
- `search-asset.dto.ts`, `assets.service.ts`, `assets.service.spec.ts`, `assets.module.ts`: togliere ogni riferimento ad `asset_type_id`/`AssetAggregator` (filtro, join, `TypeOrmModule.forFeature`).
- `app.module.ts`: togliere `AssetAggregatorsModule`. Cancellare `backend/src/apis/asset-aggregators/`.
- Commenti in `asset-function.entity.ts`, `base.service.ts`, `mysql.module.ts`: riscriverli senza citare `AssetAggregator` (il contenuto della nota resta se ancora vero).
- `grep -rn "asset_type_id\|AssetAggregator\|assetAggregator\|asset-aggregator" backend/src --include=*.ts | grep -v migrations` → nessun risultato.

- [ ] **Step 3: Migration `1792500000000-DropAssetAggregators.ts` (bozza in `.scratch/`)**

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

// Aggregati immobili eliminati (roadmap voce 18): duplicavano la funzione
// dell'immobile, che ha già le icone. Solo schema.
export class DropAssetAggregators1792500000000 implements MigrationInterface {
  name = 'DropAssetAggregators1792500000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `assets` DROP FOREIGN KEY `FK_d43ed9e838f74bcc07b1266a8d6`');
    await q.query('ALTER TABLE `assets` DROP COLUMN `asset_type_id`');
    await q.query('DROP TABLE `asset_aggregators`');
  }

  // Ricrea la struttura vuota: i valori non si ricostruiscono.
  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      'CREATE TABLE `asset_aggregators` (`id` int NOT NULL AUTO_INCREMENT, `code` varchar(255) NOT NULL, `description` varchar(255) NULL, `create_date` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `update_date` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), `created_by_user_id` int NOT NULL, `updated_by_user_id` int NOT NULL, `deleted` tinyint NOT NULL DEFAULT 0, `icon` varchar(50) NULL, UNIQUE INDEX `IDX_1dd8ee2f6760bd4c6cb5bf958b` (`code`), INDEX `IDX_d727f360f8244e6d2fff287536` (`created_by_user_id`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await q.query(
      'ALTER TABLE `asset_aggregators` ADD CONSTRAINT `FK_d727f360f8244e6d2fff287536b` FOREIGN KEY (`created_by_user_id`) REFERENCES `system_users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await q.query(
      'ALTER TABLE `asset_aggregators` ADD CONSTRAINT `FK_b35a2cc9fb0a9df4af08e5173a5` FOREIGN KEY (`updated_by_user_id`) REFERENCES `system_users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await q.query('ALTER TABLE `assets` ADD `asset_type_id` int NULL');
    await q.query(
      'ALTER TABLE `assets` ADD CONSTRAINT `FK_d43ed9e838f74bcc07b1266a8d6` FOREIGN KEY (`asset_type_id`) REFERENCES `asset_aggregators`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
  }
}
```

Prima di spostarla: backup delle tabelle che spariscono nello scratchpad (`mysqldump ... asset_aggregators maintenance_managers aca_keys > pre-v190.sql`, `--default-character-set=utf8mb4`), solo se non già fatto nel Task 3.

- [ ] **Step 4: Test**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/map src/apis/asset src/apis/audit-log --maxWorkers=2` poi `pnpm run type-check`
Expected: PASS, nessun errore di tipo.

- [ ] **Step 5: Commit**

```bash
git add <file elencati in Files, inclusi i cancellati>
git commit -m "feat: aggregati immobili eliminati, mappa solo per funzione"
```

---

### Task 6: Aggregati immobili eliminati (frontend)

**Files:**
- Create: `frontend/src/app/core/helpers/material-icons.ts` (da `pages/asset-aggregator/enum/asset-aggregator-icon.enum.ts`)
- Create: `frontend/src/app/core/components/icon-picker-dialog.component.ts` e `.html` (da `pages/asset-aggregator/icon-picker-dialog.component.*`)
- Create: `frontend/src/app/core/components/quick-search.component.html` (da `pages/asset-aggregator/search-asset-aggregator.component.html`)
- Modify: `pages/asset-function/asset-function-edit-dialog.component.ts`, `data-table-asset-function.component.ts`, `search-asset-function.component.ts`; `pages/asset-nature/asset-nature-edit-dialog.component.ts`, `data-table-asset-nature.component.ts`, `search-asset-nature.component.ts`
- Modify: `pages/map/map.component.ts`, `map.component.html`, `map.service.ts`
- Modify: `pages/assets/asset-edit-dialog.component.ts`, `asset-filter-dialog.component.ts`/`.html`, `data-table-assets.component.ts`/`.html`, `search-assets.component.ts`, `entity/asset.entity.ts`, `entity/asset.interface.ts`
- Modify: `core/components/multi-select.component.ts` (commento), `core/helpers/entity-status.ts` (`legacyTypeStatus`), `comp/sidebar/sidebar.component.ts`, `app.routes.ts`
- Delete: `frontend/src/app/pages/asset-aggregator/`

**Interfaces:**
- Consumes: API senza `asset_type_id`/`assetAggregator`/`assetAggregatorIds` (Task 5).
- Produces: `ICON_OPTIONS: {value: string; label: string}[]`, `ICON_FALLBACK = 'apartment'` in `core/helpers/material-icons.ts`; `IconPickerDialogComponent` in `core/components/`.

- [ ] **Step 1: Spostare i file condivisi**

`git mv pages/asset-aggregator/enum/asset-aggregator-icon.enum.ts core/helpers/material-icons.ts`, rinominando `ASSET_AGGREGATOR_ICON_FALLBACK` → `ICON_FALLBACK` e `AssetAggregatorIconOptions` → `ICON_OPTIONS`. `git mv` dei due file del picker in `core/components/` e del template di ricerca in `core/components/quick-search.component.html`. Aggiornare gli import relativi nei file spostati.

- [ ] **Step 2: Aggiornare i consumatori**

`grep -rln "asset-aggregator\|ASSET_AGGREGATOR_ICON_FALLBACK\|AssetAggregatorIconOptions" frontend/src/app` e per ciascun file: import da `core/helpers/material-icons` / `core/components/icon-picker-dialog.component`, nomi nuovi; `templateUrl` di `search-asset-function`/`search-asset-nature` → `'../../core/components/quick-search.component.html'`.

- [ ] **Step 3: Mappa**

`map.component.ts`/`.html`/`map.service.ts`: togliere `AssetAggregatorsService`, `assetAggregators`, `assetAggregatorIds`, `assetAggregatorOptions`, `rebuildAssetAggregatorOptions` e la sua chiamata, il `<app-multi-select>` degli aggregati e il parametro `assetAggregatorIds` della chiamata API; fallback icone con `ICON_FALLBACK`; commenti aggiornati (icona = funzione).

- [ ] **Step 4: Immobili**

- `asset.entity.ts`/`asset.interface.ts`: togliere `asset_type_id`, `assetAggregator`, import.
- `data-table-assets.component.ts`/`.html`: togliere la colonna `assetAggregator.code` ("Tipo precedente") dalla definizione, dall'elenco colonne e dal `switch` dell'export.
- `asset-filter-dialog.component.ts`/`.html`, `search-assets.component.ts`: togliere filtro e controllo `asset_type_id`.
- `asset-edit-dialog.component.ts`:
  - `currentAssetIcon()`: `return fn?.icon || ICON_FALLBACK;`
  - togliere `legacyTypeLabel()`, il badge che usa `legacyTypeStatus(...)` (metodo a riga ~283 e il suo uso nel template) e `legacyTypeStatus` da `core/helpers/entity-status.ts` se non ha altri usi;
  - regola di obbligatorietà (Review Focus 3): obbligatorie per i nuovi e per chi è già classificato, un immobile ancora incompleto si salva lo stesso:

```ts
  // Obbligatori per immobili nuovi e per quelli già classificati (non devono
  // poter tornare vuoti); un immobile ancora incompleto si salva lo stesso
  // (resta nell'anomalia "Immobili senza natura o funzione").
  mustClassify = this.isNew || (this.data.item.nature_id != null && this.data.item.function_id != null);
```

- `multi-select.component.ts`: commento con esempio `AssetFunction.icon`.
- `sidebar.component.ts`: togliere la voce "Aggregati Immobili (vecchio)"; `app.routes.ts`: togliere import e route `asset-aggregator`.
- Cancellare `pages/asset-aggregator/` (resta vuota dopo i `git mv`). `grep -rn -i "aggregat\|asset_type_id" frontend/src/app --include=*.ts --include=*.html` → solo eventuali testi non legati agli immobili (nessun riferimento a `asset-aggregator`).

- [ ] **Step 5: Compilazione**

Run: `docker logs --since 60s utenzepa-frontend-1 2>&1 | grep -E "✘|generation"`
Expected: "generation complete", nessun `✘`.

- [ ] **Step 6: Commit**

```bash
git add <file elencati in Files, inclusi spostati e cancellati>
git commit -m "feat: aggregati immobili eliminati dal frontend, icone condivise in core"
```

---

### Task 7: Manutenzione nel frontend, gestori manutenzione eliminati

**Files:**
- Modify: `frontend/src/app/core/helpers/entity-status.ts`
- Modify: `pages/utilities/entity/utility.interface.ts`, `entity/utility.entity.ts`, `utility-edit-dialog.component.ts`/`.html`, `data-table-utilities.component.ts`/`.html`, `utility-filter-dialog.component.ts`/`.html`, `search-utilities.component.ts`
- Modify: `pages/contracts/contract-edit-dialog.component.ts`/`.html`, `pages/contracts/entity/contract.entity.ts`
- Modify: `pages/utilizer-grant/utilizer-grant-edit-dialog.component.ts`/`.html`, `entity/utilizer-grant.entity.ts`, `entity/utilizer-grant.interface.ts`
- Modify: `comp/sidebar/sidebar.component.ts`, `app.routes.ts`
- Delete: `frontend/src/app/pages/maintenance-managers/`

**Interfaces:**
- Consumes: `maintenance_info` (Task 3), filtro `maintenance_status`, campi `maintenance_included`/`maintenance_by_counterparty`.
- Produces: `maintenanceStatus(info: {status: string} | null | undefined): StatusInfo`; `MaintenanceInfo` frontend.

- [ ] **Step 1: Badge e tipi**

`entity-status.ts`, dopo `costStatus`:

```ts
// "Manutenzione a carico di" (stato calcolato dal backend, maintenance-status.ts).
export function maintenanceStatus(info: {status: string} | null | undefined): StatusInfo {
  switch (info?.status) {
    case 'SUPPLIER': return {tone: 'info', label: 'Fornitore', icon: 'local_shipping'};
    case 'COUNTERPARTY': return {tone: 'info', label: 'Controparte', icon: 'handshake'};
    default: return {tone: 'ok', label: 'Comune', icon: 'account_balance'};
  }
}
```

`utility.interface.ts`, dopo `CostInfo`:

```ts
// "Manutenzione a carico di" calcolata dal backend (apis/utility/maintenance-status.ts).
export interface MaintenanceInfo {
  status: 'COMUNE' | 'SUPPLIER' | 'COUNTERPARTY';
  contracts: {id: number; name: string}[];
  parties: {grant_id: number; third_party_id: number; name: string}[];
}
```

In `IUtility`: `maintenance_info?: MaintenanceInfo;`, togliere `maintenance_management_id_fk` e `maintenanceManager`. In `utility.entity.ts`: togliere `maintenance_management_id_fk`, `maintenanceManager` e import; aggiungere

```ts
  @Exclude({toPlainOnly: true})
  maintenance_info?: MaintenanceInfo;
```

- [ ] **Step 2: Scheda utenza**

`utility-edit-dialog.component.ts`: togliere `MaintenanceManagersService`, `maintenanceOptions`, il controllo `maintenance_management_id_fk` e la `search()` dei gestori; accanto a `costInfo`/`costStatusInfo`:

```ts
  // Manutenzione: calcolata dal backend sui contratti salvati (si aggiorna dopo il Salva).
  readonly maintenanceInfo = this.data.item.maintenance_info;
  readonly maintenanceStatusInfo = maintenanceStatus(this.data.item.maintenance_info);
```

(import `maintenanceStatus` da `entity-status`). `.html`: togliere il `mat-form-field` "Fornitore Manutenzione" nella sezione "Gestione"; dopo il blocco "A carico di", dentro lo stesso `@if (!isNew)`:

```html
          <div class="sheet-section-title"><mat-icon>build</mat-icon>Manutenzione</div>
          <div class="sheet-grid">
            <div class="span-all" style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
              <app-status-badge [info]="maintenanceStatusInfo"></app-status-badge>
              @for (c of maintenanceInfo?.contracts ?? []; track c.id) {
                <a href="javascript:void(0)" (click)="openContract(c.id)" matTooltip="Apri il contratto di fornitura">{{ c.name || ('Contratto #' + c.id) }}</a>
              }
              @for (p of maintenanceInfo?.parties ?? []; track p.grant_id + '-' + p.third_party_id) {
                <a href="javascript:void(0)" (click)="openGrant(p.grant_id)" matTooltip="Apri il contratto immobiliare">{{ p.name }}</a>
              }
            </div>
          </div>
```

Se la sezione "Gestione" resta con il solo campo "Concessione acqua", lasciarla così.

- [ ] **Step 3: Elenco e filtri utenze**

- `data-table-utilities.component.ts`: sostituire la colonna `{field: 'maintenanceManager.code', header: 'Gestione Manutenzione', ...}` con `{field: 'maintenance_info', header: 'Manutenzione', minWidth: '150px'}` (e nell'elenco colonne visibili/esportate, se presente); aggiungere `readonly maintenanceStatus = maintenanceStatus;` e

```ts
  // Manutenzione: stato calcolato + fornitore o parti.
  maintenanceName(utility: Utility): string {
    const info = utility.maintenance_info;
    return [...(info?.contracts ?? []).map(c => c.name), ...(info?.parties ?? []).map(p => p.name)]
      .filter(Boolean).join(', ');
  }

  maintenanceLabel(utility: Utility): string {
    return [maintenanceStatus(utility.maintenance_info).label, this.maintenanceName(utility)].filter(Boolean).join(' · ');
  }
```

  ordinamento (accanto al caso `cost_info`) su `maintenanceLabel`, export `case 'maintenance_info': return this.maintenanceLabel(utility);`.
- `data-table-utilities.component.html`: sostituire il `matColumnDef="maintenanceManager.code"` con

```html
  <ng-container matColumnDef="maintenance_info">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Manutenzione</th>
    <td mat-cell *matCellDef="let item">
      <app-status-badge size="sm" [info]="maintenanceStatus(item.maintenance_info)"></app-status-badge>
      {{ maintenanceName(item) }}
    </td>
  </ng-container>
```

- `utility-filter-dialog.component.ts`/`.html`, `search-utilities.component.ts`: sostituire `maintenance_management_id_fk` (campo, servizio, opzioni, select) con `maintenance_status: string | null` e una select "Manutenzione" con le opzioni, sul modello di `costStatusOptions`:

```ts
  readonly maintenanceStatusOptions: TOption[] = [
    {label: 'Comune', value: 'COMUNE'},
    {label: 'Fornitore', value: 'SUPPLIER'},
    {label: 'Controparte', value: 'COUNTERPARTY'},
  ];
```

- [ ] **Step 4: Spunte nelle schede contratto**

- `contract.entity.ts` (frontend): `maintenance_included?: boolean;`. `contract-edit-dialog.component.ts`: `maintenance_included: [this.data.item.maintenance_included ?? false],` accanto a `cig_exempt`. `.html`, dopo la checkbox "Escluso da CIG": `<mat-checkbox formControlName="maintenance_included" style="align-self: center;">Manutenzione inclusa</mat-checkbox>`.
- `utilizer-grant.entity.ts` e `.interface.ts`: `maintenance_by_counterparty?: boolean;` (e `maintenance_by_counterparty: false` nei default accanto a `utilities_to_be_taken_over: false`). `utilizer-grant-edit-dialog.component.ts`: `maintenance_by_counterparty: [this.item.maintenance_by_counterparty ?? false],`. `.html`, dopo "Utenze da volturare": `<mat-checkbox formControlName="maintenance_by_counterparty" style="align-self: center;">Manutenzione a carico della controparte</mat-checkbox>`.

- [ ] **Step 5: Rimozione pagina gestori**

`sidebar.component.ts`: togliere "Fornitori Manutenzione"; `app.routes.ts`: togliere import e route `maintenance-managers`; cancellare `pages/maintenance-managers/`. `grep -rn -i "maintenance_management\|maintenanceManager\|maintenance-managers" frontend/src/app --include=*.ts --include=*.html` → nessun risultato.

- [ ] **Step 6: Compilazione**

Run: `docker logs --since 60s utenzepa-frontend-1 2>&1 | grep -E "✘|generation"`
Expected: "generation complete", nessun `✘`.

- [ ] **Step 7: Commit**

```bash
git add <file elencati in Files, inclusi i cancellati>
git commit -m "feat: manutenzione nella scheda e nell'elenco utenze, spunte sui contratti"
```

---

### Task 8: Verifica finale, migration, E2E, documentazione, versione

**Files:**
- Modify: `CLAUDE.md`, `docs/roadmap-patrimonio.md`, `publiccode.yml`

- [ ] **Step 1: Ciclo migration reale**

Usare la CLI (dentro il container) per `migration:revert` cinque volte (DropAssetAggregators, DropMaintenanceManagers, AddMaintenanceFlags, InvoiceBudgetChapterFk, DropDeadTables), verificare che tabelle e colonne tornino (vuote), poi `migration:run` e verificare lo schema finale. Comando: `docker exec -u root utenzepa-api-1 node -r ts-node/register -r tsconfig-paths/register node_modules/typeorm/cli.js migration:revert -d src/database/data-source.ts`. Dopo il revert di `AddMaintenanceFlags` la spunta del contratto 10 si perde: rifare il Task 3 Step 5 dopo il `migration:run`.
Expected: up → down → up senza errori; `contracts.maintenance_included` del contratto 10 = 1 alla fine.

- [ ] **Step 2: Suite backend e build**

Run (uno alla volta): `docker exec utenzepa-api-1 pnpm exec jest src/apis/utility src/apis/anomalies src/apis/map src/apis/asset src/apis/contracts src/apis/utilizer-grant src/database --maxWorkers=2`, poi `docker exec utenzepa-api-1 pnpm run lint` (scartare i file `0 0`), poi `docker exec utenzepa-frontend-1 pnpm run build`.
Expected: tutto verde. La suite completa la verifica la CI.

- [ ] **Step 3: E2E Playwright** (utente temporaneo come da CLAUDE.md, cancellato alla fine)

1. `/utilities?selectedId=<id utenza del contratto 10>`: riquadro Manutenzione "Fornitore" con il nome del fornitore; il link apre il contratto, che mostra "Manutenzione inclusa" spuntata.
2. Su un contratto immobiliare attivo con immobile e utenza collegati: spuntare "Manutenzione a carico della controparte", Salva; riaprire l'utenza → "Controparte" con la parte. Togliere la spunta e salvare (ripristino).
3. Elenco utenze: filtro Manutenzione = Fornitore → solo utenze del contratto 10; colonna Manutenzione visibile.
4. Salva di un'utenza esistente senza modifiche → nessun 400 (`maintenance_info` non rimandato).
5. Mappa: filtro Funzione presente, nessun filtro aggregati, marker immobili con icona della funzione.
6. Immobile 2274 (senza natura né funzione): si apre e si salva; immobile già classificato: svuotare la funzione blocca il Salva.
7. Dashboard: pannello "Immobili senza natura o funzione" con 6 righe (2 senza natura né funzione, 4 senza funzione) — il numero esatto è quello della query dell'anomalia.
8. Sidebar senza "Aggregati Immobili (vecchio)" e "Fornitori Manutenzione".

- [ ] **Step 4: Documentazione**

- `CLAUDE.md`: togliere `asset-aggregators` e `maintenance-managers` dall'elenco moduli; sostituire la nota "`AssetAggregator`: `code` è la label breve…" con una nota sulla classificazione immobile (natura + funzione, icona dalla funzione, anomalia per gli incompleti); accanto alla nota "A carico di" aggiungere: "Manutenzione a carico di: calcolata in `apis/utility/maintenance-status.ts` (gemella SQL `maintenanceStatusSql`) da `contracts.maintenance_included` (contratto di fornitura aperto → Fornitore) e `utilizer_grant.maintenance_by_counterparty` (contratto immobiliare attivo, qualsiasi direzione → Controparte), altrimenti Comune. I contratti di manutenzione con ditte esterne sono la voce 7."
- Roadmap: riga 18 → "parte 1 fatta, v1.9.0 (…esito dati…)"; riga 7 → "da approfondire (ditte esterne sugli impianti; i gestori manutenzione sono stati sostituiti in v1.9.0)"; nella sezione 18 un paragrafo "Fatto in v1.9.0" con l'esito dati della spec e i minori differiti dalla revisione finale.
- `publiccode.yml`: `softwareVersion: "v1.9.0"`, `releaseDate: "2026-10-03"`.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/roadmap-patrimonio.md publiccode.yml
git commit -m "docs: CLAUDE.md, roadmap e versione v1.9.0"
```

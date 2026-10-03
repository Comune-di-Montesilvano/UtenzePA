# Tipologie ARERA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire le finalità d'uso (`purpose`) con la tipologia contrattuale ARERA per singola utenza e trasformare la disalimentabilità da testo libero a sì / no / non noto.

**Architecture:** Colonna enum `utilities.arera_category` (19 codici prefissati per tipo) e boolean nullable `utilities.disconnectable`; la regola codice ↔ tipo utenza vive in un unico modulo backend (`arera-category.ts`) e nel suo gemello frontend. Una migration converte la disalimentabilità ed elimina `purpose`/`utility_type_purpose`; il modulo backend `purpose` e la pagina frontend spariscono.

**Tech Stack:** NestJS 11 + TypeORM (MySQL 8), jest/ts-jest; Angular 22 + Angular Material 22.

**Spec:** `docs/superpowers/specs/2026-10-02-tipologie-arera-design.md`

## Global Constraints

- Errori di validazione: sempre HTTP 400 con messaggio leggibile, mai 409 (il proxy di produzione blocca i 409). Messaggio fisso: `Tipologia ARERA non valida per il tipo di utenza.`
- Codici ARERA esattamente: `EL_BT_DOMESTIC`, `EL_BT_PUBLIC_LIGHTING`, `EL_BT_OTHER`, `EL_BT_EV_CHARGING`, `EL_MT_PUBLIC_LIGHTING`, `EL_MT_OTHER`, `WATER_DOMESTIC_RESIDENT`, `WATER_DOMESTIC_NON_RESIDENT`, `WATER_DOMESTIC_CONDOMINIUM`, `WATER_INDUSTRIAL`, `WATER_COMMERCIAL`, `WATER_AGRICULTURAL`, `WATER_PUBLIC_NON_DISCONNECTABLE`, `WATER_PUBLIC_DISCONNECTABLE`, `WATER_OTHER`, `GAS_DOMESTIC`, `GAS_CONDOMINIUM_DOMESTIC`, `GAS_PUBLIC_SERVICE`, `GAS_OTHER`. Internet: nessun codice.
- Comandi Docker **uno alla volta**, mai in parallelo/background multipli (la macchina Windows è crashata in passato). Jest sempre con `--maxWorkers=2`, solo i file rilevanti (`docker exec utenzepa-api-1 pnpm exec jest <path> --maxWorkers=2`); la suite completa la fa la CI.
- Migration nuova: scriverla e rifinirla in uno scratch path fuori da `backend/src/database/migrations/` (il watcher `nest start --watch` + `migrationsRun: true` la eseguirebbe a metà); spostarla nel path definitivo solo a contenuto finale.
- Spec delle migration **fuori** da `src/database/migrations/` (il glob caricherebbe lo spec come migration): `backend/src/database/arera-categories.migration.spec.ts`.
- `git add` sempre con i file elencati esplicitamente: mai `git add .`/`-A` (`.playwright-mcp/`, `.serena/` e file di sessione non tracciati non vanno committati). Dopo un `pnpm run lint` nel container, scartare i file con diff `0 0` (`git diff --numstat`).
- Nessun dato personale reale (nominativi, CF) in codice, test, commit, documenti: usare id o nomi fittizi.
- Etichette in italiano; `mat-label` di campi non obbligatori senza `*`.
- Frontend: niente `ng test` (nessun browser nel container); verifica = compilazione (`docker logs --since 60s utenzepa-frontend-1 2>&1 | grep -E "✘|generation"`), `ng build` a fine lavoro, E2E Playwright dall'host.
- Ogni commit termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; Conventional Commits (commitlint).

## Review Focus

1. Utenza esistente con tipologia salvata a cui si cambia il **tipo** via API senza mandare `arera_category` → 400 (in UI il campo viene svuotato prima del salvataggio). Test nel Task 3.
2. Salvataggio dal dialog di un'utenza **Internet** (campo nascosto, valore `null`) e di un'utenza mai classificata → nessun errore, `arera_category` resta `null`. Test nel Task 3.
3. Valore di `disconnection_ability` non previsto nel DB di produzione al momento della migration → la migration si ferma con l'elenco **prima** di qualunque DDL, nessuna colonna toccata. Test nel Task 2.
4. Filtro "Non assegnata" (`NONE`) e filtro disalimentabilità "Non noto" (`unknown`) → `IS NULL`, non `= 'NONE'`/`= 'unknown'` né `LIKE`. Test nel Task 3.
5. La migration non deve spostare "Ultima modifica" delle utenze convertite (`update_date = update_date` nell'UPDATE). Test nel Task 2.

---

### Task 1: Modulo regole ARERA (backend)

**Files:**
- Create: `backend/src/apis/utility/arera-category.ts`
- Test: `backend/src/apis/utility/arera-category.spec.ts`

**Interfaces:**
- Consumes: `HardTypeEnum` da `@apis/utility-types/enum/hard-type.enum` (`WATER`, `LIGHT`, `GAS`, `INTERNET`).
- Produces: `enum AreraCategory` (19 valori, stringa = nome), `ARERA_CATEGORIES_BY_HARD_TYPE: Record<HardTypeEnum, AreraCategory[]>`, `isAreraCategoryAllowed(hardType: HardTypeEnum, category: AreraCategory): boolean`, `ARERA_NONE = 'NONE'` (valore del filtro "non assegnata").

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/apis/utility/arera-category.spec.ts
import { HardTypeEnum } from '@apis/utility-types/enum/hard-type.enum';
import {
  ARERA_CATEGORIES_BY_HARD_TYPE,
  AreraCategory,
  isAreraCategoryAllowed,
} from './arera-category';

describe('arera-category', () => {
  it('ogni codice appartiene a un solo tipo, coerente col prefisso', () => {
    const prefix: Record<HardTypeEnum, string> = {
      [HardTypeEnum.LIGHT]: 'EL_',
      [HardTypeEnum.WATER]: 'WATER_',
      [HardTypeEnum.GAS]: 'GAS_',
      [HardTypeEnum.INTERNET]: '-',
    };
    const all = Object.values(AreraCategory);
    for (const code of all) {
      const owners = Object.values(HardTypeEnum).filter((t) => isAreraCategoryAllowed(t, code));
      expect(owners).toHaveLength(1);
      expect(code.startsWith(prefix[owners[0]])).toBe(true);
    }
    const mapped = Object.values(ARERA_CATEGORIES_BY_HARD_TYPE).flat();
    expect(mapped.sort()).toEqual([...all].sort());
    expect(all).toHaveLength(19);
  });

  it('Internet non ha tipologie', () => {
    expect(ARERA_CATEGORIES_BY_HARD_TYPE[HardTypeEnum.INTERNET]).toEqual([]);
    expect(isAreraCategoryAllowed(HardTypeEnum.INTERNET, AreraCategory.EL_BT_OTHER)).toBe(false);
  });

  it('rifiuta un codice di un altro tipo', () => {
    expect(isAreraCategoryAllowed(HardTypeEnum.GAS, AreraCategory.WATER_OTHER)).toBe(false);
    expect(isAreraCategoryAllowed(HardTypeEnum.WATER, AreraCategory.WATER_OTHER)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/utility/arera-category.spec.ts --maxWorkers=2`
Expected: FAIL, "Cannot find module './arera-category'".

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/apis/utility/arera-category.ts
import { HardTypeEnum } from '@apis/utility-types/enum/hard-type.enum';

// Tipologie contrattuali ARERA per tipo di utenza: TIT (luce, art. 2.2 +
// BTVE), TICSI delibera 665/2017 (acqua), TIVG art. 2.3 (gas). Elenco
// fisso da normativa: nessuna anagrafica gestita dall'app.
export enum AreraCategory {
  EL_BT_DOMESTIC = 'EL_BT_DOMESTIC',
  EL_BT_PUBLIC_LIGHTING = 'EL_BT_PUBLIC_LIGHTING',
  EL_BT_OTHER = 'EL_BT_OTHER',
  EL_BT_EV_CHARGING = 'EL_BT_EV_CHARGING',
  EL_MT_PUBLIC_LIGHTING = 'EL_MT_PUBLIC_LIGHTING',
  EL_MT_OTHER = 'EL_MT_OTHER',
  WATER_DOMESTIC_RESIDENT = 'WATER_DOMESTIC_RESIDENT',
  WATER_DOMESTIC_NON_RESIDENT = 'WATER_DOMESTIC_NON_RESIDENT',
  WATER_DOMESTIC_CONDOMINIUM = 'WATER_DOMESTIC_CONDOMINIUM',
  WATER_INDUSTRIAL = 'WATER_INDUSTRIAL',
  WATER_COMMERCIAL = 'WATER_COMMERCIAL',
  WATER_AGRICULTURAL = 'WATER_AGRICULTURAL',
  WATER_PUBLIC_NON_DISCONNECTABLE = 'WATER_PUBLIC_NON_DISCONNECTABLE',
  WATER_PUBLIC_DISCONNECTABLE = 'WATER_PUBLIC_DISCONNECTABLE',
  WATER_OTHER = 'WATER_OTHER',
  GAS_DOMESTIC = 'GAS_DOMESTIC',
  GAS_CONDOMINIUM_DOMESTIC = 'GAS_CONDOMINIUM_DOMESTIC',
  GAS_PUBLIC_SERVICE = 'GAS_PUBLIC_SERVICE',
  GAS_OTHER = 'GAS_OTHER',
}

// Valore del filtro di ricerca "tipologia non assegnata".
export const ARERA_NONE = 'NONE';

const byPrefix = (prefix: string) =>
  Object.values(AreraCategory).filter((c) => c.startsWith(prefix));

export const ARERA_CATEGORIES_BY_HARD_TYPE: Record<HardTypeEnum, AreraCategory[]> = {
  [HardTypeEnum.LIGHT]: byPrefix('EL_'),
  [HardTypeEnum.WATER]: byPrefix('WATER_'),
  [HardTypeEnum.GAS]: byPrefix('GAS_'),
  [HardTypeEnum.INTERNET]: [],
};

export function isAreraCategoryAllowed(hardType: HardTypeEnum, category: AreraCategory): boolean {
  return ARERA_CATEGORIES_BY_HARD_TYPE[hardType]?.includes(category) ?? false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/utility/arera-category.spec.ts --maxWorkers=2`
Expected: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add backend/src/apis/utility/arera-category.ts backend/src/apis/utility/arera-category.spec.ts
git commit -m "feat(backend): tipologie contrattuali ARERA per tipo di utenza"
```

---

### Task 2: Migration, colonne dell'entity utenza e rimozione `purpose` dallo schema

**Files:**
- Create (scratch, poi spostato): `backend/src/database/migrations/1791600000000-AreraCategories.ts`
- Test: `backend/src/database/arera-categories.migration.spec.ts`
- Modify: `backend/src/apis/utility/entity/utility.entity.ts:117-118` (colonna `disconnection_ability`)

**Interfaces:**
- Consumes: niente dal codice applicativo (la migration ha l'elenco codici scritto a mano, così non cambia se cambia l'enum).
- Produces: colonne `utilities.arera_category` (enum nullable) e `utilities.disconnectable` (tinyint(1) nullable); `Utility.arera_category: AreraCategory | null`, `Utility.disconnectable: boolean | null`; tabelle `purpose`, `utility_type_purpose` e colonna `utilities.disconnection_ability` rimosse.

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/database/arera-categories.migration.spec.ts
import { QueryRunner } from 'typeorm';
import { AreraCategories1791600000000 } from './migrations/1791600000000-AreraCategories';

// Fuori da migrations/: il glob delle migration caricherebbe lo spec come migration.
function runner(answers: { match: RegExp; rows: unknown[] }[] = []) {
  const calls: { sql: string; params?: unknown[] }[] = [];
  const q = {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      return answers.find((a) => a.match.test(sql))?.rows ?? [];
    }),
  } as unknown as QueryRunner;
  return { q, calls };
}

describe('Migration AreraCategories1791600000000', () => {
  const migration = new AreraCategories1791600000000();

  it('si ferma prima di qualunque DDL se trova un valore di disalimentabilità non previsto', async () => {
    const { q, calls } = runner([
      { match: /-- preflight: disalimentabilità/, rows: [{ v: 'disalimentabile per E-DISTRIBUZIONE' }, { v: 'forse' }] },
    ]);
    await expect(migration.up(q)).rejects.toThrow(/forse/);
    expect(calls.some((c) => /ALTER TABLE|DROP|CREATE/.test(c.sql))).toBe(false);
  });

  it('converte i testi noti in sì/no, nota solo dove il testo dice di più, senza toccare update_date', async () => {
    const { q, calls } = runner();
    await migration.up(q);
    const conv = calls.filter((c) => c.sql.includes('SET `disconnectable`'));
    expect(conv.map((c) => c.params)).toEqual([
      [1, 1, 'disalimentabile per e-distribuzione'],
      [0, 1, 'non disalimentabile per e-distribuzione'],
      [0, 0, 'non disalimentabile'],
      [1, 1, 'uso pubblico disalim afd'],
      [1, 0, 'disalimentabile'],
    ]);
    for (const c of conv) expect(c.sql).toContain('`update_date` = `update_date`');
  });

  it('aggiunge le colonne prima di convertire e toglie testo e finalità dopo', async () => {
    const { q, calls } = runner();
    await migration.up(q);
    const idx = (re: RegExp) => calls.findIndex((c) => re.test(c.sql));
    expect(idx(/ADD `arera_category` enum \('EL_BT_DOMESTIC'/)).toBeGreaterThan(-1);
    expect(idx(/ADD `disconnectable` tinyint\(1\) NULL/)).toBeLessThan(idx(/SET `disconnectable`/));
    expect(idx(/DROP COLUMN `disconnection_ability`/)).toBeGreaterThan(idx(/SET `disconnectable`/));
    // utility_type_purpose prima di purpose (le sue FK puntano a purpose).
    expect(idx(/DROP TABLE `utility_type_purpose`/)).toBeLessThan(idx(/DROP TABLE `purpose`/));
  });

  it('down ricrea il testo dal booleano e le tabelle finalità vuote', async () => {
    const { q, calls } = runner();
    await migration.down(q);
    const sql = calls.map((c) => c.sql).join('\n');
    expect(sql).toContain("WHEN 1 THEN 'disalimentabile' WHEN 0 THEN 'non disalimentabile'");
    expect(sql).toContain('CREATE TABLE `purpose`');
    expect(sql).toContain('CREATE TABLE `utility_type_purpose`');
    expect(sql).toContain('DROP COLUMN `arera_category`');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/database/arera-categories.migration.spec.ts --maxWorkers=2`
Expected: FAIL, modulo `./migrations/1791600000000-AreraCategories` non trovato.

- [ ] **Step 3: Write the migration in a scratch path**

Scrivere il file in `backend/.scratch/1791600000000-AreraCategories.ts` (cartella fuori dal glob delle migration; non va committata), poi copiarlo nel path definitivo solo al punto 5. Per far girare lo spec durante lo sviluppo, l'import dello spec può puntare temporaneamente a `../../.scratch/...`; rimetterlo a `./migrations/...` prima del commit.

```ts
// backend/src/database/migrations/1791600000000-AreraCategories.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

// Tipologia contrattuale ARERA sull'utenza (al posto delle finalità d'uso,
// che non erano mai collegate alle utenze) e disalimentabilità da testo
// libero a sì/no/non noto. Elenco codici scritto qui: la migration non deve
// cambiare se in futuro cambia l'enum applicativo.
const ARERA_CODES = [
  'EL_BT_DOMESTIC', 'EL_BT_PUBLIC_LIGHTING', 'EL_BT_OTHER', 'EL_BT_EV_CHARGING',
  'EL_MT_PUBLIC_LIGHTING', 'EL_MT_OTHER',
  'WATER_DOMESTIC_RESIDENT', 'WATER_DOMESTIC_NON_RESIDENT', 'WATER_DOMESTIC_CONDOMINIUM',
  'WATER_INDUSTRIAL', 'WATER_COMMERCIAL', 'WATER_AGRICULTURAL',
  'WATER_PUBLIC_NON_DISCONNECTABLE', 'WATER_PUBLIC_DISCONNECTABLE', 'WATER_OTHER',
  'GAS_DOMESTIC', 'GAS_CONDOMINIUM_DOMESTIC', 'GAS_PUBLIC_SERVICE', 'GAS_OTHER',
];

// Testo (minuscolo, ripulito) → valore; `note` = il testo dice più del sì/no
// e va conservato nelle note dell'utenza.
const CONVERSION: { text: string; value: 0 | 1; note: 0 | 1 }[] = [
  { text: 'disalimentabile per e-distribuzione', value: 1, note: 1 },
  { text: 'non disalimentabile per e-distribuzione', value: 0, note: 1 },
  { text: 'non disalimentabile', value: 0, note: 0 },
  { text: 'uso pubblico disalim afd', value: 1, note: 1 },
  // Testo scritto da down(): rende ripetibile il ciclo up → down → up.
  { text: 'disalimentabile', value: 1, note: 0 },
];

export class AreraCategories1791600000000 implements MigrationInterface {
  name = 'AreraCategories1791600000000';

  public async up(q: QueryRunner): Promise<void> {
    // Le DDL MySQL fanno commit implicito: un valore non previsto si scopre
    // prima di toccare lo schema, altrimenti resterebbe a metà.
    const found: { v: string }[] = await q.query(
      `-- preflight: disalimentabilità
       SELECT DISTINCT TRIM(\`disconnection_ability\`) AS v FROM \`utilities\`
        WHERE TRIM(IFNULL(\`disconnection_ability\`, '')) <> ''`,
    );
    const known = new Set(CONVERSION.map((c) => c.text));
    const unknown = found.map((r) => r.v).filter((v) => !known.has(v.toLowerCase()));
    if (unknown.length > 0) {
      throw new Error(
        `Disalimentabilità con valori non previsti, da correggere prima della migration: ${unknown.join('; ')}`,
      );
    }

    const enumList = ARERA_CODES.map((c) => `'${c}'`).join(', ');
    await q.query(`ALTER TABLE \`utilities\` ADD \`arera_category\` enum (${enumList}) NULL`);
    await q.query(`ALTER TABLE \`utilities\` ADD \`disconnectable\` tinyint(1) NULL`);

    // update_date = update_date: scrittura di sistema, "Ultima modifica"
    // non deve spostarsi (assegnazione esplicita = niente ON UPDATE).
    for (const c of CONVERSION) {
      await q.query(
        `UPDATE \`utilities\` SET \`disconnectable\` = ?,
                \`notes\` = IF(? = 1, CONCAT_WS('\\n', NULLIF(\`notes\`, ''), CONCAT('Disalimentabilità: ', TRIM(\`disconnection_ability\`))), \`notes\`),
                \`update_date\` = \`update_date\`
          WHERE LOWER(TRIM(\`disconnection_ability\`)) = ?`,
        [c.value, c.note, c.text],
      );
    }

    await q.query(`ALTER TABLE \`utilities\` DROP COLUMN \`disconnection_ability\``);
    // utility_type_purpose per prima: le sue FK (dove esistono) puntano a purpose.
    await q.query(`DROP TABLE \`utility_type_purpose\``);
    await q.query(`DROP TABLE \`purpose\``);
  }

  // Ritorno con perdita dichiarata: le finalità (dati di prova) non tornano,
  // il testo originale della disalimentabilità resta solo nelle note.
  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE \`purpose\` (\`id\` int NOT NULL AUTO_INCREMENT, \`name\` varchar(255) NOT NULL, \`use_type\` enum ('GENERIC', 'SPECIFIC') NOT NULL, \`create_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`update_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`created_by_user_id\` int NOT NULL, \`updated_by_user_id\` int NOT NULL, \`deleted\` tinyint NOT NULL DEFAULT '0', INDEX \`IDX_0e4e689e26b6b3fdb47a4a8de0\` (\`created_by_user_id\`), UNIQUE INDEX \`IDX_4a272e999eb7c51548b0249e29\` (\`name\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await q.query(
      `ALTER TABLE \`purpose\` ADD CONSTRAINT \`FK_0e4e689e26b6b3fdb47a4a8de00\` FOREIGN KEY (\`created_by_user_id\`) REFERENCES \`system_users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await q.query(
      `ALTER TABLE \`purpose\` ADD CONSTRAINT \`FK_77dc5d21ae1e69bceaf481001bf\` FOREIGN KEY (\`updated_by_user_id\`) REFERENCES \`system_users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await q.query(
      `CREATE TABLE \`utility_type_purpose\` (\`utility_type_id\` int NOT NULL, \`purpose_id\` int NOT NULL, INDEX \`IDX_ef80be3fc01d5e693454b854ce\` (\`utility_type_id\`), INDEX \`IDX_1e8787cfd9a351ca1bc81f882e\` (\`purpose_id\`), PRIMARY KEY (\`utility_type_id\`, \`purpose_id\`)) ENGINE=InnoDB`,
    );
    await q.query(
      `ALTER TABLE \`utility_type_purpose\` ADD CONSTRAINT \`FK_ef80be3fc01d5e693454b854ce3\` FOREIGN KEY (\`utility_type_id\`) REFERENCES \`utility_types\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await q.query(
      `ALTER TABLE \`utility_type_purpose\` ADD CONSTRAINT \`FK_1e8787cfd9a351ca1bc81f882e9\` FOREIGN KEY (\`purpose_id\`) REFERENCES \`purpose\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await q.query(`ALTER TABLE \`utilities\` ADD \`disconnection_ability\` varchar(255) NULL`);
    await q.query(
      `UPDATE \`utilities\` SET \`disconnection_ability\` = CASE \`disconnectable\` WHEN 1 THEN 'disalimentabile' WHEN 0 THEN 'non disalimentabile' END,
              \`update_date\` = \`update_date\``,
    );
    await q.query(`ALTER TABLE \`utilities\` DROP COLUMN \`disconnectable\``);
    await q.query(`ALTER TABLE \`utilities\` DROP COLUMN \`arera_category\``);
  }
}
```

- [ ] **Step 4: Update the entity**

In `backend/src/apis/utility/entity/utility.entity.ts` sostituire:

```ts
  @Column({ length: 255, nullable: true })
  disconnection_ability: string;
```

con:

```ts
  @Column({ type: 'enum', enum: AreraCategory, nullable: true })
  arera_category: AreraCategory | null;

  // null = non noto.
  @Column({ type: 'boolean', nullable: true })
  disconnectable: boolean | null;
```

e aggiungere in testa: `import { AreraCategory } from '../arera-category';`

- [ ] **Step 5: Run test to verify it passes, then move the migration**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/database/arera-categories.migration.spec.ts --maxWorkers=2`
Expected: PASS (4 test). Poi copiare il file dallo scratch in `backend/src/database/migrations/1791600000000-AreraCategories.ts`, rimettere l'import dello spec a `./migrations/1791600000000-AreraCategories`, cancellare `backend/.scratch/`, rilanciare lo spec (PASS).

Nota: dal momento della copia il watcher esegue la migration sul DB locale (vedi Step 6). Le parti del codice che usano ancora `disconnection_ability`/`purpose` (DTO, service, frontend) si sistemano nei Task 3–8; fino ad allora l'API può dare errori su quei campi: è atteso.

- [ ] **Step 6: Ciclo reale up → down → up sul DB locale**

Uno alla volta, aspettando l'esito di ognuno:

1. Prima della copia (Step 5), salvare lo stato: `docker exec utenzepa-mysql-1 mysql -uroot -p'<MYSQL_PASSWORD>' mydatabase --default-character-set=utf8mb4 -e "SELECT id, disconnection_ability, notes, update_date FROM utilities WHERE IFNULL(disconnection_ability,'')<>'' ORDER BY id" > /tmp/before.tsv` (salvare in scratchpad di sessione, non nel repo).
2. Dopo la copia: `docker logs --since 120s utenzepa-api-1 2>&1 | grep -E "AreraCategories|Found 0 errors|ERROR"` → migration eseguita.
3. Verifica: `SELECT disconnectable, COUNT(*) FROM utilities GROUP BY 1` → 1: 39, 0: 7, NULL: resto; `SHOW TABLES LIKE 'purpose'` vuoto; `update_date` invariato per le righe di `before.tsv`.
4. Down: `docker exec utenzepa-api-1 node -r ts-node/register -r tsconfig-paths/register node_modules/typeorm/cli.js migration:revert -d src/database/data-source.ts` → `disconnection_ability` ricreata con "disalimentabile"/"non disalimentabile", tabelle finalità vuote.
5. Up di nuovo: `docker exec utenzepa-api-1 node -r ts-node/register -r tsconfig-paths/register node_modules/typeorm/cli.js migration:run -d src/database/data-source.ts` → stessi conteggi del punto 3, e le note **senza** una seconda riga "Disalimentabilità: …" (dopo il down il testo è "disalimentabile"/"non disalimentabile", entrambi con `note: 0`). Confrontare `id, disconnectable, notes, update_date` con il risultato del punto 3: identici.

- [ ] **Step 7: Commit**

```bash
git add backend/src/database/migrations/1791600000000-AreraCategories.ts backend/src/database/arera-categories.migration.spec.ts backend/src/apis/utility/entity/utility.entity.ts
git commit -m "feat(db): tipologia ARERA e disalimentabilità sì/no sulle utenze, via le finalità"
```

---

### Task 3: Validazione e filtri nel service utenze

**Files:**
- Modify: `backend/src/apis/utility/dto/create-utility.dto.ts:129-132`
- Modify: `backend/src/apis/utility/dto/update-utility.dto.ts:125-128`
- Modify: `backend/src/apis/utility/dto/search-utility.dto.ts:226-228`
- Modify: `backend/src/apis/utility/utility.service.ts` (create ~528, update ~554, findAll filtri ~267-385, join `utilityTypePurposes` alle righe ~221-222, ~442-443, ~478-479, proiezione `purposes` ~204-208)
- Test: `backend/src/apis/utility/utility.service.spec.ts`

**Interfaces:**
- Consumes: `AreraCategory`, `ARERA_NONE`, `isAreraCategoryAllowed` (Task 1); `HardTypeEnum`; colonne del Task 2.
- Produces: `CreateUtilityDto.arera_category?: AreraCategory | null`, `CreateUtilityDto.disconnectable?: boolean | null` (idem Update); `SearchUtilityDto.arera_category?: string` (codice o `'NONE'`), `SearchUtilityDto.disconnectable?: 'true' | 'false' | 'unknown'`.

- [ ] **Step 1: Write the failing tests**

In `utility.service.spec.ts`:
- eliminare il test `'espone le finalità del tipo utenza appiattite in utilityType.purposes'`;
- aggiungere in fondo al file, prima dell'ultima `});`:

```ts
  describe('tipologia ARERA', () => {
    // hard_type del tipo utenza letto con una query diretta.
    const typeIs = (hardType: string | null) =>
      repo.manager.query.mockImplementation(async (sql: string) =>
        sql.includes('FROM utility_types') ? (hardType ? [{ hard_type: hardType }] : []) : [],
      );

    it('create accetta una tipologia del tipo giusto', async () => {
      typeIs('WATER');
      await service.create(
        { utility_id: 'U1', utility_type_id_fk: 33, arera_category: 'WATER_OTHER', asset_ids: [1] } as never,
        1,
      );
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ arera_category: 'WATER_OTHER' }));
    });

    it('create rifiuta con 400 una tipologia di un altro tipo', async () => {
      typeIs('GAS');
      await expect(
        service.create(
          { utility_id: 'U1', utility_type_id_fk: 34, arera_category: 'WATER_OTHER', asset_ids: [1] } as never,
          1,
        ),
      ).rejects.toThrow('Tipologia ARERA non valida per il tipo di utenza.');
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('create senza tipologia (o Internet con null) non interroga il tipo', async () => {
      await service.create(
        { utility_id: 'U1', utility_type_id_fk: 36, arera_category: null, asset_ids: [1] } as never,
        1,
      );
      expect(repo.manager.query).not.toHaveBeenCalledWith(
        expect.stringContaining('FROM utility_types'),
        expect.anything(),
      );
    });

    it('update che cambia solo il tipo e lascia una tipologia non più ammessa viene rifiutato', async () => {
      typeIs('GAS');
      repo.findOne.mockResolvedValue({ id: 5, utility_type_id_fk: 33, arera_category: 'WATER_OTHER', deleted: false });
      await expect(service.update(5, { utility_type_id_fk: 34 } as never, 1)).rejects.toThrow(
        'Tipologia ARERA non valida per il tipo di utenza.',
      );
    });

    it('update che cambia tipo e svuota la tipologia passa', async () => {
      repo.findOne.mockResolvedValue({ id: 5, utility_type_id_fk: 33, arera_category: 'WATER_OTHER', deleted: false });
      await expect(
        service.update(5, { utility_type_id_fk: 34, arera_category: null } as never, 1),
      ).resolves.not.toThrow();
    });

    it('update senza tipo né tipologia non valida nulla', async () => {
      repo.findOne.mockResolvedValue({ id: 5, utility_type_id_fk: 33, arera_category: null, deleted: false });
      await service.update(5, { notes: 'x' } as never, 1);
      expect(repo.manager.query).not.toHaveBeenCalledWith(
        expect.stringContaining('FROM utility_types'),
        expect.anything(),
      );
    });

    it('filtra per tipologia, per "non assegnata" e per disalimentabilità, fuori dal filtro generico', async () => {
      await service.findAll({ arera_category: 'GAS_OTHER', disconnectable: 'false' } as never);
      expect(qb.andWhere).toHaveBeenCalledWith('Utility.arera_category = :arera_category', {
        arera_category: 'GAS_OTHER',
      });
      expect(qb.andWhere).toHaveBeenCalledWith('Utility.disconnectable = :disconnectable', {
        disconnectable: 0,
      });

      qb.andWhere.mockClear();
      await service.findAll({ arera_category: 'NONE', disconnectable: 'unknown' } as never);
      expect(qb.andWhere).toHaveBeenCalledWith('Utility.arera_category IS NULL');
      expect(qb.andWhere).toHaveBeenCalledWith('Utility.disconnectable IS NULL');
      // Nessun LIKE generico sui due campi.
      expect(qb.andWhere.mock.calls.some((c) => /arera_category LIKE|disconnectable LIKE/.test(String(c[0])))).toBe(false);
    });

    it('findAll non fa più join sulle finalità', async () => {
      await service.findAll({} as never);
      expect(qb.leftJoinAndSelect.mock.calls.some((c) => String(c[0]).includes('utilityTypePurposes'))).toBe(false);
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/utility/utility.service.spec.ts --maxWorkers=2`
Expected: FAIL sui nuovi test (nessuna validazione, filtri assenti, join presente).

- [ ] **Step 3: DTO**

`create-utility.dto.ts` e `update-utility.dto.ts`: sostituire il blocco `disconnection_ability` con

```ts
  @IsOptional()
  @IsEnum(AreraCategory, { message: 'Tipologia ARERA non valida.' })
  arera_category?: AreraCategory | null;

  @IsOptional()
  @IsBoolean()
  disconnectable?: boolean | null;
```

(import `AreraCategory` da `'../arera-category'`; aggiungere `IsEnum`/`IsBoolean` all'import di `class-validator` se mancano). `@IsOptional()` accetta anche `null`.

`search-utility.dto.ts`: sostituire il blocco `disconnection_ability` con

```ts
  @IsOptional()
  @IsIn([...Object.values(AreraCategory), ARERA_NONE])
  arera_category?: string;

  @IsOptional()
  @IsIn(['true', 'false', 'unknown'])
  disconnectable?: 'true' | 'false' | 'unknown';
```

(import `AreraCategory, ARERA_NONE` da `'../arera-category'`, `IsIn` da `class-validator`).

- [ ] **Step 4: Service**

In `utility.service.ts`:

1. Import: `import { AreraCategory, ARERA_NONE, isAreraCategoryAllowed } from './arera-category';` e `import { HardTypeEnum } from '@apis/utility-types/enum/hard-type.enum';`.
2. Nuovo metodo privato (vicino a `assertMeterAvailable`):

```ts
  // La tipologia ARERA deve appartenere al tipo dell'utenza (luce/acqua/gas;
  // Internet nessuna). hard_type letto con una query diretta: il service non
  // ha il repository dei tipi utenza.
  private async assertAreraCategory(
    utilityTypeId: number | null | undefined,
    category: AreraCategory | null | undefined,
  ): Promise<void> {
    if (!category) return;
    const rows: { hard_type: HardTypeEnum }[] = utilityTypeId
      ? await this.repo.manager.query('SELECT hard_type FROM utility_types WHERE id = ?', [utilityTypeId])
      : [];
    const hardType = rows[0]?.hard_type;
    if (!hardType || !isAreraCategoryAllowed(hardType, category)) {
      throw new BadRequestException('Tipologia ARERA non valida per il tipo di utenza.');
    }
  }
```

3. `create`: subito dopo `await this.assertMeterAvailable(rest.meter_number, null);` aggiungere
   `await this.assertAreraCategory(rest.utility_type_id_fk, rest.arera_category);`
4. `update`: dopo `if (!current) throw new BadRequestException('Utenza non trovata');` aggiungere

```ts
    // Valida se cambia la tipologia o il tipo: un cambio di tipo che lascia
    // la tipologia vecchia (non più ammessa) va rifiutato.
    if (rest.arera_category !== undefined || rest.utility_type_id_fk !== undefined) {
      await this.assertAreraCategory(
        rest.utility_type_id_fk ?? current.utility_type_id_fk,
        rest.arera_category !== undefined ? rest.arera_category : current.arera_category,
      );
    }
```

5. `findAll`: prima di `this.applyFilters(...)` aggiungere

```ts
    if (filters?.arera_category) {
      if (filters.arera_category === ARERA_NONE) {
        qb.andWhere('Utility.arera_category IS NULL');
      } else {
        qb.andWhere('Utility.arera_category = :arera_category', { arera_category: filters.arera_category });
      }
    }
    if (filters?.disconnectable) {
      if (filters.disconnectable === 'unknown') {
        qb.andWhere('Utility.disconnectable IS NULL');
      } else {
        qb.andWhere('Utility.disconnectable = :disconnectable', {
          disconnectable: filters.disconnectable === 'true' ? 1 : 0,
        });
      }
    }
```

   e aggiungere `'arera_category', 'disconnectable'` all'array di esclusione di `applyFilters`.
6. Rimuovere le righe `qb.leftJoinAndSelect('utilityType.utilityTypePurposes', 'utps');` e `qb.leftJoinAndSelect('utps.purpose', 'utpPurpose', 'utpPurpose.deleted = 0');` in `findAll`, `findBySafeguard`, `findOne`.
7. In `withCurrentContractFields` sostituire il blocco `utilityType: utility.utilityType ? {...} : null` con `utilityType: utility.utilityType ?? null,`.
8. Nel commento di `joinCurrentContract` sostituire `utilityType.utilityTypePurposes, asset.utilizerGrants` con `asset.utilizerGrants`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/utility --maxWorkers=2`
Expected: PASS (tutti, compresi i preesistenti).

- [ ] **Step 6: Commit**

```bash
git add backend/src/apis/utility/dto/create-utility.dto.ts backend/src/apis/utility/dto/update-utility.dto.ts backend/src/apis/utility/dto/search-utility.dto.ts backend/src/apis/utility/utility.service.ts backend/src/apis/utility/utility.service.spec.ts
git commit -m "feat(backend): validazione e filtri della tipologia ARERA sulle utenze"
```

---

### Task 4: Rimozione del modulo finalità (backend)

**Files:**
- Delete: `backend/src/apis/purpose/` (intera cartella)
- Delete: `backend/src/apis/utility-types/entity/utility_type_purpose.entity.ts`
- Modify: `backend/src/app.module.ts:35,76`
- Modify: `backend/src/apis/utility-types/entity/utility_type.entity.ts:63-72` e import
- Modify: `backend/src/apis/utility-types/utility-types.module.ts`
- Modify: `backend/src/apis/utility-types/utility-types.service.ts`
- Modify: `backend/src/apis/utility-types/dto/create-utility-type.dto.ts:24-27`, `update-utility-type.dto.ts:13-17`
- Test: `backend/src/apis/utility-types/utility-types.service.spec.ts`

**Interfaces:**
- Consumes: nulla.
- Produces: `UtilityTypesService(repo: Repository<UtilityType>)` (costruttore a un solo argomento), create/update ereditati da `BaseService`.

- [ ] **Step 1: Riscrivere lo spec dei tipi utenza (failing)**

Sostituire il contenuto di `utility-types.service.spec.ts` con:

```ts
import { UtilityTypesService } from './utility-types.service';

describe('UtilityTypesService', () => {
  let service: UtilityTypesService;
  let repo: { createQueryBuilder: jest.Mock; findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let qb: { where: jest.Mock; andWhere: jest.Mock; leftJoinAndSelect: jest.Mock; orderBy: jest.Mock; getMany: jest.Mock };

  beforeEach(() => {
    qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    repo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      findOne: jest.fn(),
      create: jest.fn((data) => data),
      save: jest.fn(async (data) => ({ ...data, id: 10 })),
    };
    service = new UtilityTypesService(repo as never);
  });

  it('findAll filtra i tipi non cancellati e non fa join sulle finalità', async () => {
    await service.findAll();
    expect(qb.where).toHaveBeenCalledWith('utility_types.deleted = :deleted', { deleted: false });
    expect(qb.leftJoinAndSelect).not.toHaveBeenCalled();
  });

  it('findAll filtra nome e descrizione con LIKE e hard_type esatto', async () => {
    await service.findAll({ name: 'gas', hard_type: 'GAS' } as never);
    expect(qb.andWhere).toHaveBeenCalledWith('utility_types.name LIKE :name', { name: '%gas%' });
    expect(qb.andWhere).toHaveBeenCalledWith('utility_types.hard_type = :hard_type', { hard_type: 'GAS' });
  });

  it('create salva il tipo con l’utente', async () => {
    const saved = await service.create({ name: 'Acqua', hard_type: 'WATER' } as never, 5);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Acqua', created_by_user_id: 5, updated_by_user_id: 5 }),
    );
    expect(saved.id).toBe(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/utility-types --maxWorkers=2`
Expected: FAIL (costruttore con 3 argomenti, join sulle finalità presente).

- [ ] **Step 3: Implementazione**

1. `utility-types.service.ts`, contenuto completo:

```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseService } from '@apis/shared/base.service';
import { UtilityType } from './entity/utility_type.entity';
import { CreateUtilityTypeDto } from './dto/create-utility-type.dto';
import { UpdateUtilityTypeDto } from './dto/update-utility-type.dto';
import { SearchUtilityTypeDto } from './dto/search-utility-type.dto';

@Injectable()
export class UtilityTypesService extends BaseService<
  UtilityType,
  CreateUtilityTypeDto,
  UpdateUtilityTypeDto
> {
  protected readonly entityName = 'utility_types';
  protected readonly relations = ['created_by', 'updated_by'];

  constructor(
    @InjectRepository(UtilityType)
    protected readonly repo: Repository<UtilityType>,
  ) {
    super();
  }

  async findAll(filter?: SearchUtilityTypeDto): Promise<UtilityType[]> {
    const alias = this.entityName;
    const qb = this.repo.createQueryBuilder(alias);
    qb.where(`${alias}.deleted = :deleted`, { deleted: filter?.deleted ?? false });

    if (filter) {
      Object.entries(filter).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '' || key === 'deleted') return;

        if (key === 'name' || key === 'description') {
          qb.andWhere(`${alias}.${key} LIKE :${key}`, { [key]: `%${value}%` });
        } else if (key === 'hard_type') {
          qb.andWhere(`${alias}.hard_type = :hard_type`, { hard_type: value });
        } else {
          qb.andWhere(`${alias}.${key} = :${key}`, { [key]: value });
        }
      });
    }

    return qb.orderBy(`${alias}.id`, 'ASC').getMany();
  }
}
```

2. `utility-types.module.ts`: `TypeOrmModule.forFeature([UtilityType])`, togliere l'import di `UtilityTypePurpose`.
3. `utility_type.entity.ts`: togliere `utilityTypePurposes`, `purposes` e gli import di `UtilityTypePurpose`, `Purpose`, `ManyToMany`, `JoinTable`.
4. DTO tipo utenza: togliere il campo `purposes` (e `IsArray` dall'import se non più usato).
5. Cancellare `backend/src/apis/purpose/` e `backend/src/apis/utility-types/entity/utility_type_purpose.entity.ts`; in `app.module.ts` togliere import e voce `PurposeModule`.
6. Verifica riferimenti residui: `git grep -n -i "purpose" -- backend/src ':!backend/src/database/migrations'` → solo `arera-categories.migration.spec.ts`.

- [ ] **Step 4: Run tests and type-check**

Run (uno alla volta):
- `docker exec utenzepa-api-1 pnpm exec jest src/apis/utility-types src/apis/utility --maxWorkers=2` → PASS
- `docker exec utenzepa-api-1 pnpm run type-check` → nessun errore
- `docker logs --since 120s utenzepa-api-1 2>&1 | grep -E "Found [0-9]+ error"` → `Found 0 errors`

- [ ] **Step 5: Commit**

```bash
git rm -r backend/src/apis/purpose backend/src/apis/utility-types/entity/utility_type_purpose.entity.ts
git add backend/src/app.module.ts backend/src/apis/utility-types/entity/utility_type.entity.ts backend/src/apis/utility-types/utility-types.module.ts backend/src/apis/utility-types/utility-types.service.ts backend/src/apis/utility-types/utility-types.service.spec.ts backend/src/apis/utility-types/dto/create-utility-type.dto.ts backend/src/apis/utility-types/dto/update-utility-type.dto.ts
git commit -m "refactor(backend): rimuove le finalità d'uso"
```

---

### Task 5: Anomalia "utenze attive senza tipologia ARERA" (backend)

**Files:**
- Modify: `backend/src/apis/anomalies/anomalies.service.ts` (interfaccia `Anomalies`, nuova query dopo `partiesWithoutIdentifier`, `return`)
- Test: `backend/src/apis/anomalies/anomalies.service.spec.ts`

**Interfaces:**
- Consumes: `utilities.arera_category` (Task 2), `UtilityAnomaly` esistente.
- Produces: campo `active_utilities_without_arera_category: AnomalyList<UtilityAnomaly>` nella risposta di `GET /anomalies` (11ª query, indice 10).

- [ ] **Step 1: Write the failing test**

In `anomalies.service.spec.ts`: nel primo test cambiare `expect(query).toHaveBeenCalledTimes(10);` in `toHaveBeenCalledTimes(11);` e aggiungere in fondo:

```ts
  it('elenca le utenze attive senza tipologia ARERA (Internet escluso)', async () => {
    for (let i = 0; i < 10; i++) query.mockResolvedValueOnce([]);
    query.mockResolvedValueOnce([{ id: 21, utility_id: 'IT004', type: 'gas' }]);
    const a = await service.getAnomalies();
    expect(a.active_utilities_without_arera_category).toEqual({
      count: 1,
      items: [{ id: 21, utility_id: 'IT004', type: 'gas' }],
    });
    const sql = query.mock.calls[10][0] as string;
    expect(sql).toContain('u.supply_active = 1');
    expect(sql).toContain("t.hard_type <> 'INTERNET'");
    expect(sql).toContain('u.arera_category IS NULL');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/anomalies --maxWorkers=2`
Expected: FAIL (10 chiamate invece di 11, campo assente).

- [ ] **Step 3: Implementazione**

1. Interfaccia `Anomalies`: aggiungere `active_utilities_without_arera_category: AnomalyList<UtilityAnomaly>;`.
2. Dopo la query `partiesWithoutIdentifier` (ultima esistente, così gli indici delle precedenti non cambiano):

```ts
    // Tipologia contrattuale ARERA da assegnare (Internet non ne ha).
    const withoutAreraCategory: UtilityAnomaly[] = await this.dataSource.query(
      `SELECT ${utilityColumns} ${activeUtilities}
       AND t.hard_type <> 'INTERNET' AND u.arera_category IS NULL
       ORDER BY t.name, u.utility_id`,
    );
```

3. Nel `return`: `active_utilities_without_arera_category: list(withoutAreraCategory),`.

- [ ] **Step 4: Run test to verify it passes**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/anomalies --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/apis/anomalies/anomalies.service.ts backend/src/apis/anomalies/anomalies.service.spec.ts
git commit -m "feat(backend): anomalia utenze attive senza tipologia ARERA"
```

---

### Task 6: Frontend — tipologie, entity utenza e scheda utenza

**Files:**
- Create: `frontend/src/app/pages/utilities/arera-category.ts`
- Modify: `frontend/src/app/pages/utilities/entity/utility.entity.ts:52`, `entity/utility.interface.ts:30`
- Modify: `frontend/src/app/pages/utilities/utility-edit-dialog.component.ts` (import ~21, `useTypeDescription` ~110, form ~159, `onUtilityTypeChange` ~432, `counterpartCount` ~527, opzioni)
- Modify: `frontend/src/app/pages/utilities/utility-edit-dialog.component.html` (Riepilogo ~38-49, Tecnici ~165-168, Controparti ~326-336)

Nota: il file delle tipologie sta in `pages/utilities/` e non in `core/helpers/` (come scritto nella spec) per non far importare a `core/` un enum di `pages/` (`HardType`): è proprio il problema segnalato nella roadmap, voce 13.

**Interfaces:**
- Consumes: `HardType` da `../utility-types/enum/hard-type.enum`; `TOption` da `../../core/types/option.interface`.
- Produces: `enum AreraCategory` (stessi 19 codici del backend), `ARERA_CATEGORY_LABEL: Record<AreraCategory, string>`, `ARERA_CATEGORIES_BY_HARD_TYPE: Record<HardType, AreraCategory[]>`, `ARERA_NONE = 'NONE'`, `areraOptionsFor(hardType: HardType | null): TOption[]`, `areraGroups(): {label: string; options: TOption[]}[]`, `areraLabel(code: string | null | undefined): string`, `DISCONNECTABLE_OPTIONS: TOption[]`; `Utility.arera_category?: AreraCategory | null`, `Utility.disconnectable?: boolean | null`.

- [ ] **Step 1: File delle tipologie**

```ts
// frontend/src/app/pages/utilities/arera-category.ts
import {HardType, HardTypeDescription} from '../utility-types/enum/hard-type.enum';
import {TOption} from '../../core/types/option.interface';

// Gemello di backend/src/apis/utility/arera-category.ts: stessi codici.
export enum AreraCategory {
  EL_BT_DOMESTIC = 'EL_BT_DOMESTIC',
  EL_BT_PUBLIC_LIGHTING = 'EL_BT_PUBLIC_LIGHTING',
  EL_BT_OTHER = 'EL_BT_OTHER',
  EL_BT_EV_CHARGING = 'EL_BT_EV_CHARGING',
  EL_MT_PUBLIC_LIGHTING = 'EL_MT_PUBLIC_LIGHTING',
  EL_MT_OTHER = 'EL_MT_OTHER',
  WATER_DOMESTIC_RESIDENT = 'WATER_DOMESTIC_RESIDENT',
  WATER_DOMESTIC_NON_RESIDENT = 'WATER_DOMESTIC_NON_RESIDENT',
  WATER_DOMESTIC_CONDOMINIUM = 'WATER_DOMESTIC_CONDOMINIUM',
  WATER_INDUSTRIAL = 'WATER_INDUSTRIAL',
  WATER_COMMERCIAL = 'WATER_COMMERCIAL',
  WATER_AGRICULTURAL = 'WATER_AGRICULTURAL',
  WATER_PUBLIC_NON_DISCONNECTABLE = 'WATER_PUBLIC_NON_DISCONNECTABLE',
  WATER_PUBLIC_DISCONNECTABLE = 'WATER_PUBLIC_DISCONNECTABLE',
  WATER_OTHER = 'WATER_OTHER',
  GAS_DOMESTIC = 'GAS_DOMESTIC',
  GAS_CONDOMINIUM_DOMESTIC = 'GAS_CONDOMINIUM_DOMESTIC',
  GAS_PUBLIC_SERVICE = 'GAS_PUBLIC_SERVICE',
  GAS_OTHER = 'GAS_OTHER',
}

export const ARERA_NONE = 'NONE';

export const ARERA_CATEGORY_LABEL: Record<AreraCategory, string> = {
  [AreraCategory.EL_BT_DOMESTIC]: 'BT usi domestici',
  [AreraCategory.EL_BT_PUBLIC_LIGHTING]: 'BT illuminazione pubblica',
  [AreraCategory.EL_BT_OTHER]: 'BT altri usi',
  [AreraCategory.EL_BT_EV_CHARGING]: 'BT ricarica veicoli elettrici in luoghi pubblici (BTVE)',
  [AreraCategory.EL_MT_PUBLIC_LIGHTING]: 'MT illuminazione pubblica',
  [AreraCategory.EL_MT_OTHER]: 'MT altri usi',
  [AreraCategory.WATER_DOMESTIC_RESIDENT]: 'Domestico residente',
  [AreraCategory.WATER_DOMESTIC_NON_RESIDENT]: 'Domestico non residente',
  [AreraCategory.WATER_DOMESTIC_CONDOMINIUM]: 'Domestico condominiale',
  [AreraCategory.WATER_INDUSTRIAL]: 'Industriale',
  [AreraCategory.WATER_COMMERCIAL]: 'Artigianale e commerciale',
  [AreraCategory.WATER_AGRICULTURAL]: 'Agricolo e zootecnico',
  [AreraCategory.WATER_PUBLIC_NON_DISCONNECTABLE]: 'Pubblico non disalimentabile',
  [AreraCategory.WATER_PUBLIC_DISCONNECTABLE]: 'Pubblico disalimentabile',
  [AreraCategory.WATER_OTHER]: 'Altri usi',
  [AreraCategory.GAS_DOMESTIC]: 'Domestico',
  [AreraCategory.GAS_CONDOMINIUM_DOMESTIC]: 'Condominio uso domestico',
  [AreraCategory.GAS_PUBLIC_SERVICE]: 'Attività di servizio pubblico',
  [AreraCategory.GAS_OTHER]: 'Usi diversi',
};

const byPrefix = (prefix: string) =>
  Object.values(AreraCategory).filter(c => c.startsWith(prefix));

export const ARERA_CATEGORIES_BY_HARD_TYPE: Record<HardType, AreraCategory[]> = {
  [HardType.LIGHT]: byPrefix('EL_'),
  [HardType.WATER]: byPrefix('WATER_'),
  [HardType.GAS]: byPrefix('GAS_'),
  [HardType.INTERNET]: [],
};

const toOption = (c: AreraCategory): TOption => ({label: ARERA_CATEGORY_LABEL[c], value: c});

export function areraOptionsFor(hardType: HardType | null): TOption[] {
  return hardType ? ARERA_CATEGORIES_BY_HARD_TYPE[hardType].map(toOption) : [];
}

// Per il filtro senza tipo scelto: tutte le tipologie raggruppate per tipo.
export function areraGroups(): {label: string; options: TOption[]}[] {
  return [HardType.LIGHT, HardType.WATER, HardType.GAS].map(t => ({
    label: HardTypeDescription[t],
    options: areraOptionsFor(t),
  }));
}

export function areraLabel(code: string | null | undefined): string {
  return code ? ARERA_CATEGORY_LABEL[code as AreraCategory] ?? code : '';
}

export const DISCONNECTABLE_OPTIONS: TOption[] = [
  {label: 'Sì', value: true},
  {label: 'No', value: false},
  {label: 'Non noto', value: null},
];
```

- [ ] **Step 2: Entity e interface utenza**

`entity/utility.entity.ts`: sostituire `disconnection_ability?: string;` con

```ts
  arera_category?: AreraCategory | null;
  disconnectable?: boolean | null;
```

`entity/utility.interface.ts`: sostituire `disconnection_ability?: string | null;` con

```ts
  arera_category?: AreraCategory | null;
  disconnectable?: boolean | null;
```

(import `AreraCategory` da `'../arera-category'` in entrambi; nell'entity, se il tipo è usato in una proprietà decorata, usare `import type`).

- [ ] **Step 3: Scheda utenza (TS)**

In `utility-edit-dialog.component.ts`:
1. Togliere `import {UseTypeDescription} from '../purpose/enum/use-type.enum';` e `readonly useTypeDescription = UseTypeDescription;`.
2. Import: `import {areraOptionsFor, DISCONNECTABLE_OPTIONS} from './arera-category';`.
3. Proprietà:

```ts
  readonly disconnectableOptions = DISCONNECTABLE_OPTIONS;
  areraOptions = areraOptionsFor(this.selectedHardType);
```

   (dichiarata **dopo** `selectedHardType`).
4. Form: sostituire `disconnection_ability: [this.data.item.disconnection_ability ?? ''],` con

```ts
    arera_category: [this.data.item.arera_category ?? null],
    disconnectable: [this.data.item.disconnectable ?? null],
```

5. `onUtilityTypeChange`: dopo `this.selectedHardType = ...` aggiungere

```ts
    this.areraOptions = areraOptionsFor(this.selectedHardType);
    // Tipologia non più ammessa per il nuovo tipo: si svuota (il backend
    // rifiuterebbe il salvataggio).
    const current = this.form.controls.arera_category.value;
    if (current && !this.areraOptions.some(o => o.value === current)) {
      this.form.controls.arera_category.setValue(null);
    }
```

6. `counterpartCount()`: `return this.grantsByAsset().reduce((n, g) => n + g.utilizers.length, 0);`

- [ ] **Step 4: Scheda utenza (HTML)**

1. Riepilogo: `<mat-label>Tipo Uso Contatore</mat-label>` → `<mat-label>Tipo utenza</mat-label>`; subito dopo la chiusura di quel `</mat-form-field>` aggiungere:

```html
          @if (areraOptions.length) {
            <mat-form-field>
              <mat-label>Tipologia ARERA</mat-label>
              <mat-select formControlName="arera_category">
                <mat-option [value]="null">Non assegnata</mat-option>
                @for (opt of areraOptions; track opt.value) {
                  <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          }
```

2. Tecnici e stato: sostituire il form-field "Disalimentabilità utenza" con

```html
          <mat-form-field>
            <mat-label>Disalimentabilità utenza</mat-label>
            <mat-select formControlName="disconnectable">
              @for (opt of disconnectableOptions; track opt.label) {
                <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
```

3. Controparti: togliere il blocco dal `<div class="sheet-section-title">Finalità d'uso</div>` fino al `}` che chiude `@else { <p class="sheet-empty">Nessuna finalità d'uso associata.</p> }` (incluso).

- [ ] **Step 5: Verifica compilazione**

Run: `docker logs --since 60s utenzepa-frontend-1 2>&1 | grep -E "✘|generation"`
Expected: `Application bundle generation complete`, nessuna riga `✘` relativa ai file toccati (errori in `pages/purpose/` o `utility-types/` sono attesi fino al Task 8; se ng serve non compila per quelli, proseguire al Task 8 e verificare lì).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/pages/utilities/arera-category.ts frontend/src/app/pages/utilities/entity/utility.entity.ts frontend/src/app/pages/utilities/entity/utility.interface.ts frontend/src/app/pages/utilities/utility-edit-dialog.component.ts frontend/src/app/pages/utilities/utility-edit-dialog.component.html
git commit -m "feat(frontend): tipologia ARERA e disalimentabilità sì/no nella scheda utenza"
```

---

### Task 7: Frontend — filtri ed elenco utenze

**Files:**
- Modify: `frontend/src/app/pages/utilities/utility-filter-dialog.component.ts` (interfaccia `UtilityFilterValues` ~38-42, form ~117-119, caricamento tipi ~168)
- Modify: `frontend/src/app/pages/utilities/utility-filter-dialog.component.html` (~84-94)
- Modify: `frontend/src/app/pages/utilities/search-utilities.component.ts:40,44`
- Modify: `frontend/src/app/pages/utilities/utility.service.ts:19`
- Modify: `frontend/src/app/pages/utilities/data-table-utilities.component.ts:77`, `data-table-utilities.component.html:225-228`

**Interfaces:**
- Consumes: `areraOptionsFor`, `areraGroups`, `ARERA_NONE`, `HardType` (Task 6).
- Produces: parametri di ricerca `arera_category` (codice o `NONE`) e `disconnectable` (`'true' | 'false' | 'unknown'`) verso `GET /utilities`.

- [ ] **Step 1: Valori e form dei filtri**

`utility-filter-dialog.component.ts`:
1. In `UtilityFilterValues` sostituire `meter_usage_type: string | null;` con `arera_category: string | null;` e `disconnection_ability: string | null;` con `disconnectable: 'true' | 'false' | 'unknown' | null;`.
2. Form: `disconnection_ability: [...]` → `disconnectable: [this.data.values.disconnectable ?? null],`; `meter_usage_type: [...]` → `arera_category: [this.data.values.arera_category ?? null],`.
3. Il caricamento dei tipi conserva l'`hard_type`:

```ts
  private hardTypeById = new Map<number, HardType>();
  readonly areraNone = ARERA_NONE;
  readonly areraGroups = areraGroups();
  readonly disconnectableFilterOptions: TOption[] = [
    {label: 'Sì', value: 'true'},
    {label: 'No', value: 'false'},
    {label: 'Non noto', value: 'unknown'},
  ];

  // Tipologie del tipo filtrato; senza tipo, null = mostra i gruppi.
  areraOptionsForFilter(): TOption[] | null {
    const typeId = this.form.controls.utility_type_id_fk.value as number | null;
    const hardType = typeId ? this.hardTypeById.get(typeId) ?? null : null;
    return hardType ? areraOptionsFor(hardType) : null;
  }
```

   e nel `next` di `utilityTypeService.search(...)`: prima del `map`, `data.forEach((t: any) => this.hardTypeById.set(t.id, t.hard_type));`.
   Import: `import {ARERA_NONE, areraGroups, areraOptionsFor} from './arera-category';`, `import {HardType} from '../utility-types/enum/hard-type.enum';`, `MatOptgroup` (da `@angular/material/core`) negli `imports` del componente se non già presente.

- [ ] **Step 2: HTML dei filtri**

Sostituire il form-field "Disalimentabilità" con:

```html
          <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
            <mat-label>Disalimentabilità</mat-label>
            <mat-select formControlName="disconnectable">
              <mat-option [value]="null">Tutte</mat-option>
              @for (opt of disconnectableFilterOptions; track opt.value) {
                <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
```

e il form-field "Tipo uso contatore" con:

```html
          <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
            <mat-label>Tipologia ARERA</mat-label>
            <mat-select formControlName="arera_category">
              <mat-option [value]="null">Tutte</mat-option>
              <mat-option [value]="areraNone">Non assegnata</mat-option>
              @if (areraOptionsForFilter(); as options) {
                @for (opt of options; track opt.value) {
                  <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
                }
              } @else {
                @for (group of areraGroups; track group.label) {
                  <mat-optgroup [label]="group.label">
                    @for (opt of group.options; track opt.value) {
                      <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
                    }
                  </mat-optgroup>
                }
              }
            </mat-select>
          </mat-form-field>
```

- [ ] **Step 3: Ricerca e servizio**

- `search-utilities.component.ts`: `meter_usage_type: [''],` → `arera_category: [null],`; `disconnection_ability: [''],` → `disconnectable: [null],`.
- `utility.service.ts`: nel tipo dei filtri `meter_usage_type?: string;` → `arera_category?: string; disconnectable?: string;`.

- [ ] **Step 4: Colonna in tabella**

- `data-table-utilities.component.ts:77`: `{field: 'disconnectable', header: 'Disalimentabilità', minWidth: '120px'},`
- `data-table-utilities.component.html`: sostituire il `ng-container matColumnDef="disconnection_ability"` con

```html
  <ng-container matColumnDef="disconnectable">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Disalimentabilità</th>
    <td mat-cell *matCellDef="let item">{{ item.disconnectable === true ? 'Sì' : item.disconnectable === false ? 'No' : '' }}</td>
  </ng-container>
```

- Cercare altri usi della colonna (preferenze colonne salvate, export): `git grep -n "disconnection_ability\|meter_usage_type" -- frontend/src` → nessun risultato.

- [ ] **Step 5: Verifica compilazione**

Run: `docker logs --since 60s utenzepa-frontend-1 2>&1 | grep -E "✘|generation"`
Expected: nessun `✘` sui file `pages/utilities/` (eventuali errori residui solo in `pages/purpose/`/`utility-types/`, risolti nel Task 8).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/pages/utilities/utility-filter-dialog.component.ts frontend/src/app/pages/utilities/utility-filter-dialog.component.html frontend/src/app/pages/utilities/search-utilities.component.ts frontend/src/app/pages/utilities/utility.service.ts frontend/src/app/pages/utilities/data-table-utilities.component.ts frontend/src/app/pages/utilities/data-table-utilities.component.html
git commit -m "feat(frontend): filtri tipologia ARERA e disalimentabilità nell'elenco utenze"
```

---

### Task 8: Frontend — anomalia in dashboard e rimozione delle finalità

**Files:**
- Modify: `frontend/src/app/pages/dashboard/anomalies-card.component.ts` (interfaccia ~33-44, template dopo il pannello "Utenze attive senza contratto valido" ~130, totale ~271-276)
- Delete: `frontend/src/app/pages/purpose/` (intera cartella)
- Modify: `frontend/src/app/app.routes.ts:22,57`
- Modify: `frontend/src/app/comp/sidebar/sidebar.component.ts:68`
- Modify: `frontend/src/app/pages/utility-types/utility-type-edit-dialog.component.ts`, `.html:32-49`, `utility-types.component.ts:34`, `entity/utility-type.entity.ts`, `entity/utility-type.interface.ts`

**Interfaces:**
- Consumes: campo `active_utilities_without_arera_category` di `GET /anomalies` (Task 5); `openUtility(id)` già presente nella card.
- Produces: nessuna interfaccia nuova.

- [ ] **Step 1: Anomalia**

1. Interfaccia `Anomalies`: aggiungere `active_utilities_without_arera_category: AnomalyList<UtilityAnomaly>;`.
2. Template, dopo il `</mat-expansion-panel>` di "Utenze attive senza contratto valido":

```html
            <mat-expansion-panel [disabled]="data.active_utilities_without_arera_category.count === 0">
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count" [class.zero]="data.active_utilities_without_arera_category.count === 0">{{ data.active_utilities_without_arera_category.count }}</span>
                  Utenze attive senza tipologia ARERA
                </mat-panel-title>
              </mat-expansion-panel-header>
              <ul class="anomaly-list">
                @for (u of data.active_utilities_without_arera_category.items; track u.id) {
                  <li (click)="openUtility(u.id)">{{ u.utility_id }} · {{ u.type }}</li>
                }
              </ul>
            </mat-expansion-panel>
```

3. Totale: aggiungere `+ this.data.active_utilities_without_arera_category.count` alla somma.

- [ ] **Step 2: Rimozione finalità**

1. Cancellare `frontend/src/app/pages/purpose/`.
2. `app.routes.ts`: togliere import di `PurposeComponent` e la rotta `{path: 'purpose', ...}`.
3. `sidebar.component.ts`: togliere la voce `Finalità d'uso`.
4. `utility-type-edit-dialog.component.ts`: togliere import di `PurposeService`, `Purpose`, `UseType`, il campo `purposeService`, `genericPurposes`/`specificPurposes`, i due controlli `generic_purpose_ids`/`specific_purpose_ids`, il corpo di `ngOnInit` (togliere anche `implements OnInit` e il metodo se resta vuoto); `save()` diventa:

```ts
  save(): void {
    if (!this.form.valid) return;
    const result = plainToInstance(UtilityType, {
      id: this.data.item.id,
      ...this.form.getRawValue(),
    });
    this.dialogRef.close(result);
  }
```

5. `utility-type-edit-dialog.component.html`: togliere i due `mat-form-field` "Finalità Generiche" e "Finalità Specifiche".
6. `utility-types.component.ts`: togliere `purposes: entity.purposes,` da `entityToPayload`.
7. `entity/utility-type.entity.ts`: togliere `purposes` (decoratori compresi), l'import di `Purpose`, `purposes: []` in `create`, e gli import `Type`/`Transform` se non più usati. `entity/utility-type.interface.ts`: togliere `purposes` e l'import di `IPurpose`.
8. Verifica: `git grep -n -i "purpose\|UseType" -- frontend/src` → nessun risultato.

- [ ] **Step 3: Build reale**

Run: `docker exec utenzepa-frontend-1 pnpm run build`
Expected: build completata senza errori (il template type-checking lo fa solo il compilatore Angular completo).

- [ ] **Step 4: Commit**

```bash
git rm -r frontend/src/app/pages/purpose
git add frontend/src/app/pages/dashboard/anomalies-card.component.ts frontend/src/app/app.routes.ts frontend/src/app/comp/sidebar/sidebar.component.ts frontend/src/app/pages/utility-types/utility-type-edit-dialog.component.ts frontend/src/app/pages/utility-types/utility-type-edit-dialog.component.html frontend/src/app/pages/utility-types/utility-types.component.ts frontend/src/app/pages/utility-types/entity/utility-type.entity.ts frontend/src/app/pages/utility-types/entity/utility-type.interface.ts
git commit -m "feat(frontend): anomalia senza tipologia ARERA, via la pagina finalità d'uso"
```

---

### Task 9: Verifica E2E, documentazione e versione

**Files:**
- Modify: `CLAUDE.md` (nota "Disalimentabilità utenza", elenco moduli `src/apis/`)
- Modify: `docs/roadmap-patrimonio.md` (voce 10)
- Modify: `publiccode.yml` (`softwareVersion`, `releaseDate`)

**Interfaces:**
- Consumes: tutto quanto sopra.
- Produces: branch pronto per la PR.

- [ ] **Step 1: E2E Playwright (utente temporaneo)**

Creare un utente temporaneo Admin come da CLAUDE.md (hash bcrypt nel container, `INSERT` in `system_users` con `username`, `auth_provider='local'`, `first_name`, `last_name`, `status='Attivo'`, `created_by_user_id=1`, `updated_by_user_id=1`). Su `http://localhost:4300` verificare:
1. `/utilities?selectedId=<id utenza acqua>`: il select "Tipologia ARERA" mostra solo le 9 voci acqua; scegliere "Altri usi", Salva, riaprire → valore conservato.
2. Stessa scheda: cambiare "Tipo utenza" in gas → il campo torna "Non assegnata" e mostra le 4 voci gas; Annulla.
3. Utenza Internet: il campo non c'è; Salva funziona.
4. "Disalimentabilità utenza": Sì/No/Non noto, salvataggio conservato.
5. Elenco utenze → Filtri: "Tipologia ARERA" = "Non assegnata" restringe l'elenco; con Tipo = acqua le opzioni sono solo acqua; "Disalimentabilità" = Sì restringe a 39 righe circa.
6. Dashboard: pannello "Utenze attive senza tipologia ARERA" con conteggio, click su una riga apre la scheda.
7. `/purpose` non esiste più (redirect o pagina vuota), voce assente dalla sidebar; dialog Tipi utenza senza campi finalità, salvataggio ok.

Poi riportare a `NULL` la tipologia dell'utenza di prova (`UPDATE utilities SET arera_category = NULL, update_date = update_date WHERE id = <id>`), pulire le righe di audit/master data come da CLAUDE.md ed **eliminare l'utente temporaneo**.

- [ ] **Step 2: Documentazione e versione**

- `CLAUDE.md`: sostituire la riga "Disalimentabilità utenza: campo testo libero `utilities.disconnection_ability`… non aggiungere flag nuovi. In generale: grep nell'entity prima di aggiungere una colonna "nuova"." con: "Disalimentabilità utenza: `utilities.disconnectable` (sì/no/null = non noto), testo originale Access nelle note. Tipologia contrattuale ARERA: `utilities.arera_category`, codici e regola codice ↔ tipo in `apis/utility/arera-category.ts` (gemello frontend `pages/utilities/arera-category.ts`). In generale: grep nell'entity prima di aggiungere una colonna "nuova"."; togliere `purpose` dall'elenco moduli di `src/apis/`.
- `docs/roadmap-patrimonio.md`: riga 10 della tabella → `fatto, v1.9.0 (valorizzazione delle tipologie sul DB locale da fare)`; in testa alla sezione 10 una riga "Fatto in v1.9.0: spec `docs/superpowers/specs/2026-10-02-tipologie-arera-design.md`. Valorizzazione: 239 valori dal campo Access "tipologia uso contatore", poi proposte per gruppi con conferma."
- `publiccode.yml`: `softwareVersion: "v1.9.0"`, `releaseDate: "<data del merge, AAAA-MM-GG>"`.

- [ ] **Step 3: Lint backend e pulizia del working tree**

Run: `docker exec utenzepa-api-1 pnpm run lint` poi `git diff --numstat` → scartare con `git checkout -- <file>` le righe `0 0` e le riformattazioni di file non toccati da questo piano.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/roadmap-patrimonio.md publiccode.yml
git commit -m "docs: tipologie ARERA in CLAUDE.md e roadmap, versione 1.9.0"
```

## Dopo il merge (fuori da questo piano)

Valorizzazione delle tipologie sul DB locale, una lista alla volta con conferma dell'utente, come descritto nella spec (sezione "Valorizzazione dei dati"). Nessun codice nel repo.

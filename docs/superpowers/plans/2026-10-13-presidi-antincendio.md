# Presidi antincendio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** nuovi tipi di presidio antincendio, quantità per riga, scadenze degli estintori in campi `mm/aaaa` con stato e segnalazione «Presidi scaduti».

**Architecture:** colonne nuove su `plant_fire_equipment` (una migration che converte anche le note importate); calcolo dello stato in `plant.calc.ts` con gemello nel frontend (`plant.model.ts`) e gemello SQL nell'anomalia `plants_fire_equipment_overdue`; tab «Presidi» esteso.

**Tech Stack:** NestJS 11 + TypeORM/MySQL 8, Angular 22 + Material, jest.

**Spec:** `docs/superpowers/specs/2026-10-13-presidi-antincendio-design.md`

## Global Constraints

- Branch `feat/presidi-antincendio`; release v1.24.0 (bump `softwareVersion`/`releaseDate` in `publiccode.yml`).
- Date `mm/aaaa` salvate come `AAAA-MM-01`; una scadenza vale fino all'ultimo giorno del suo mese; controllo = ultimo controllo + 6 mesi.
- Soglia «in scadenza»: 60 giorni (`INSPECTION_DUE_DAYS`), stessi colori delle verifiche.
- Le tre date solo per `EXTINGUISHER`; per gli altri tipi sempre `null`.
- `quantity` intero ≥ 1, default 1.
- Nota importata convertita → prefisso esatto `date importate: solo anno`.
- Comandi Docker uno alla volta; jest sempre con `--maxWorkers=2`; mai `git add .`/`-A`.
- Migration scritta in scratch (`.audit-w/`) e spostata in `backend/src/database/migrations/` solo a contenuto finale.
- Ogni modifica visibile aggiorna `frontend/public/guida/guida.md` (data in testa).
- Mai HTTP 409; nessun dato personale in test/commit.

## Review Focus

- Estintore con scadenza nel mese corrente (es. oggi 2026-10-13, scadenza `10/2026`) → **non** scaduto, «Entro 60 giorni». Test in Task 1.
- Cambio tipo da estintore a idrante su un presidio con date → date azzerate. Test in Task 3.
- Nota importata con testo extra («armeria») e nota non nel formato importato → testo extra conservato con prefisso; nota estranea invariata. Test in Task 2.
- Giro up → down → up della migration → note identiche all'originale. Verifica reale in Task 2.
- Input `mm/aaaa` non valido nel form (`13/2020`, `1/2020`, `2020`) → campo invalido, nessun invio. Test manuale Playwright in Task 6 (nessun test runner frontend).

---

### Task 1: Calcolo dello stato degli estintori (backend)

**Files:**
- Modify: `backend/src/apis/plants/plant.calc.ts`
- Test: `backend/src/apis/plants/plant.calc.spec.ts`

**Interfaces:**
- Consumes: `inspectionStatus(nextDate, today)`, `InspectionStatus`, `addMonths`/`addDays` (già importati in `plant.calc.ts`); `FireEquipmentType` (enum esistente, valori nuovi in Task 2 — qui si usa solo `EXTINGUISHER`).
- Produces:
  - `monthEnd(iso: string): string` — ultimo giorno del mese di `iso` (`'2017-01-01'` → `'2017-01-31'`).
  - `interface FireDeadlineInput { equipment_type: string; last_check_on: string | null; revision_due_on: string | null; test_due_on: string | null; deleted?: boolean }`
  - `fireEquipmentDeadlines(e: FireDeadlineInput): { kind: 'Controllo' | 'Revisione' | 'Collaudo'; due: string }[]` — `due` = fine mese; vuoto per i tipi diversi da `EXTINGUISHER`.
  - `fireEquipmentStatus(e: FireDeadlineInput, today: string): InspectionStatus | null` — `null` se non estintore; `NO_DATE` se nessuna data; altrimenti il peggiore.
  - `plantFireEquipmentStatus(list: FireDeadlineInput[], today: string): InspectionStatus | null` — peggiore tra gli estintori non cancellati; `null` se nessuno.

- [ ] **Step 1: Write the failing tests** (in coda a `plant.calc.spec.ts`; aggiungere gli import `monthEnd, fireEquipmentDeadlines, fireEquipmentStatus, plantFireEquipmentStatus` e `FireEquipmentType`)

```ts
describe('scadenze estintori', () => {
  const ext = (o: Partial<{ last_check_on: string | null; revision_due_on: string | null; test_due_on: string | null; deleted: boolean }> = {}) => ({
    equipment_type: FireEquipmentType.EXTINGUISHER,
    last_check_on: null,
    revision_due_on: null,
    test_due_on: null,
    ...o,
  });

  it('monthEnd: ultimo giorno del mese, anche febbraio', () => {
    expect(monthEnd('2017-01-01')).toBe('2017-01-31');
    expect(monthEnd('2024-02-01')).toBe('2024-02-29');
    expect(monthEnd('2026-02-15')).toBe('2026-02-28');
  });

  it('scadenze a fine mese, controllo = ultimo controllo + 6 mesi', () => {
    expect(
      fireEquipmentDeadlines(ext({ last_check_on: '2026-04-01', revision_due_on: '2027-01-01', test_due_on: '2030-03-01' })),
    ).toEqual([
      { kind: 'Controllo', due: '2026-10-31' },
      { kind: 'Revisione', due: '2027-01-31' },
      { kind: 'Collaudo', due: '2030-03-31' },
    ]);
  });

  it('scadenza nel mese corrente: non scaduta ma in scadenza', () => {
    expect(fireEquipmentStatus(ext({ revision_due_on: '2026-10-01' }), TODAY)).toBe(InspectionStatus.DUE_SOON);
    expect(fireEquipmentStatus(ext({ revision_due_on: '2026-09-01' }), TODAY)).toBe(InspectionStatus.OVERDUE);
  });

  it('stato = la peggiore delle tre; nessuna data = senza data', () => {
    expect(
      fireEquipmentStatus(ext({ revision_due_on: '2030-01-01', test_due_on: '2017-01-01' }), TODAY),
    ).toBe(InspectionStatus.OVERDUE);
    expect(fireEquipmentStatus(ext({ test_due_on: '2030-01-01' }), TODAY)).toBe(InspectionStatus.OK);
    expect(fireEquipmentStatus(ext(), TODAY)).toBe(InspectionStatus.NO_DATE);
  });

  it('gli altri tipi non hanno stato né scadenze', () => {
    const hydrant = { ...ext({ test_due_on: '2017-01-01' }), equipment_type: FireEquipmentType.HYDRANT };
    expect(fireEquipmentDeadlines(hydrant)).toEqual([]);
    expect(fireEquipmentStatus(hydrant, TODAY)).toBeNull();
  });

  it('impianto: peggiore tra gli estintori non cancellati, null senza estintori', () => {
    expect(
      plantFireEquipmentStatus(
        [ext({ test_due_on: '2030-01-01' }), ext({ test_due_on: '2017-01-01', deleted: true })],
        TODAY,
      ),
    ).toBe(InspectionStatus.OK);
    expect(
      plantFireEquipmentStatus([{ ...ext(), equipment_type: FireEquipmentType.HYDRANT }], TODAY),
    ).toBeNull();
  });
});
```

(`TODAY` nello spec è `'2026-10-02'`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `docker exec utenzepa-api-1 sh -c "cd /usr/src/app && pnpm exec jest src/apis/plants/plant.calc.spec.ts --maxWorkers=2"`
Expected: FAIL (`monthEnd` non esportata).

- [ ] **Step 3: Implement** (in `plant.calc.ts`, dopo `inspectionStatus`; aggiungere `FireEquipmentType` all'import dell'enum)

```ts
// Ultimo giorno del mese: una scadenza mm/aaaa vale fino a fine mese.
export function monthEnd(iso: string): string {
  return addDays(addMonths(`${iso.slice(0, 7)}-01`, 1), -1);
}

export interface FireDeadlineInput {
  equipment_type: string;
  last_check_on: string | null;
  revision_due_on: string | null;
  test_due_on: string | null;
  deleted?: boolean;
}

// Scadenze di un estintore (gemello frontend: fireEquipmentDeadlinesOf in
// plant.model.ts; gemello SQL: anomalia plants_fire_equipment_overdue).
export function fireEquipmentDeadlines(
  e: FireDeadlineInput,
): { kind: 'Controllo' | 'Revisione' | 'Collaudo'; due: string }[] {
  if (e.equipment_type !== FireEquipmentType.EXTINGUISHER) return [];
  const out: { kind: 'Controllo' | 'Revisione' | 'Collaudo'; due: string }[] = [];
  if (e.last_check_on) out.push({ kind: 'Controllo', due: monthEnd(addMonths(e.last_check_on.slice(0, 10), 6)) });
  if (e.revision_due_on) out.push({ kind: 'Revisione', due: monthEnd(e.revision_due_on) });
  if (e.test_due_on) out.push({ kind: 'Collaudo', due: monthEnd(e.test_due_on) });
  return out;
}

const STATUS_SEVERITY = [
  InspectionStatus.OVERDUE,
  InspectionStatus.DUE_SOON,
  InspectionStatus.OK,
  InspectionStatus.NO_DATE,
];
const worst = (statuses: InspectionStatus[]): InspectionStatus | null =>
  STATUS_SEVERITY.find((s) => statuses.includes(s)) ?? null;

export function fireEquipmentStatus(e: FireDeadlineInput, today: string): InspectionStatus | null {
  if (e.equipment_type !== FireEquipmentType.EXTINGUISHER) return null;
  const deadlines = fireEquipmentDeadlines(e);
  if (deadlines.length === 0) return InspectionStatus.NO_DATE;
  return worst(deadlines.map((d) => inspectionStatus(d.due, today)));
}

export function plantFireEquipmentStatus(
  list: FireDeadlineInput[],
  today: string,
): InspectionStatus | null {
  const statuses = list
    .filter((e) => !e.deleted)
    .map((e) => fireEquipmentStatus(e, today))
    .filter((s): s is InspectionStatus => s !== null);
  return worst(statuses);
}
```

- [ ] **Step 4: Run test to verify it passes** — stesso comando; Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/apis/plants/plant.calc.ts backend/src/apis/plants/plant.calc.spec.ts
git commit -m "feat(plants): scadenze e stato degli estintori"
```

---

### Task 2: Migration, entity, enum, DTO

**Files:**
- Create (scratch, poi spostare): `backend/src/database/migrations/1794200000000-FireEquipmentDetails.ts`
- Create: `backend/src/database/fire-equipment-details.migration.spec.ts`
- Modify: `backend/src/apis/plants/enum/plant.enum.ts` (enum `FireEquipmentType`)
- Modify: `backend/src/apis/plants/entity/plant-fire-equipment.entity.ts`
- Modify: `backend/src/apis/plants/dto/plant-fire-equipment.dto.ts`

**Interfaces:**
- Produces:
  - `FireEquipmentType` + `SMOKE_DETECTOR`, `ALARM_BUTTON`, `DETECTION_PANEL`, `ALARM_SIGNAL`, `SIREN`.
  - Entity: `quantity: number`, `last_check_on: string | null`, `revision_due_on: string | null`, `test_due_on: string | null`.
  - DTO create/update: `quantity?: number` (`@IsInt() @Min(1)`), le tre date `@IsOptional() @DateOnly()`.
  - Dalla migration: `export function splitImportedNotes(notes: string | null): { revision: number | null; test: number | null; check: number | null; notes: string | null } | null` e `export function joinImportedNotes(r: { revision: number | null; test: number | null; check: number | null; notes: string | null }): string | null`; `export const IMPORTED_PREFIX = 'date importate: solo anno'`.

- [ ] **Step 1: Write the failing spec** (`backend/src/database/fire-equipment-details.migration.spec.ts`)

```ts
import {
  FireEquipmentDetails1794200000000,
  IMPORTED_PREFIX,
  joinImportedNotes,
  splitImportedNotes,
} from './migrations/1794200000000-FireEquipmentDetails';

describe('FireEquipmentDetails: note importate', () => {
  it('tre anni → tre date, nota con solo il prefisso', () => {
    expect(splitImportedNotes('scad. carica 2017; scad. collaudo 2018; ultima verifica 2014')).toEqual({
      revision: 2017, test: 2018, check: 2014, notes: IMPORTED_PREFIX,
    });
  });
  it('testo extra conservato dopo il prefisso', () => {
    expect(splitImportedNotes('scad. carica 2017; scad. collaudo 2017; ultima verifica 2014; armeria')).toEqual({
      revision: 2017, test: 2017, check: 2014, notes: `${IMPORTED_PREFIX}; armeria`,
    });
  });
  it('due anni soltanto', () => {
    expect(splitImportedNotes('scad. carica 2020; scad. collaudo 2025')).toEqual({
      revision: 2020, test: 2025, check: null, notes: IMPORTED_PREFIX,
    });
  });
  it('nota estranea o vuota: nessuna conversione', () => {
    expect(splitImportedNotes('da riepilogo antincendio 2014')).toBeNull();
    expect(splitImportedNotes(null)).toBeNull();
  });
  it('join ricompone la nota originale (giro up → down)', () => {
    for (const original of [
      'scad. carica 2017; scad. collaudo 2018; ultima verifica 2014',
      'scad. carica 2017; scad. collaudo 2017; ultima verifica 2014; armeria',
      'scad. carica 2020; scad. collaudo 2025',
    ]) {
      expect(joinImportedNotes(splitImportedNotes(original)!)).toBe(original);
    }
  });
});

describe('FireEquipmentDetails: up/down', () => {
  const runner = (rows: unknown[], newTypes = 0) => {
    const sqls: string[] = [];
    const params: unknown[][] = [];
    const query = jest.fn(async (sql: string, p?: unknown[]) => {
      sqls.push(sql);
      if (p) params.push(p);
      if (sql.includes('/* select-notes */') || sql.includes('/* select-dates */')) return rows;
      if (sql.includes('/* count-new-types */')) return [{ n: newTypes }];
      return [];
    });
    return { q: { query } as never, sqls, params };
  };

  it('up: enum esteso, colonne aggiunte, note convertite', async () => {
    const { q, sqls, params } = runner([
      { id: 1, notes: 'scad. carica 2017; scad. collaudo 2018; ultima verifica 2014' },
      { id: 2, notes: 'altro' },
    ]);
    await new FireEquipmentDetails1794200000000().up(q);
    const all = sqls.join('\n');
    expect(all).toContain("'SMOKE_DETECTOR'");
    expect(all).toContain('ADD `quantity` int NOT NULL DEFAULT 1');
    expect(all).toContain('ADD `last_check_on` date NULL');
    expect(params).toContainEqual(['2017-01-01', '2018-01-01', '2014-01-01', IMPORTED_PREFIX, 1]);
    expect(params.some((p) => p[4] === 2)).toBe(false);
  });

  it('down: note ricomposte, nuovi tipi eliminati, colonne tolte', async () => {
    const { q, sqls, params } = runner(
      [{ id: 1, r: 2017, t: 2018, c: 2014, notes: IMPORTED_PREFIX }],
      3,
    );
    await new FireEquipmentDetails1794200000000().down(q);
    const all = sqls.join('\n');
    expect(params).toContainEqual(['scad. carica 2017; scad. collaudo 2018; ultima verifica 2014', 1]);
    expect(all).toContain('DELETE FROM `plant_fire_equipment` WHERE `equipment_type` IN');
    expect(all).toContain('DROP COLUMN `quantity`');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `docker exec utenzepa-api-1 sh -c "cd /usr/src/app && pnpm exec jest src/database/fire-equipment-details.migration.spec.ts --maxWorkers=2"`
Expected: FAIL (modulo non trovato).

- [ ] **Step 3: Write the migration in scratch** (`.audit-w/1794200000000-FireEquipmentDetails.ts`), contenuto finale:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

// Presidi antincendio: nuovi tipi (rivelazione e allarme), quantità per riga,
// scadenze degli estintori in mese/anno al posto delle note importate
// ("scad. carica AAAA; scad. collaudo AAAA; ultima verifica AAAA": solo l'anno,
// salvato come gennaio con il prefisso IMPORTED_PREFIX nella nota).
export const IMPORTED_PREFIX = 'date importate: solo anno';

const OLD_TYPES = ['EXTINGUISHER', 'HYDRANT', 'HOSE_REEL', 'FIRE_BRIGADE_CONNECTION'];
const NEW_TYPES = ['SMOKE_DETECTOR', 'ALARM_BUTTON', 'DETECTION_PANEL', 'ALARM_SIGNAL', 'SIREN'];
const enumSql = (values: string[]) => `enum (${values.map((v) => `'${v}'`).join(', ')})`;

const PARTS = [
  { key: 'revision', re: /^scad\. carica (\d{4})$/, label: 'scad. carica' },
  { key: 'test', re: /^scad\. collaudo (\d{4})$/, label: 'scad. collaudo' },
  { key: 'check', re: /^ultima verifica (\d{4})$/, label: 'ultima verifica' },
] as const;

type Split = { revision: number | null; test: number | null; check: number | null; notes: string | null };

export function splitImportedNotes(notes: string | null): Split | null {
  if (!notes) return null;
  const out: Split = { revision: null, test: null, check: null, notes: null };
  const rest: string[] = [];
  let found = false;
  for (const piece of notes.split(';').map((s) => s.trim()).filter(Boolean)) {
    const part = PARTS.find((p) => p.re.test(piece));
    if (part) {
      out[part.key] = Number(piece.match(part.re)![1]);
      found = true;
    } else {
      rest.push(piece);
    }
  }
  if (!found) return null;
  out.notes = [IMPORTED_PREFIX, ...rest].join('; ');
  return out;
}

export function joinImportedNotes(r: Split): string | null {
  const pieces = PARTS.filter((p) => r[p.key] !== null).map((p) => `${p.label} ${r[p.key]}`);
  const rest = (r.notes ?? '')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s && s !== IMPORTED_PREFIX);
  const all = [...pieces, ...rest];
  return all.length ? all.join('; ') : null;
}

export class FireEquipmentDetails1794200000000 implements MigrationInterface {
  name = 'FireEquipmentDetails1794200000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE \`plant_fire_equipment\` MODIFY \`equipment_type\` ${enumSql([...OLD_TYPES, ...NEW_TYPES])} NOT NULL`,
    );
    await q.query(
      'ALTER TABLE `plant_fire_equipment` ADD `quantity` int NOT NULL DEFAULT 1 AFTER `equipment_type`',
    );
    await q.query(
      'ALTER TABLE `plant_fire_equipment` ADD `last_check_on` date NULL AFTER `location`, ADD `revision_due_on` date NULL AFTER `last_check_on`, ADD `test_due_on` date NULL AFTER `revision_due_on`',
    );
    const rows: { id: number; notes: string | null }[] = await q.query(
      "/* select-notes */ SELECT `id`, `notes` FROM `plant_fire_equipment` WHERE `equipment_type` = 'EXTINGUISHER' AND `notes` IS NOT NULL",
    );
    const jan = (y: number | null) => (y === null ? null : `${y}-01-01`);
    for (const row of rows) {
      const s = splitImportedNotes(row.notes);
      if (!s) continue;
      await q.query(
        'UPDATE `plant_fire_equipment` SET `revision_due_on` = ?, `test_due_on` = ?, `last_check_on` = ?, `notes` = ?, `update_date` = `update_date` WHERE `id` = ?',
        [jan(s.revision), jan(s.test), jan(s.check), s.notes, row.id],
      );
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    const rows: { id: number; r: number | null; t: number | null; c: number | null; notes: string | null }[] =
      await q.query(
        '/* select-dates */ SELECT `id`, YEAR(`revision_due_on`) r, YEAR(`test_due_on`) t, YEAR(`last_check_on`) c, `notes` FROM `plant_fire_equipment` WHERE `revision_due_on` IS NOT NULL OR `test_due_on` IS NOT NULL OR `last_check_on` IS NOT NULL',
      );
    for (const row of rows) {
      const notes = joinImportedNotes({
        revision: row.r === null ? null : Number(row.r),
        test: row.t === null ? null : Number(row.t),
        check: row.c === null ? null : Number(row.c),
        notes: row.notes,
      });
      await q.query('UPDATE `plant_fire_equipment` SET `notes` = ?, `update_date` = `update_date` WHERE `id` = ?', [notes, row.id]);
    }
    const [{ n }] = await q.query(
      `/* count-new-types */ SELECT COUNT(*) n FROM \`plant_fire_equipment\` WHERE \`equipment_type\` IN (${NEW_TYPES.map((t) => `'${t}'`).join(', ')})`,
    );
    if (Number(n) > 0) {
      console.warn(`FireEquipmentDetails down: eliminati ${n} presidi dei nuovi tipi`);
    }
    await q.query(
      `DELETE FROM \`plant_fire_equipment\` WHERE \`equipment_type\` IN (${NEW_TYPES.map((t) => `'${t}'`).join(', ')})`,
    );
    await q.query(
      'ALTER TABLE `plant_fire_equipment` DROP COLUMN `test_due_on`, DROP COLUMN `revision_due_on`, DROP COLUMN `last_check_on`, DROP COLUMN `quantity`',
    );
    await q.query(
      `ALTER TABLE \`plant_fire_equipment\` MODIFY \`equipment_type\` ${enumSql(OLD_TYPES)} NOT NULL`,
    );
  }
}
```

Nota: il down giunta le colonne in un solo statement con `DROP COLUMN \`quantity\`` dentro (lo spec cerca `DROP COLUMN \`quantity\``).

- [ ] **Step 4: Enum, entity, DTO**

`plant.enum.ts`:

```ts
export enum FireEquipmentType {
  EXTINGUISHER = 'EXTINGUISHER',
  HYDRANT = 'HYDRANT',
  HOSE_REEL = 'HOSE_REEL',
  FIRE_BRIGADE_CONNECTION = 'FIRE_BRIGADE_CONNECTION',
  // Rivelazione e allarme: contati (quantità), senza matricola.
  SMOKE_DETECTOR = 'SMOKE_DETECTOR',
  ALARM_BUTTON = 'ALARM_BUTTON',
  DETECTION_PANEL = 'DETECTION_PANEL',
  ALARM_SIGNAL = 'ALARM_SIGNAL',
  SIREN = 'SIREN',
}
```

`plant-fire-equipment.entity.ts` — commento in testa: `// Presidio antincendio di un impianto antincendio (estintori, idranti, naspi, attacchi VVF, rivelazione e allarme).`; dopo `equipment_type`:

```ts
  // Pezzi rappresentati dalla riga (rivelatori, pulsanti… si contano);
  // gli estintori restano uno per riga, con la matricola.
  @Column({ type: 'int', default: 1 })
  quantity: number;
```

dopo `location`:

```ts
  // Solo estintori, mese/anno salvati come primo del mese (vedi plant.calc.ts).
  @Column({ type: 'date', nullable: true })
  last_check_on: string | null;

  @Column({ type: 'date', nullable: true })
  revision_due_on: string | null;

  @Column({ type: 'date', nullable: true })
  test_due_on: string | null;
```

`plant-fire-equipment.dto.ts` — import `IsInt, Min` e `DateOnly` (`@common/decorators/date-only.decorator`); campi:

```ts
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  // mese/anno: il server normalizza al primo del mese.
  @IsOptional()
  @DateOnly()
  last_check_on?: string | null;

  @IsOptional()
  @DateOnly()
  revision_due_on?: string | null;

  @IsOptional()
  @DateOnly()
  test_due_on?: string | null;
```

- [ ] **Step 5: Run spec** — prima salvare le note attuali (Step 6, punto 1), poi spostare `.audit-w/1794200000000-FireEquipmentDetails.ts` → `backend/src/database/migrations/` (contenuto ormai finale: il watcher la eseguirà subito) ed eseguire lo spec con il comando dello Step 2. Expected: PASS.

- [ ] **Step 6: Verifica sul DB locale** (un comando Docker alla volta)

1. Prima dello spostamento: `SELECT id, notes FROM plant_fire_equipment ORDER BY id` → salvato in `.audit-w/fire_notes_before.tsv`.
2. Dopo lo spostamento il watcher esegue `up`: verificare la riga in `migrations` (se manca: `docker restart utenzepa-api-1`), poi `SELECT equipment_type, COUNT(*), SUM(revision_due_on IS NOT NULL), SUM(test_due_on IS NOT NULL), SUM(last_check_on IS NOT NULL) FROM plant_fire_equipment GROUP BY 1` → attesi 298 estintori con 297 revisioni, 297 collaudi, 252 ultime verifiche.
3. `docker exec utenzepa-api-1 sh -c "cd /usr/src/app && pnpm run migration:revert"` (verificare il nome dello script in `package.json`; in alternativa `pnpm typeorm migration:revert -d src/database/data-source.ts`), poi `SELECT id, notes ...` → identico a `fire_notes_before.tsv` (`diff`).
4. `docker restart utenzepa-api-1` → `up` di nuovo; ricontrollare i conteggi del punto 2.
5. `pnpm run schema:log` nel container: nessuno statement su `plant_fire_equipment`.

- [ ] **Step 7: Commit**

```bash
git add backend/src/database/migrations/1794200000000-FireEquipmentDetails.ts backend/src/database/fire-equipment-details.migration.spec.ts backend/src/apis/plants/enum/plant.enum.ts backend/src/apis/plants/entity/plant-fire-equipment.entity.ts backend/src/apis/plants/dto/plant-fire-equipment.dto.ts
git commit -m "feat(plants): nuovi tipi di presidio, quantità e scadenze degli estintori (migration)"
```

---

### Task 3: Service — normalizzazione e stato nella risposta

**Files:**
- Modify: `backend/src/apis/plants/plants.service.ts` (`PlantRow`, `addFireEquipment`, `updateFireEquipment`, `toRow`)
- Test: `backend/src/apis/plants/plants.service.spec.ts`

**Interfaces:**
- Consumes: `plantFireEquipmentStatus` (Task 1); colonne/DTO (Task 2).
- Produces: `PlantRow.fire_equipment_status: InspectionStatus | null` (solo per `FIRE_PROTECTION`, altrimenti `null`).

- [ ] **Step 1: Write the failing tests** (nel `describe` del service; `plant()` è l'helper esistente dello spec)

```ts
  it('presidio: date normalizzate al primo del mese, quantità default', async () => {
    repo.findOne.mockResolvedValue(plant({ type: PlantType.FIRE_PROTECTION }));
    await service.addFireEquipment(
      1,
      { equipment_type: 'EXTINGUISHER', revision_due_on: '2027-03-15' } as never,
      3,
    );
    expect(fireRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ revision_due_on: '2027-03-01', plant_id: 1 }),
    );
  });

  it('presidio non estintore: date sempre azzerate, anche cambiando tipo', async () => {
    fireRepo.findOne.mockResolvedValue({
      id: 6, plant_id: 1, equipment_type: 'EXTINGUISHER', quantity: 1,
      last_check_on: '2026-01-01', revision_due_on: '2027-01-01', test_due_on: '2030-01-01', deleted: false,
    });
    await service.updateFireEquipment(6, { equipment_type: 'HYDRANT' } as never, 3);
    expect(fireRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        equipment_type: 'HYDRANT', last_check_on: null, revision_due_on: null, test_due_on: null,
      }),
    );
  });

  it('riga: stato dei presidi = peggiore tra gli estintori', async () => {
    repo.find.mockResolvedValue([
      plant({
        type: PlantType.FIRE_PROTECTION,
        fireEquipment: [
          { equipment_type: 'EXTINGUISHER', last_check_on: null, revision_due_on: '2017-01-01', test_due_on: null, deleted: false },
        ],
      }),
      plant({ id: 2 }),
    ]);
    const rows = await service.findAll({} as never);
    expect(rows[0].fire_equipment_status).toBe('OVERDUE');
    expect(rows[1].fire_equipment_status).toBeNull();
  });
```

(Verificare il nome reale del metodo di elenco usato dallo spec esistente «riga con qualità della posizione…» e usare lo stesso.)

- [ ] **Step 2: Run to verify it fails**

Run: `docker exec utenzepa-api-1 sh -c "cd /usr/src/app && pnpm exec jest src/apis/plants/plants.service.spec.ts --maxWorkers=2"`
Expected: FAIL.

- [ ] **Step 3: Implement**

In testa a `plants.service.ts` importare `plantFireEquipmentStatus` da `./plant.calc` e `FireEquipmentType` dall'enum. Aggiungere:

```ts
// Le date dei presidi valgono solo per gli estintori, in mese/anno.
const monthStart = (v: string | null | undefined): string | null | undefined =>
  v ? `${v.slice(0, 7)}-01` : v;

function normalizeFireEquipment<T extends Partial<PlantFireEquipment>>(e: T): T {
  if (e.equipment_type !== FireEquipmentType.EXTINGUISHER) {
    return { ...e, last_check_on: null, revision_due_on: null, test_due_on: null };
  }
  return {
    ...e,
    last_check_on: monthStart(e.last_check_on),
    revision_due_on: monthStart(e.revision_due_on),
    test_due_on: monthStart(e.test_due_on),
  };
}
```

`PlantRow`: aggiungere `fire_equipment_status: InspectionStatus | null;` con commento `// Stato dei presidi: l'estintore messo peggio (solo impianti antincendio).`

`addFireEquipment`: `this.fireRepo.create(normalizeFireEquipment({ ...dto, plant_id: plantId, created_by_user_id: userId, updated_by_user_id: userId }))`.

`updateFireEquipment`: `return this.fireRepo.save(normalizeFireEquipment({ ...current, ...dto, updated_by_user_id: userId }));`

`toRow`: calcolare `const fireEquipment = (p.fireEquipment ?? []).filter((f) => !f.deleted);`, usarlo nel `row`, e aggiungere
`fire_equipment_status: p.type === PlantType.FIRE_PROTECTION ? plantFireEquipmentStatus(fireEquipment, today) : null,`

- [ ] **Step 4: Run tests** — stesso comando, più `plant.calc.spec.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/apis/plants/plants.service.ts backend/src/apis/plants/plants.service.spec.ts
git commit -m "feat(plants): stato dei presidi nella scheda impianto, date solo per gli estintori"
```

---

### Task 4: Anomalia «Presidi scaduti»

**Files:**
- Modify: `backend/src/apis/anomalies/anomalies.service.ts`
- Test: `backend/src/apis/anomalies/anomalies.service.spec.ts`
- Modify: `frontend/src/app/core/services/anomalies.service.ts` (interfaccia `Anomalies`)

**Interfaces:**
- Produces: `Anomalies.plants_fire_equipment_overdue: AnomalyList<PlantAnomaly>` (backend e frontend).

- [ ] **Step 1: Write the failing test** (nel `describe` che usa gli helper `only`/`sqlOf`, in coda)

```ts
    it('impianti con almeno un estintore scaduto (fine mese, controllo +6 mesi)', async () => {
      only('/* plants_fire_equipment_overdue */', [
        { id: '9', code: 'ANT-07', name: 'Antincendio campo', type: 'FIRE_PROTECTION' },
      ]);
      const r = await service.getAnomalies();
      expect(r.plants_fire_equipment_overdue).toEqual({
        count: 1,
        items: [{ id: 9, code: 'ANT-07', name: 'Antincendio campo', type: 'FIRE_PROTECTION' }],
      });
      const sql = sqlOf('/* plants_fire_equipment_overdue */');
      expect(sql).toContain("e.equipment_type = 'EXTINGUISHER'");
      expect(sql).toContain('e.deleted = 0');
      expect(sql).toContain('p.deleted = 0');
      expect(sql).toContain('LAST_DAY(e.revision_due_on) < CURDATE()');
      expect(sql).toContain('INTERVAL 6 MONTH');
    });
```

- [ ] **Step 2: Run to verify it fails**

Run: `docker exec utenzepa-api-1 sh -c "cd /usr/src/app && pnpm exec jest src/apis/anomalies --maxWorkers=2"`
Expected: FAIL.

- [ ] **Step 3: Implement** — in `Anomalies` aggiungere `plants_fire_equipment_overdue: AnomalyList<PlantAnomaly>;`; in fondo alle query di `getAnomalies()` (dopo `functionsWithoutMefType`):

```ts
    // Gemello SQL di fireEquipmentDeadlines (plant.calc.ts): scadenza valida
    // fino a fine mese, controllo semestrale = ultimo controllo + 6 mesi.
    const fireOverdue: { id: unknown; code: string; name: string; type: string }[] =
      await this.dataSource.query(
        `/* plants_fire_equipment_overdue */ SELECT DISTINCT p.id, p.code, p.name, p.type FROM plants p
           JOIN plant_fire_equipment e ON e.plant_id = p.id AND e.deleted = 0
                AND e.equipment_type = 'EXTINGUISHER'
          WHERE p.deleted = 0
            AND (LAST_DAY(e.revision_due_on) < CURDATE()
              OR LAST_DAY(e.test_due_on) < CURDATE()
              OR LAST_DAY(DATE_ADD(e.last_check_on, INTERVAL 6 MONTH)) < CURDATE())
          ORDER BY p.code`,
      );
```

e nel `return`:

```ts
      plants_fire_equipment_overdue: list(
        fireOverdue.map((p) => ({ id: Number(p.id), code: p.code, name: p.name, type: p.type })),
      ),
```

Frontend `anomalies.service.ts`: `plants_fire_equipment_overdue: AnomalyList<{id: number; code: string; name: string; type: string}>;`

- [ ] **Step 4: Run tests** — Expected: PASS (tutto il file anomalie).

- [ ] **Step 5: Commit**

```bash
git add backend/src/apis/anomalies/anomalies.service.ts backend/src/apis/anomalies/anomalies.service.spec.ts frontend/src/app/core/services/anomalies.service.ts
git commit -m "feat(anomalies): impianti con presidi antincendio scaduti"
```

---

### Task 5: Frontend — modello, tab «Presidi», segnalazione, guida, versione

**Files:**
- Modify: `frontend/src/app/pages/plants/plant.model.ts`
- Modify: `frontend/src/app/pages/plants/plant-fire-equipment-tab.component.ts`
- Modify: `frontend/src/app/pages/plants/plants-filters.ts`
- Modify: `frontend/public/guida/guida.md`
- Modify: `publiccode.yml`

**Interfaces:**
- Consumes: campi API (Task 2/3): `quantity`, `last_check_on`, `revision_due_on`, `test_due_on`, `Plant.fire_equipment_status`; anomalia (Task 4).
- Produces (in `plant.model.ts`): `FIRE_EQUIPMENT_PLURAL`, `monthTextToIso`, `isoToMonthText`, `MONTH_TEXT_PATTERN`, `fireEquipmentDeadlinesOf`, `fireEquipmentStatusOf`.

- [ ] **Step 1: Modello** (`plant.model.ts`)

```ts
export type FireEquipmentType = 'EXTINGUISHER' | 'HYDRANT' | 'HOSE_REEL' | 'FIRE_BRIGADE_CONNECTION'
  | 'SMOKE_DETECTOR' | 'ALARM_BUTTON' | 'DETECTION_PANEL' | 'ALARM_SIGNAL' | 'SIREN';

export const FIRE_EQUIPMENT_LABEL: Record<FireEquipmentType, string> = {
  EXTINGUISHER: 'Estintore',
  HYDRANT: 'Idrante',
  HOSE_REEL: 'Naspo',
  FIRE_BRIGADE_CONNECTION: 'Attacco VVF',
  SMOKE_DETECTOR: 'Rivelatore di fumo',
  ALARM_BUTTON: 'Pulsante di allarme',
  DETECTION_PANEL: 'Centrale di rivelazione',
  ALARM_SIGNAL: 'Segnalatore ottico-acustico',
  SIREN: 'Sirena / campana',
};

export const FIRE_EQUIPMENT_PLURAL: Record<FireEquipmentType, [string, string]> = {
  EXTINGUISHER: ['estintore', 'estintori'],
  HYDRANT: ['idrante', 'idranti'],
  HOSE_REEL: ['naspo', 'naspi'],
  FIRE_BRIGADE_CONNECTION: ['attacco VVF', 'attacchi VVF'],
  SMOKE_DETECTOR: ['rivelatore di fumo', 'rivelatori di fumo'],
  ALARM_BUTTON: ['pulsante di allarme', 'pulsanti di allarme'],
  DETECTION_PANEL: ['centrale di rivelazione', 'centrali di rivelazione'],
  ALARM_SIGNAL: ['segnalatore ottico-acustico', 'segnalatori ottico-acustici'],
  SIREN: ['sirena / campana', 'sirene / campane'],
};

// Date dei presidi in mese/anno: 'mm/aaaa' ↔ 'AAAA-MM-01'.
export const MONTH_TEXT_PATTERN = /^(0[1-9]|1[0-2])\/\d{4}$/;
export function monthTextToIso(text: string | null | undefined): string | null {
  const t = text?.trim() ?? '';
  if (!MONTH_TEXT_PATTERN.test(t)) return null;
  const [m, y] = t.split('/');
  return `${y}-${m}-01`;
}
export function isoToMonthText(iso: string | null | undefined): string {
  return iso ? `${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '';
}

const lastDayOfMonth = (iso: string): string => {
  const [y, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
const addMonthsToMonth = (iso: string, months: number): string => {
  const [y, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + months, 1)).toISOString().slice(0, 10);
};

// Gemello di fireEquipmentDeadlines (backend plant.calc.ts): tenere allineati.
export function fireEquipmentDeadlinesOf(e: PlantFireEquipment): {kind: string; due: string}[] {
  if (e.equipment_type !== 'EXTINGUISHER') return [];
  const out: {kind: string; due: string}[] = [];
  if (e.last_check_on) out.push({kind: 'Controllo', due: lastDayOfMonth(addMonthsToMonth(e.last_check_on, 6))});
  if (e.revision_due_on) out.push({kind: 'Revisione', due: lastDayOfMonth(e.revision_due_on)});
  if (e.test_due_on) out.push({kind: 'Collaudo', due: lastDayOfMonth(e.test_due_on)});
  return out;
}

export function fireEquipmentStatusOf(e: PlantFireEquipment, today = todayIso()): {status: InspectionStatus; reason: string} | null {
  if (e.equipment_type !== 'EXTINGUISHER') return null;
  const order: InspectionStatus[] = ['OVERDUE', 'DUE_SOON', 'OK'];
  const items = fireEquipmentDeadlinesOf(e).map(d => ({...d, status: inspectionStatusOf(d.due, today)}));
  if (items.length === 0) return {status: 'NO_DATE', reason: 'Nessuna scadenza indicata'};
  items.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  const w = items[0];
  return {status: w.status, reason: `${w.kind}: scadenza ${isoToMonthText(w.due)}`};
}
```

(`todayIso` e `inspectionStatusOf` sono già nel file: inserire le funzioni dopo `inspectionStatusOf`.)

`PlantFireEquipment`: aggiungere `quantity: number; last_check_on: string | null; revision_due_on: string | null; test_due_on: string | null;`. Interfaccia `Plant`: `fire_equipment_status: InspectionStatus | null;` accanto a `inspection_status`.

- [ ] **Step 2: Tab «Presidi»** (`plant-fire-equipment-tab.component.ts`)

Form group:

```ts
  form = this.fb.group({
    equipment_type: ['EXTINGUISHER' as FireEquipmentType, Validators.required],
    quantity: [1, [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)]],
    serial_number: [''],
    agent: [''],
    capacity: [''],
    location: [''],
    last_check_on: ['', Validators.pattern(MONTH_TEXT_PATTERN)],
    revision_due_on: ['', Validators.pattern(MONTH_TEXT_PATTERN)],
    test_due_on: ['', Validators.pattern(MONTH_TEXT_PATTERN)],
    notes: [''],
  });

  get isExtinguisher(): boolean {
    return this.form.controls.equipment_type.value === 'EXTINGUISHER';
  }
```

Template del form (sostituisce le due righe di campi esistenti): prima riga Tipo + **Quantità** (`<input matInput type="number" min="1" formControlName="quantity">`, `mat-label` «Quantità»); se `isExtinguisher` matricola, agente, capacità; seconda riga ubicazione; se `isExtinguisher` terza riga con i tre campi (`mat-label` «Ultimo controllo», «Scadenza revisione», «Scadenza collaudo», `placeholder="mm/aaaa"`, `<mat-error>Formato mm/aaaa</mat-error>`); note.

Tabella: colonne nell'ordine Tipo, Q.tà, Matricola, Agente, Capacità, Ubicazione, Controllo (`isoToMonthText(r.last_check_on)`), Revisione, Collaudo, Stato, Note, azioni. Stato: per gli estintori un pallino

```html
@if (statusOf(r); as s) {
  <span [matTooltip]="statusLabel[s.status] + ' — ' + s.reason"
        [style.background]="badge(s.status).bg" [style.color]="badge(s.status).fg"
        style="display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 0.75rem;">
    {{ statusLabel[s.status] }}
  </span>
}
```

con, nel componente:

```ts
  readonly statusLabel = INSPECTION_LABEL;
  statusOf(r: PlantFireEquipment) { return fireEquipmentStatusOf(r); }
  badge(s: InspectionStatus) { return inspectionBadge(s); }
```

(verificare in `plant.model.ts` i nomi dei campi di `Badge` restituiti da `inspectionBadge` — `bg`/`fg` o simili — e usare quelli). `min-width` della tabella: `1000px`.

`totals()`: sommare le quantità con `FIRE_EQUIPMENT_PLURAL`:

```ts
  totals(): string {
    return this.types
      .map(t => ({t, n: this.rows.filter(r => r.equipment_type === t).reduce((s, r) => s + (r.quantity ?? 1), 0)}))
      .filter(x => x.n > 0)
      .map(x => `${x.n} ${FIRE_EQUIPMENT_PLURAL[x.t][x.n === 1 ? 0 : 1]}`)
      .join(' · ');
  }
```

`startEdit`: valorizzare `quantity: r?.quantity ?? 1` e le tre date con `isoToMonthText`. `save`: `markAllAsTouched()` se invalido (pallino rosso non serve: un solo form); payload con `quantity: Number(v.quantity)`, date `this.isExtinguisher ? monthTextToIso(v.x) : null`; per i non estintori `serial_number/agent/capacity` → `null`.

- [ ] **Step 3: Segnalazione** (`plants-filters.ts`)

```ts
export const PLANT_SIGNALS: SignalDef[] = [
  {key: 'plants_without_position', label: 'Senza posizione'},
  {key: 'plants_without_asset', label: 'Senza immobile'},
  {key: 'plants_fire_equipment_overdue', label: 'Presidi scaduti'},
];
```

- [ ] **Step 4: Guida e versione**

`guida.md`: data in testa `_Ultimo aggiornamento: 2026-10-13_` (già così: lasciare); nuova sezione prima di «### Allegare un file a un immobile, impianto o contratto»:

```markdown
### Registrare i presidi di un impianto antincendio

Nella scheda di un impianto antincendio il tab **Presidi** elenca estintori, idranti, naspi, attacchi VVF e i dispositivi di rivelazione e allarme (rivelatori di fumo, pulsanti di allarme, centrali di rivelazione, segnalatori ottico-acustici, sirene).

1. Premi **Aggiungi presidio** e scegli il tipo.
2. **Quantità**: per rivelatori, pulsanti e simili basta una riga con il numero di pezzi; gli estintori si registrano uno per riga, con la matricola.
3. Per gli estintori indica in formato `mm/aaaa`, come sul cartellino, **Ultimo controllo** (semestrale), **Scadenza revisione** e **Scadenza collaudo**. Una scadenza vale fino all'ultimo giorno del mese; il controllo scade sei mesi dopo l'ultimo.
4. Il pallino di stato mostra la scadenza messa peggio: **Scaduto**, **Entro 60 giorni**, **In regola**, **Senza data**. Le date importate dai censimenti riportano solo l'anno (nota «date importate: solo anno»).
```

Tabella «Segnalazioni per elenco», riga Impianti: `| Impianti | Senza posizione · Senza immobile · Presidi scaduti (almeno un estintore con una scadenza superata) |`.

`publiccode.yml`: `softwareVersion: "v1.24.0"`, `releaseDate: "2026-10-13"`.

- [ ] **Step 5: Build**

Run: `docker exec utenzepa-frontend-1 sh -c "cd /app && pnpm run build 2>&1 | tail -15"`
Expected: build ok (gli avvisi di budget/CommonJS esistono già), nessun `✘`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/pages/plants/plant.model.ts frontend/src/app/pages/plants/plant-fire-equipment-tab.component.ts frontend/src/app/pages/plants/plants-filters.ts frontend/public/guida/guida.md publiccode.yml
git commit -m "feat(plants): tab Presidi con nuovi tipi, quantità e scadenze; segnalazione Presidi scaduti (v1.24.0)"
```

---

### Task 6: Verifica reale e PR

**Files:** nessuno nuovo (solo eventuali correzioni).

- [ ] **Step 1: Test backend completi dei file toccati**

Run: `docker exec utenzepa-api-1 sh -c "cd /usr/src/app && pnpm exec jest src/apis/plants src/apis/anomalies src/database/fire-equipment-details.migration.spec.ts --maxWorkers=2 && pnpm run type-check"`
Expected: PASS, nessun errore di tipi.

- [ ] **Step 2: Playwright** (utente Admin temporaneo come da `docs/claude/testing-e2e.md`, eliminato alla fine con i suoi `audit_logs`)

1. `/plants?selectedId=<id di ANT-07>`, tab **Presidi**: estintori con colonne Controllo/Revisione/Collaudo valorizzate (`01/2017`…), pallino «Scaduto», totali.
2. Aggiungi presidio «Rivelatore di fumo», quantità 8 → i campi data non compaiono; totale «… · 8 rivelatori di fumo».
3. Modifica un estintore: scadenza revisione `13/2020` → errore «Formato mm/aaaa», Salva non invia; `10/2026` → «Entro 60 giorni».
4. Elenco impianti → Segnalazioni → «Presidi scaduti» filtra gli impianti antincendio.
5. Ripristinare i dati toccati (eliminare il rivelatore di prova, rimettere la data originale), eliminare l'utente.

Screenshot solo in `.playwright-mcp/`.

- [ ] **Step 3: Push e PR**

```bash
git push -u origin feat/presidi-antincendio
gh pr create --base main --title "feat(plants): presidi antincendio — nuovi tipi, quantità, scadenze degli estintori (v1.24.0)" --body-file <corpo con: cosa cambia, migration e conversione note, verifica (test, giro up/down/up, Playwright), note di rilascio>
```

Merge e tag solo su ok dell'utente.

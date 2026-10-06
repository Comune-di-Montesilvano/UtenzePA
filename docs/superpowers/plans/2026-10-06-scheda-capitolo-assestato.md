# Scheda capitolo e assestato — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** il capitolo di spesa diventa una scheda come le altre, con stanziamento iniziale, assestato, impegnato, fatturato e disponibile per esercizio, segnalazioni di sforamento e avviso sulla fattura.

**Architecture:** i dati della ragioneria per anno restano sulla riga `budget_chapter_spending` (due colonne nuove, `amount` facoltativo). Tutto il resto è calcolato: un modulo puro `apis/spending/chapter-year.ts` unisce riga di bilancio, impegni e fatturato in un `ChapterYear`, usato da spesa (scheda, elenco, avviso fattura) e anomalie. Il frontend sostituisce il dialog del capitolo con una scheda `entity-sheet`.

**Tech Stack:** NestJS 11 + TypeORM (MySQL 8), jest; Angular 22 + Angular Material.

**Spec:** `docs/superpowers/specs/2026-10-06-scheda-capitolo-assestato-design.md`

## Global Constraints

- Comandi Docker uno alla volta, mai in parallelo; jest sempre `--maxWorkers=2`, dentro il container: `docker exec utenzepa-api-1 pnpm exec jest <file> --maxWorkers=2`.
- Migration scritta prima in scratch, spostata in `backend/src/database/migrations/` solo a contenuto definitivo (il watcher la esegue appena la vede).
- Date `date` come giorno locale `'AAAA-MM-GG'` (`@DateOnly()` nei DTO).
- Frontend: verifica = compilazione `ng serve` (`docker logs --since 60s utenzepa-frontend-1 2>&1 | grep -E "✘|generation"`) + E2E Playwright; nessun test unitario frontend.
- Testi UI in italiano; nessun dato personale reale in codice, test o commit.
- Toast: `ToastService.add({key: 'global', severity, summary, detail})`.
- Mai `git add -A`/`git add .`: elencare i file.
- Ruoli: modifica solo Admin/Operatore (`isEditorRole`), Lettore in sola lettura.
- Release: v1.14.0 (`publiccode.yml`).

## Review Focus

1. **Capitolo con impegni senza importo (oggi tutti):** l'impegnato vale 0 e il disponibile non deve sembrare un dato certo → la riga mostra "N senza importo" (test in Task 2 su `commitments_without_amount`).
2. **Riga di bilancio con solo l'assestato (nessuna spesa ragioneria):** deve salvarsi e la vecchia colonna "Variazione %" non deve rompersi su `amount` nullo → test in Task 1 (`findByChapter` con `amount: null`).
3. **Fattura modificata che era già sul capitolo:** l'avviso non deve contare due volte le sue righe → test in Task 3 (`i.id <> ?` con l'id della fattura).
4. **Riga fattura senza utenza né impegno, o utenza senza capitolo:** nessun capitolo, nessun avviso, nessun errore → test in Task 3.
5. **Capitolo cancellato con dati nell'esercizio:** non deve comparire tra le anomalie → test in Task 4 (`deleted = 0` nelle query delle anomalie).

---

### Task 1: Riga di bilancio per anno (assestato, stanziamento iniziale, spesa facoltativa)

**Files:**
- Modify: `backend/src/apis/budget-chapter-spending/entity/budget-chapter-spending.entity.ts`
- Modify: `backend/src/apis/budget-chapter-spending/dto/create-budget-chapter-spending.dto.ts`
- Modify: `backend/src/apis/budget-chapter-spending/dto/update-budget-chapter-spending.dto.ts`
- Modify: `backend/src/apis/budget-chapter-spending/budget-chapter-spending.service.ts`
- Test: `backend/src/apis/budget-chapter-spending/budget-chapter-spending.service.spec.ts`
- Create: `backend/src/database/migrations/1793300000000-ChapterBudget.ts`

**Interfaces:**
- Produces: colonne `budget_chapter_spending.initial_budget`, `.adjusted_budget` (decimal(14,2) NULL), `.amount` NULL; DTO con `initial_budget?`, `adjusted_budget?`, `amount?` (number | null).

- [ ] **Step 1: test che falliscono** — in fondo al `describe` di `budget-chapter-spending.service.spec.ts`:

```ts
  it('crea un anno con il solo assestato', async () => {
    await service.createForChapter(5, { year: 2026, adjusted_budget: 28000 } as never, 3);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ budget_chapter_id_fk: 5, year: 2026, adjusted_budget: 28000 }),
    );
  });

  it('rifiuta un anno senza nessun importo', async () => {
    await expect(service.createForChapter(5, { year: 2026, notes: 'x' } as never, 3)).rejects.toThrow(
      'Indicare almeno un importo: stanziamento iniziale, assestato o spesa ragioneria.',
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rifiuta una modifica che svuota tutti gli importi', async () => {
    repo.findOne.mockResolvedValue({ id: 1, budget_chapter_id_fk: 5, year: 2026, amount: null, adjusted_budget: '100.00' });
    await expect(service.update(1, { adjusted_budget: null } as never, 3)).rejects.toThrow(/almeno un importo/);
  });

  it('elenco: importi nulli restano null, gli altri diventano numeri', async () => {
    repo.find.mockResolvedValue([
      { id: 1, year: 2026, amount: null, initial_budget: '30000.00', adjusted_budget: '28000.00' },
    ]);
    const [row] = await service.findByChapter(5);
    expect(row.amount).toBeNull();
    expect(row.initial_budget).toBe(30000);
    expect(row.adjusted_budget).toBe(28000);
  });
```

- [ ] **Step 2: eseguire e vederli fallire**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/budget-chapter-spending --maxWorkers=2`
Expected: FAIL (4 test nuovi).

- [ ] **Step 3: implementazione**

Entity, al posto della colonna `amount`:

```ts
  // Spesa consuntiva della ragioneria ("Spesa ragioneria"): facoltativa.
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  amount: number | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  initial_budget: number | null;

  // Assestato dell'esercizio.
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  adjusted_budget: number | null;
```

Commento della classe: "Dati della ragioneria per capitolo/anno: stanziamento iniziale, assestato, spesa consuntiva (almeno uno). Un solo record per capitolo/anno tra le righe non cancellate: verificato nel service."

DTO create e update: i tre importi uguali (sostituiscono `amount` obbligatorio):

```ts
  // Vuoto = non indicato (null).
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value === null || value === undefined ? value : Number(value)))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number | null;
```

(stesso blocco per `initial_budget` e `adjusted_budget`; import `Transform` da `class-transformer`).

Service:

```ts
const AMOUNTS = ['initial_budget', 'adjusted_budget', 'amount'] as const;
const toNumber = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

  async findByChapter(chapterId: number): Promise<BudgetChapterSpending[]> {
    const rows = await this.repo.find({ where: { budget_chapter_id_fk: chapterId, deleted: false } });
    return rows
      .map((r) => ({
        ...r,
        amount: toNumber(r.amount),
        initial_budget: toNumber(r.initial_budget),
        adjusted_budget: toNumber(r.adjusted_budget),
      }))
      .sort((a, b) => b.year - a.year);
  }

  private assertSomeAmount(values: Partial<Record<(typeof AMOUNTS)[number], unknown>>): void {
    if (AMOUNTS.every((k) => values[k] === null || values[k] === undefined)) {
      throw new BadRequestException('Indicare almeno un importo: stanziamento iniziale, assestato o spesa ragioneria.');
    }
  }
```

In `createForChapter`, dopo il controllo del capitolo: `this.assertSomeAmount(dto);`. In `update`, dopo aver letto `current`: `this.assertSomeAmount({ ...current, ...dto });`.

- [ ] **Step 4: test verdi**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/budget-chapter-spending --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: migration** — confrontare prima con l'output grezzo (`migration:generate` verso `/tmp/ChapterBudget`, vedi CLAUDE.md) e tenere solo gli statement di `budget_chapter_spending`. Scriverla nello scratchpad, poi spostarla:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

// Assestato e stanziamento iniziale per capitolo/anno sulla riga della spesa
// storica; la spesa ragioneria diventa facoltativa (almeno un importo, nel service).
export class ChapterBudget1793300000000 implements MigrationInterface {
  name = 'ChapterBudget1793300000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `budget_chapter_spending` ADD `initial_budget` decimal(14,2) NULL');
    await q.query('ALTER TABLE `budget_chapter_spending` ADD `adjusted_budget` decimal(14,2) NULL');
    await q.query('ALTER TABLE `budget_chapter_spending` MODIFY `amount` decimal(14,2) NULL');
  }

  public async down(q: QueryRunner): Promise<void> {
    const [{ n }]: { n: number | string }[] = await q.query(
      'SELECT COUNT(*) AS n FROM `budget_chapter_spending` WHERE `amount` IS NULL',
    );
    if (Number(n) > 0) {
      throw new Error(`budget_chapter_spending: ${Number(n)} righe senza spesa ragioneria. Completarle o eliminarle prima del down.`);
    }
    await q.query('ALTER TABLE `budget_chapter_spending` MODIFY `amount` decimal(14,2) NOT NULL');
    await q.query('ALTER TABLE `budget_chapter_spending` DROP COLUMN `adjusted_budget`');
    await q.query('ALTER TABLE `budget_chapter_spending` DROP COLUMN `initial_budget`');
  }
}
```

- [ ] **Step 6: ciclo up → down → up** con fotografia dei dati:

```bash
PW=$(grep '^MYSQL_PASSWORD=' .env | cut -d= -f2-)
docker exec utenzepa-mysql-1 mysql -uroot -p"$PW" mydatabase -e "SELECT id, budget_chapter_id_fk, year, amount, notes FROM budget_chapter_spending ORDER BY id" > <scratch>/bcs_before.tsv
# migration:run, migration:revert, migration:run (CLI typeorm nel container), poi la stessa SELECT in bcs_after.tsv
diff <scratch>/bcs_before.tsv <scratch>/bcs_after.tsv   # atteso: nessuna differenza
```

e `schema:log`: nessuno statement su `budget_chapter_spending`.

- [ ] **Step 7: commit**

```bash
git add backend/src/apis/budget-chapter-spending backend/src/database/migrations/1793300000000-ChapterBudget.ts
git commit -m "feat(api): assestato e stanziamento iniziale per capitolo e anno"
```

---

### Task 2: Calcolo per esercizio e dati della scheda capitolo (backend)

**Files:**
- Create: `backend/src/apis/spending/chapter-year.ts`
- Create: `backend/src/apis/spending/chapter-year.spec.ts`
- Modify: `backend/src/apis/spending/spending.service.ts`
- Modify: `backend/src/apis/spending/spending.service.spec.ts`
- Modify: `backend/src/apis/spending/spending.controller.ts`
- Modify: `backend/src/apis/budget-chapters/budget-chapters.controller.ts`
- Modify: `backend/src/apis/budget-chapters/budget-chapters.service.spec.ts`

**Interfaces:**
- Consumes: colonne del Task 1.
- Produces (usati da Task 3, 4, 5–8):

```ts
// apis/spending/chapter-year.ts
export type Query = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;
export const LINE_YEAR: string;      // 'COALESCE(bcm.fiscal_year, YEAR(i.invoice_date))'
export const LINE_CHAPTER: string;   // 'COALESCE(bcm.budget_chapter_id_fk, u.budget_chapter_code_fk)'
export const CHAPTER_LINES: string;  // FROM invoice_lines + invoices + commitments + utilities
export interface ChapterYear {
  year: number; spending_id: number | null; initial_budget: number | null; adjusted_budget: number | null;
  recorded_spending: number | null; notes: string | null; committed: number; commitments: number;
  commitments_without_amount: number; invoiced: number; invoices: number; available: number | null; over_budget: boolean;
}
export interface ChapterYearSummary extends ChapterYear { budget_chapter_id: number }
export const currentYear: () => number;
export function buildChapterYear(year: number, budget?: Record<string, unknown>, commitments?: Record<string, unknown>, invoiced?: Record<string, unknown>): ChapterYear;
export function mergeChapterYears(budget: Record<string, unknown>[], commitments: Record<string, unknown>[], invoiced: Record<string, unknown>[], current: number): ChapterYear[];
export function chaptersYearSummary(query: Query, year: number): Promise<ChapterYearSummary[]>;
// SpendingService
forChapter(chapterId: number): Promise<ChapterYear[]>;
chapterCommitments(chapterId: number): Promise<ChapterCommitment[]>;
chapterInvoiceLines(chapterId: number): Promise<ChapterInvoiceLine[]>;
chaptersYear(year: number): Promise<ChapterYearSummary[]>;
// HTTP
GET /budget-chapters/:id               → BudgetChapter (con utilityTypes)
GET /budget-chapters/:id/years         → ChapterYear[]
GET /budget-chapters/:id/commitments   → ChapterCommitment[]
GET /budget-chapters/:id/invoice-lines → ChapterInvoiceLine[]
GET /spending/chapters?year=2026       → ChapterYearSummary[]
```

```ts
export interface ChapterCommitment {
  id: number; contract_id: number; fiscal_year: number; commitment_number: string | null;
  amount: number | null; cig_contract: string | null; supplier: string | null;
}
export interface ChapterInvoiceLine {
  id: number; invoice_id: number; number: string; invoice_date: string; supplier: string | null;
  utility_id: number | null; utility_code: string | null; year: number; amount: number;
}
```

- [ ] **Step 1: test del modulo puro** — `chapter-year.spec.ts`:

```ts
import { buildChapterYear, chaptersYearSummary, mergeChapterYears } from './chapter-year';

describe('chapter-year', () => {
  it('anno completo: disponibile = assestato − impegnato, numeri convertiti', () => {
    const y = buildChapterYear(
      2026,
      { id: 7, initial_budget: '30000.00', adjusted_budget: '28000.00', amount: null, notes: null },
      { commitments: '2', total: '26076.68', without_amount: '0' },
      { total: '21120.80', invoices: '12' },
    );
    expect(y).toEqual({
      year: 2026, spending_id: 7, initial_budget: 30000, adjusted_budget: 28000, recorded_spending: null,
      notes: null, committed: 26076.68, commitments: 2, commitments_without_amount: 0,
      invoiced: 21120.8, invoices: 12, available: 1923.32, over_budget: false,
    });
  });

  it('impegni senza importo: impegnato 0 e conteggio di quelli senza importo', () => {
    const y = buildChapterYear(2026, undefined, { commitments: '2', total: null, without_amount: '2' }, undefined);
    expect(y).toEqual(expect.objectContaining({ committed: 0, commitments: 2, commitments_without_amount: 2, available: null }));
  });

  it('oltre l’assestato se impegnato o fatturato lo superano', () => {
    expect(buildChapterYear(2026, { adjusted_budget: '100' }, { total: '150' }, undefined).over_budget).toBe(true);
    expect(buildChapterYear(2026, { adjusted_budget: '100' }, undefined, { total: '100.01' }).over_budget).toBe(true);
    expect(buildChapterYear(2026, { adjusted_budget: '100' }, { total: '100' }, { total: '100' }).over_budget).toBe(false);
    expect(buildChapterYear(2026, undefined, { total: '999' }, undefined).over_budget).toBe(false);
  });

  it('unione per anno: tutti gli anni presenti più l’esercizio in corso, dal più recente', () => {
    const rows = mergeChapterYears(
      [{ id: 1, year: 2023, amount: '10' }],
      [{ year: 2025, commitments: '1', total: null, without_amount: '1' }],
      [{ year: '2024', total: '5', invoices: '1' }],
      2026,
    );
    expect(rows.map((r) => r.year)).toEqual([2026, 2025, 2024, 2023]);
    expect(rows[3].recorded_spending).toBe(10);
  });

  it('riepilogo dell’esercizio per capitolo: tre query sull’anno, unione per capitolo', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ chapter_id: 4, id: 9, adjusted_budget: '50' }])
      .mockResolvedValueOnce([{ chapter_id: 6, commitments: '1', total: '10', without_amount: '0' }])
      .mockResolvedValueOnce([{ chapter_id: 4, total: '60', invoices: '2' }]);
    const rows = await chaptersYearSummary(query, 2026);
    expect(rows.map((r) => [r.budget_chapter_id, r.over_budget])).toEqual([[4, true], [6, false]]);
    expect(query.mock.calls.every(([, params]) => (params as unknown[])[0] === 2026)).toBe(true);
    expect(query.mock.calls[0][0]).toContain('deleted = 0');
    expect(query.mock.calls[1][0]).toContain('deleted = 0');
    expect(query.mock.calls[2][0]).toContain('i.deleted = 0');
  });
});
```

- [ ] **Step 2: test del service** — in `spending.service.spec.ts`:

```ts
  it('scheda capitolo: anni da bilancio, impegni e fatture del capitolo (capitolo dall’impegno o dall’utenza)', async () => {
    query
      .mockResolvedValueOnce([{ id: 1, year: 2024, amount: '100', initial_budget: null, adjusted_budget: null, notes: null }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const rows = await service.forChapter(5);
    expect(rows.map((r) => r.year)).toEqual([new Date().getFullYear(), 2024]);
    const linesSql = String(query.mock.calls[2][0]);
    expect(linesSql).toContain('COALESCE(bcm.budget_chapter_id_fk, u.budget_chapter_code_fk) = ?');
    expect(linesSql).toContain('COALESCE(bcm.fiscal_year, YEAR(i.invoice_date))');
    expect(query.mock.calls.every(([, p]) => (p as unknown[])[0] === 5)).toBe(true);
  });

  it('impegni del capitolo con contratto e fornitore, esclusi impegni e contratti cancellati', async () => {
    query.mockResolvedValue([
      { id: 3, contract_id: 10, fiscal_year: 2026, commitment_number: null, amount: null, cig_contract: 'X', supplier: 'Fornitore prova' },
    ]);
    expect(await service.chapterCommitments(5)).toEqual([
      { id: 3, contract_id: 10, fiscal_year: 2026, commitment_number: null, amount: null, cig_contract: 'X', supplier: 'Fornitore prova' },
    ]);
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain('bcm.deleted = 0');
    expect(sql).toContain('c.deleted = 0');
  });

  it('righe fattura del capitolo, importi numerici', async () => {
    query.mockResolvedValue([
      { id: 1, invoice_id: 2, number: 'F-1', invoice_date: '2026-03-01', supplier: null, utility_id: 4, utility_code: 'U4', year: '2026', amount: '12.50' },
    ]);
    const [line] = await service.chapterInvoiceLines(5);
    expect(line).toEqual(expect.objectContaining({ year: 2026, amount: 12.5, invoice_id: 2 }));
  });
```

e in `budget-chapters.service.spec.ts` niente di nuovo (il `GET :id` riusa `findOne`, già testato).

- [ ] **Step 3: vederli fallire**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/spending --maxWorkers=2`
Expected: FAIL (modulo `chapter-year` mancante, metodi mancanti).

- [ ] **Step 4: implementazione** — `chapter-year.ts`:

```ts
// Esercizio di un capitolo: dati della ragioneria (budget_chapter_spending) +
// impegni + fatturato, sempre calcolati. Condiviso da spesa e anomalie.
export type Query = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

// Riga fattura: esercizio e capitolo dall'impegno, altrimenti anno della
// fattura e capitolo dell'utenza (stesse regole di apis/spending).
export const LINE_YEAR = 'COALESCE(bcm.fiscal_year, YEAR(i.invoice_date))';
export const LINE_CHAPTER = 'COALESCE(bcm.budget_chapter_id_fk, u.budget_chapter_code_fk)';
export const CHAPTER_LINES = `FROM invoice_lines il
  JOIN invoices i ON i.id = il.invoice_id_fk AND i.deleted = 0
  LEFT JOIN budget_commitments bcm ON bcm.id = il.commitment_id_fk
  LEFT JOIN utilities u ON u.id = il.utility_id_fk`;

export interface ChapterYear {
  year: number;
  spending_id: number | null;
  initial_budget: number | null;
  adjusted_budget: number | null;
  recorded_spending: number | null;
  notes: string | null;
  committed: number;
  commitments: number;
  commitments_without_amount: number;
  invoiced: number;
  invoices: number;
  available: number | null;
  over_budget: boolean;
}

export interface ChapterYearSummary extends ChapterYear {
  budget_chapter_id: number;
}

export const currentYear = (): number => new Date().getFullYear();

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const round2 = (n: number): number => Math.round(n * 100) / 100;

export function buildChapterYear(
  year: number,
  budget?: Record<string, unknown>,
  commitments?: Record<string, unknown>,
  invoiced?: Record<string, unknown>,
): ChapterYear {
  const adjusted = num(budget?.adjusted_budget);
  const committed = round2(Number(commitments?.total ?? 0));
  const inv = round2(Number(invoiced?.total ?? 0));
  return {
    year,
    spending_id: num(budget?.id),
    initial_budget: num(budget?.initial_budget),
    adjusted_budget: adjusted,
    recorded_spending: num(budget?.amount),
    notes: (budget?.notes as string | null | undefined) ?? null,
    committed,
    commitments: Number(commitments?.commitments ?? 0),
    commitments_without_amount: Number(commitments?.without_amount ?? 0),
    invoiced: inv,
    invoices: Number(invoiced?.invoices ?? 0),
    available: adjusted === null ? null : round2(adjusted - committed),
    over_budget: adjusted !== null && (committed > adjusted || inv > adjusted),
  };
}

const byKey = (rows: Record<string, unknown>[], key: string) =>
  new Map(rows.map((r) => [Number(r[key]), r] as const));

export function mergeChapterYears(
  budget: Record<string, unknown>[],
  commitments: Record<string, unknown>[],
  invoiced: Record<string, unknown>[],
  current: number,
): ChapterYear[] {
  const b = byKey(budget, 'year');
  const c = byKey(commitments, 'year');
  const i = byKey(invoiced, 'year');
  const years = new Set([...b.keys(), ...c.keys(), ...i.keys(), current]);
  return [...years].sort((x, y) => y - x).map((y) => buildChapterYear(y, b.get(y), c.get(y), i.get(y)));
}

// Tutti i capitoli con dati nell'esercizio (elenco capitoli, anomalie).
export async function chaptersYearSummary(query: Query, year: number): Promise<ChapterYearSummary[]> {
  const budget = await query(
    `SELECT budget_chapter_id_fk AS chapter_id, id, initial_budget, adjusted_budget, amount, notes
     FROM budget_chapter_spending WHERE year = ? AND deleted = 0`,
    [year],
  );
  const commitments = await query(
    `SELECT budget_chapter_id_fk AS chapter_id, COUNT(*) AS commitments, SUM(amount) AS total,
            SUM(amount IS NULL) AS without_amount
     FROM budget_commitments WHERE fiscal_year = ? AND deleted = 0
     GROUP BY budget_chapter_id_fk`,
    [year],
  );
  const invoiced = await query(
    `SELECT ${LINE_CHAPTER} AS chapter_id, SUM(il.amount) AS total, COUNT(DISTINCT i.id) AS invoices
     ${CHAPTER_LINES}
     WHERE ${LINE_YEAR} = ? AND ${LINE_CHAPTER} IS NOT NULL
     GROUP BY chapter_id`,
    [year],
  );
  const b = byKey(budget, 'chapter_id');
  const c = byKey(commitments, 'chapter_id');
  const i = byKey(invoiced, 'chapter_id');
  const ids = [...new Set([...b.keys(), ...c.keys(), ...i.keys()])].sort((x, y) => x - y);
  return ids.map((id) => ({ budget_chapter_id: id, ...buildChapterYear(year, b.get(id), c.get(id), i.get(id)) }));
}
```

`spending.service.ts`: import da `./chapter-year` e da `@apis/third-parties/third-party.name` (`partyNameSql`); interfacce `ChapterCommitment`, `ChapterInvoiceLine` esportate (vedi Interfaces); metodi:

```ts
  private q: Query = (sql, params) => this.dataSource.query(sql, params);

  async forChapter(chapterId: number): Promise<ChapterYear[]> {
    const budget = await this.q(
      `SELECT id, year, initial_budget, adjusted_budget, amount, notes
       FROM budget_chapter_spending WHERE budget_chapter_id_fk = ? AND deleted = 0`,
      [chapterId],
    );
    const commitments = await this.q(
      `SELECT fiscal_year AS year, COUNT(*) AS commitments, SUM(amount) AS total, SUM(amount IS NULL) AS without_amount
       FROM budget_commitments WHERE budget_chapter_id_fk = ? AND deleted = 0 GROUP BY fiscal_year`,
      [chapterId],
    );
    const invoiced = await this.q(
      `SELECT ${LINE_YEAR} AS year, SUM(il.amount) AS total, COUNT(DISTINCT i.id) AS invoices
       ${CHAPTER_LINES} WHERE ${LINE_CHAPTER} = ? GROUP BY year`,
      [chapterId],
    );
    return mergeChapterYears(budget, commitments, invoiced, currentYear());
  }

  async chapterCommitments(chapterId: number): Promise<ChapterCommitment[]> {
    const rows = await this.q(
      `SELECT bcm.id, bcm.contract_id_fk AS contract_id, bcm.fiscal_year, bcm.commitment_number, bcm.amount,
              c.cig_contract, ${partyNameSql('s')} AS supplier
       FROM budget_commitments bcm
       JOIN contracts c ON c.id = bcm.contract_id_fk AND c.deleted = 0
       LEFT JOIN third_parties s ON s.id = c.supplier_id_fk
       WHERE bcm.budget_chapter_id_fk = ? AND bcm.deleted = 0
       ORDER BY bcm.fiscal_year DESC, supplier`,
      [chapterId],
    );
    return rows.map((r) => ({
      id: Number(r.id),
      contract_id: Number(r.contract_id),
      fiscal_year: Number(r.fiscal_year),
      commitment_number: (r.commitment_number as string) ?? null,
      amount: r.amount == null ? null : Number(r.amount),
      cig_contract: (r.cig_contract as string) ?? null,
      supplier: (r.supplier as string) ?? null,
    }));
  }

  async chapterInvoiceLines(chapterId: number): Promise<ChapterInvoiceLine[]> {
    const rows = await this.q(
      `SELECT il.id, i.id AS invoice_id, i.invoice_id AS number, DATE_FORMAT(i.invoice_date, '%Y-%m-%d') AS invoice_date,
              ${partyNameSql('s')} AS supplier, u.id AS utility_id, u.utility_id AS utility_code,
              ${LINE_YEAR} AS year, il.amount
       ${CHAPTER_LINES}
       LEFT JOIN third_parties s ON s.id = i.supplier_id_fk
       WHERE ${LINE_CHAPTER} = ?
       ORDER BY i.invoice_date DESC, i.id DESC, il.id`,
      [chapterId],
    );
    return rows.map((r) => ({
      id: Number(r.id),
      invoice_id: Number(r.invoice_id),
      number: String(r.number),
      invoice_date: String(r.invoice_date),
      supplier: (r.supplier as string) ?? null,
      utility_id: r.utility_id == null ? null : Number(r.utility_id),
      utility_code: (r.utility_code as string) ?? null,
      year: Number(r.year),
      amount: Number(r.amount),
    }));
  }

  chaptersYear(year: number): Promise<ChapterYearSummary[]> {
    return chaptersYearSummary(this.q, year);
  }
```

`spending.controller.ts` (aggiungere `Query` agli import di `@nestjs/common`, evitando collisione col tipo `Query` di `chapter-year`: importare quest'ultimo solo nel service):

```ts
  @Get('budget-chapters/:id/years')
  chapterYears(@Param('id', ParseIntPipe) id: number): Promise<ChapterYear[]> {
    return this.service.forChapter(id);
  }

  @Get('budget-chapters/:id/commitments')
  chapterCommitments(@Param('id', ParseIntPipe) id: number): Promise<ChapterCommitment[]> {
    return this.service.chapterCommitments(id);
  }

  @Get('budget-chapters/:id/invoice-lines')
  chapterLines(@Param('id', ParseIntPipe) id: number): Promise<ChapterInvoiceLine[]> {
    return this.service.chapterInvoiceLines(id);
  }

  @Get('spending/chapters')
  chaptersYear(@Query('year', ParseIntPipe) year: number): Promise<ChapterYearSummary[]> {
    return this.service.chaptersYear(year);
  }
```

`budget-chapters.controller.ts`, dopo `getAll` (prima di `:id/consumption-summary` non serve: path diversi):

```ts
  @Get(':id')
  async getOne(@Param('id', ParseIntPipe) id: number): Promise<BudgetChapter> {
    const chapter = await this.service.findOne(id);
    if (!chapter) throw new BadRequestException('Capitolo non trovato');
    return chapter;
  }
```

(`BadRequestException` da `@nestjs/common`: il proxy di produzione non gestisce bene altri codici, vedi memoria "Niente HTTP 409").

- [ ] **Step 5: test verdi + chiamata reale**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/spending src/apis/budget-chapters --maxWorkers=2`
Expected: PASS.
Poi login API (CLAUDE.md, utente temporaneo) e `curl` su `GET /api/v1/budget-chapters/230/years` e `GET /api/v1/spending/chapters?year=2026` (dal Bash tool con `dangerouslyDisableSandbox`): JSON con numeri, nessun 500. Utente temporaneo eliminato.

- [ ] **Step 6: commit**

```bash
git add backend/src/apis/spending backend/src/apis/budget-chapters/budget-chapters.controller.ts
git commit -m "feat(api): esercizi, impegni e fatture del capitolo"
```

---

### Task 3: Avviso di sforamento per la fattura (backend)

**Files:**
- Create: `backend/src/apis/spending/dto/budget-check.dto.ts`
- Modify: `backend/src/apis/spending/spending.service.ts`
- Modify: `backend/src/apis/spending/spending.controller.ts`
- Test: `backend/src/apis/spending/spending.service.spec.ts`

**Interfaces:**
- Consumes: `LINE_CHAPTER`, `LINE_YEAR`, `CHAPTER_LINES` (Task 2).
- Produces: `POST /spending/budget-check` body `BudgetCheckDto`, risposta `BudgetWarning[]`:

```ts
export interface BudgetWarning {
  budget_chapter_id: number; chapter: string; year: number; invoiced: number; adjusted_budget: number;
}
```

- [ ] **Step 1: test che falliscono**

```ts
  describe('budgetCheck', () => {
    it('riga con impegno: capitolo ed esercizio dell’impegno; avviso oltre l’assestato, fattura stessa esclusa', async () => {
      query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM budget_commitments WHERE id IN')) return [{ id: 3, chapter_id: 7, fiscal_year: 2026 }];
        if (sql.includes('FROM budget_chapters b')) return [{ chapter_code: '12332', article: 0, adjusted_budget: '100.00' }];
        if (sql.includes('SUM(il.amount)')) return [{ total: '90.00' }];
        return [];
      });
      const warnings = await service.budgetCheck({
        invoice_id: 44,
        invoice_date: '2025-12-31',
        lines: [{ utility_id_fk: null, commitment_id_fk: 3, amount: 20 }],
      } as never);
      expect(warnings).toEqual([{ budget_chapter_id: 7, chapter: '12332/0', year: 2026, invoiced: 110, adjusted_budget: 100 }]);
      const sumCall = query.mock.calls.find(([s]) => String(s).includes('SUM(il.amount)'));
      expect(sumCall[0]).toContain('i.id <> ?');
      expect(sumCall[1]).toEqual([7, 2026, 44]);
    });

    it('riga senza impegno: capitolo dell’utenza, esercizio = anno della fattura; sotto l’assestato nessun avviso', async () => {
      query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM utilities WHERE id IN')) return [{ id: 9, chapter_id: 7 }];
        if (sql.includes('FROM budget_chapters b')) return [{ chapter_code: '12332', article: 0, adjusted_budget: '100.00' }];
        if (sql.includes('SUM(il.amount)')) return [{ total: '10.00' }];
        return [];
      });
      expect(
        await service.budgetCheck({ invoice_date: '2026-03-01', lines: [{ utility_id_fk: 9, commitment_id_fk: null, amount: 20 }] } as never),
      ).toEqual([]);
      const sumCall = query.mock.calls.find(([s]) => String(s).includes('SUM(il.amount)'));
      expect(sumCall[1]).toEqual([7, 2026, 0]);
    });

    it('nessun avviso senza assestato, senza capitolo o senza utenza né impegno', async () => {
      query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM utilities WHERE id IN')) return [{ id: 9, chapter_id: null }, { id: 8, chapter_id: 7 }];
        if (sql.includes('FROM budget_chapters b')) return [{ chapter_code: '1', article: 0, adjusted_budget: null }];
        return [];
      });
      expect(
        await service.budgetCheck({
          invoice_date: '2026-03-01',
          lines: [
            { utility_id_fk: null, commitment_id_fk: null, amount: 5 },
            { utility_id_fk: 9, commitment_id_fk: null, amount: 5 },
            { utility_id_fk: 8, commitment_id_fk: null, amount: 5 },
          ],
        } as never),
      ).toEqual([]);
    });
  });
```

- [ ] **Step 2: vederli fallire** — `docker exec utenzepa-api-1 pnpm exec jest src/apis/spending --maxWorkers=2` → FAIL.

- [ ] **Step 3: implementazione** — DTO:

```ts
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNumber, IsOptional, ValidateNested } from 'class-validator';
import { DateOnly } from '@/common/decorators/date-only.decorator';

export class BudgetCheckLineDto {
  @IsOptional()
  @IsInt()
  utility_id_fk?: number | null;

  @IsOptional()
  @IsInt()
  commitment_id_fk?: number | null;

  @Type(() => Number)
  @IsNumber()
  amount: number;
}

// Righe della fattura in modifica (anche non salvate): l'avviso confronta
// fatturato delle altre fatture + queste righe con l'assestato.
export class BudgetCheckDto {
  @IsOptional()
  @IsInt()
  invoice_id?: number | null;

  @DateOnly()
  invoice_date: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BudgetCheckLineDto)
  lines: BudgetCheckLineDto[];
}
```

Service:

```ts
  async budgetCheck(dto: BudgetCheckDto): Promise<BudgetWarning[]> {
    const commitmentIds = [...new Set(dto.lines.map((l) => l.commitment_id_fk).filter((v): v is number => !!v))];
    const utilityIds = [
      ...new Set(dto.lines.filter((l) => !l.commitment_id_fk).map((l) => l.utility_id_fk).filter((v): v is number => !!v)),
    ];
    const commitments = commitmentIds.length
      ? await this.q('SELECT id, budget_chapter_id_fk AS chapter_id, fiscal_year FROM budget_commitments WHERE id IN (?)', [commitmentIds])
      : [];
    const utilities = utilityIds.length
      ? await this.q('SELECT id, budget_chapter_code_fk AS chapter_id FROM utilities WHERE id IN (?)', [utilityIds])
      : [];
    const byCommitment = new Map(commitments.map((c) => [Number(c.id), c] as const));
    const byUtility = new Map(utilities.map((u) => [Number(u.id), u] as const));
    const invoiceYear = Number(String(dto.invoice_date).slice(0, 4));

    // Somma delle righe per capitolo + esercizio (righe senza capitolo ignorate).
    const groups = new Map<string, { chapter: number; year: number; amount: number }>();
    for (const line of dto.lines) {
      const c = line.commitment_id_fk ? byCommitment.get(line.commitment_id_fk) : undefined;
      const chapter = c ? Number(c.chapter_id) : line.utility_id_fk ? byUtility.get(line.utility_id_fk)?.chapter_id : null;
      if (chapter === null || chapter === undefined) continue;
      const year = c ? Number(c.fiscal_year) : invoiceYear;
      const key = `${chapter}-${year}`;
      const g = groups.get(key) ?? { chapter: Number(chapter), year, amount: 0 };
      g.amount += Number(line.amount) || 0;
      groups.set(key, g);
    }

    const warnings: BudgetWarning[] = [];
    for (const g of groups.values()) {
      const [b] = await this.q(
        `SELECT b.chapter_code, b.article, s.adjusted_budget
         FROM budget_chapters b
         LEFT JOIN budget_chapter_spending s ON s.budget_chapter_id_fk = b.id AND s.year = ? AND s.deleted = 0
         WHERE b.id = ?`,
        [g.year, g.chapter],
      );
      if (!b || b.adjusted_budget == null) continue;
      const [{ total }] = await this.q(
        `SELECT COALESCE(SUM(il.amount), 0) AS total ${CHAPTER_LINES}
         WHERE ${LINE_CHAPTER} = ? AND ${LINE_YEAR} = ? AND i.id <> ?`,
        [g.chapter, g.year, dto.invoice_id ?? 0],
      );
      const invoiced = Math.round((Number(total) + g.amount) * 100) / 100;
      const adjusted = Number(b.adjusted_budget);
      if (invoiced > adjusted) {
        warnings.push({ budget_chapter_id: g.chapter, chapter: `${b.chapter_code}/${b.article}`, year: g.year, invoiced, adjusted_budget: adjusted });
      }
    }
    return warnings;
  }
```

Nota: nel test "nessun avviso" la query `SUM(il.amount)` non è mockata e restituisce `[]`: la destrutturazione `[{ total }]` fallirebbe. Non ci si arriva (assestato `null` → `continue`), ma il test lo garantisce.

Controller: `@Post('spending/budget-check') budgetCheck(@Body() dto: BudgetCheckDto): Promise<BudgetWarning[]>` (aggiungere `Post`, `Body` agli import). Nessun `@Roles`: lo usa anche il Lettore (sola lettura, nessuna scrittura).

- [ ] **Step 4: test verdi** — stesso comando, PASS.
- [ ] **Step 5: commit** — `git add backend/src/apis/spending && git commit -m "feat(api): avviso di sforamento dell'assestato per la fattura"`

---

### Task 4: Segnalazioni dei capitoli (backend)

**Files:**
- Modify: `backend/src/apis/anomalies/anomalies.service.ts`
- Test: `backend/src/apis/anomalies/anomalies.service.spec.ts`

**Interfaces:**
- Consumes: `chaptersYearSummary`, `currentYear` (Task 2).
- Produces nel JSON di `GET /anomalies`:

```ts
export interface ChapterAnomaly { id: number; chapter: string; description: string | null }
chapters_over_budget: AnomalyList<ChapterAnomaly & { adjusted_budget: number; committed: number; invoiced: number }>;
chapters_without_budget: AnomalyList<ChapterAnomaly>;
```

- [ ] **Step 1: test che falliscono**

```ts
  it('capitoli oltre l’assestato dell’esercizio in corso, solo non cancellati', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM budget_chapter_spending WHERE year = ?')) return [{ chapter_id: 7, adjusted_budget: '100' }];
      if (sql.includes('FROM budget_commitments WHERE fiscal_year = ?')) return [{ chapter_id: 7, commitments: '1', total: '150', without_amount: '0' }];
      if (sql.includes('FROM budget_chapters WHERE deleted = 0 AND id IN')) return [{ id: 7, chapter_code: '12332', article: 0, description: 'Gas scuole' }];
      return [];
    });
    const result = await service.getAnomalies();
    expect(result.chapters_over_budget.items).toEqual([
      { id: 7, chapter: '12332/0', description: 'Gas scuole', adjusted_budget: 100, committed: 150, invoiced: 0 },
    ]);
    const yearParams = query.mock.calls.filter(([s]) => String(s).includes('FROM budget_chapter_spending WHERE year = ?'));
    expect(yearParams[0][1]).toEqual([new Date().getFullYear()]);
  });

  it('capitoli usati nell’esercizio senza assestato', async () => {
    query.mockImplementation(async (sql: string) =>
      sql.includes('s.adjusted_budget IS NOT NULL') ? [{ id: 4, chapter_code: '11428', article: 0, description: 'Acqua' }] : [],
    );
    const result = await service.getAnomalies();
    expect(result.chapters_without_budget.items).toEqual([{ id: 4, chapter: '11428/0', description: 'Acqua' }]);
    const sql = query.mock.calls.map(([s]) => String(s)).find((s) => s.includes('s.adjusted_budget IS NOT NULL'));
    expect(sql).toContain('b.deleted = 0');
    expect(sql).toContain('u.supply_active = 1');
    expect(sql).toContain('c.fiscal_year = ?');
  });
```

e nel test "aggrega le 5 categorie…" `toHaveBeenCalledTimes(19)` diventa `23` (3 query del riepilogo + 1 dei capitoli senza assestato; la query delle etichette parte solo se ci sono capitoli oltre l'assestato).

- [ ] **Step 2: vederli fallire** — `docker exec utenzepa-api-1 pnpm exec jest src/apis/anomalies --maxWorkers=2` → FAIL.

- [ ] **Step 3: implementazione** — in `getAnomalies()`, prima del `return`:

```ts
    // Capitoli sull'esercizio in corso (scheda capitolo e voce 20 della roadmap).
    const year = currentYear();
    const summary = await chaptersYearSummary((sql, params) => this.dataSource.query(sql, params), year);
    const over = summary.filter((r) => r.over_budget);
    const overLabels: Record<string, unknown>[] = over.length
      ? await this.dataSource.query(
          'SELECT id, chapter_code, article, description FROM budget_chapters WHERE deleted = 0 AND id IN (?)',
          [over.map((r) => r.budget_chapter_id)],
        )
      : [];
    const labelOf = new Map(overLabels.map((b) => [Number(b.id), b] as const));
    const withoutBudget: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT b.id, b.chapter_code, b.article, b.description FROM budget_chapters b
       WHERE b.deleted = 0
         AND (EXISTS (SELECT 1 FROM utilities u WHERE u.budget_chapter_code_fk = b.id AND u.deleted = 0 AND u.supply_active = 1)
              OR EXISTS (SELECT 1 FROM budget_commitments c WHERE c.budget_chapter_id_fk = b.id AND c.deleted = 0 AND c.fiscal_year = ?))
         AND NOT EXISTS (SELECT 1 FROM budget_chapter_spending s
                         WHERE s.budget_chapter_id_fk = b.id AND s.deleted = 0 AND s.year = ? AND s.adjusted_budget IS NOT NULL)
       ORDER BY b.chapter_code, b.article`,
      [year, year],
    );
    const chapterLabel = (b: Record<string, unknown>) => ({
      id: Number(b.id),
      chapter: `${b.chapter_code}/${b.article}`,
      description: (b.description as string) ?? null,
    });
```

e nel `return`:

```ts
      chapters_over_budget: list(
        over
          .filter((r) => labelOf.has(r.budget_chapter_id))
          .map((r) => ({
            ...chapterLabel(labelOf.get(r.budget_chapter_id)),
            adjusted_budget: r.adjusted_budget as number,
            committed: r.committed,
            invoiced: r.invoiced,
          })),
      ),
      chapters_without_budget: list(withoutBudget.map(chapterLabel)),
```

più le due voci nell'interfaccia `Anomalies` e `ChapterAnomaly` esportata. Import `{ chaptersYearSummary, currentYear } from '@apis/spending/chapter-year'`.

- [ ] **Step 4: test verdi** — PASS (tutta la cartella anomalies).
- [ ] **Step 5: commit** — `git add backend/src/apis/anomalies && git commit -m "feat(api): segnalazioni capitoli oltre l'assestato e senza assestato"`

---

### Task 5: Esercizi del capitolo (frontend: servizio, tab, dialog)

**Files:**
- Create: `frontend/src/app/pages/budget-chapters/chapter-budget.model.ts`
- Create: `frontend/src/app/pages/budget-chapters/chapter-budget.service.ts`
- Create: `frontend/src/app/pages/budget-chapters/spending/budget-chapter-years-tab.component.ts`
- Delete: `frontend/src/app/pages/budget-chapters/spending/budget-chapter-spending-tab.component.ts`
- Modify: `frontend/src/app/pages/budget-chapters/spending/spending-edit-dialog.component.ts`
- Modify: `frontend/src/app/pages/budget-chapters/spending/budget-chapter-spending.service.ts`
- Modify: `frontend/src/app/core/helpers/entity-status.ts`

**Interfaces:**
- Consumes: endpoint dei Task 2–3.
- Produces:

```ts
// chapter-budget.model.ts: gemelli delle interfacce backend
export interface ChapterYear { /* stessi campi di apis/spending/chapter-year.ts */ }
export interface ChapterYearSummary extends ChapterYear { budget_chapter_id: number }
export interface ChapterCommitment { id: number; contract_id: number; fiscal_year: number; commitment_number: string | null; amount: number | null; cig_contract: string | null; supplier: string | null }
export interface ChapterInvoiceLine { id: number; invoice_id: number; number: string; invoice_date: string; supplier: string | null; utility_id: number | null; utility_code: string | null; year: number; amount: number }
export interface BudgetWarning { budget_chapter_id: number; chapter: string; year: number; invoiced: number; adjusted_budget: number }
export interface BudgetCheckPayload { invoice_id?: number | null; invoice_date: string; lines: {utility_id_fk: number | null; commitment_id_fk: number | null; amount: number}[] }
// ChapterBudgetService (providedIn root, header Authorization a mano come BudgetChapterSpendingService)
years(chapterId: number): Observable<ChapterYear[]>;
commitments(chapterId: number): Observable<ChapterCommitment[]>;
invoiceLines(chapterId: number): Observable<ChapterInvoiceLine[]>;
yearSummary(year: number): Observable<ChapterYearSummary[]>;
budgetCheck(payload: BudgetCheckPayload): Observable<BudgetWarning[]>;
// entity-status.ts
export function chapterBudgetStatus(y: ChapterYear | null | undefined): StatusInfo;
// <app-budget-chapter-years-tab [chapterId] [years] [canEdit] (changed)>
```

- [ ] **Step 1: modello e servizio** — `chapter-budget.service.ts`:

```ts
import {inject, Injectable} from '@angular/core';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import {Observable} from 'rxjs';
import {environment} from '../../../environments/environment';
import {AuthService} from '../../services/auth.service';
import {BudgetCheckPayload, BudgetWarning, ChapterCommitment, ChapterInvoiceLine, ChapterYear, ChapterYearSummary} from './chapter-budget.model';

// Dati calcolati del capitolo (esercizi, impegni, fatture). Non estende
// AbstractService: header Authorization a mano (nessun interceptor lo aggiunge).
@Injectable({providedIn: 'root'})
export class ChapterBudgetService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private readonly api = environment.apiUrl;

  private headers(): HttpHeaders {
    return new HttpHeaders({Authorization: `Bearer ${this.auth.getToken() || ''}`});
  }

  years(chapterId: number): Observable<ChapterYear[]> {
    return this.http.get<ChapterYear[]>(`${this.api}/budget-chapters/${chapterId}/years`, {headers: this.headers()});
  }

  commitments(chapterId: number): Observable<ChapterCommitment[]> {
    return this.http.get<ChapterCommitment[]>(`${this.api}/budget-chapters/${chapterId}/commitments`, {headers: this.headers()});
  }

  invoiceLines(chapterId: number): Observable<ChapterInvoiceLine[]> {
    return this.http.get<ChapterInvoiceLine[]>(`${this.api}/budget-chapters/${chapterId}/invoice-lines`, {headers: this.headers()});
  }

  yearSummary(year: number): Observable<ChapterYearSummary[]> {
    return this.http.get<ChapterYearSummary[]>(`${this.api}/spending/chapters`, {headers: this.headers(), params: {year}});
  }

  budgetCheck(payload: BudgetCheckPayload): Observable<BudgetWarning[]> {
    return this.http.post<BudgetWarning[]>(`${this.api}/spending/budget-check`, payload, {headers: this.headers()});
  }
}
```

- [ ] **Step 2: stato del capitolo** — in `entity-status.ts`:

```ts
const euro = (v: number | null | undefined): string =>
  Number(v ?? 0).toLocaleString('it-IT', {style: 'currency', currency: 'EUR'});

// Esercizio in corso del capitolo (badge della scheda, elenco).
export function chapterBudgetStatus(
  y: {adjusted_budget: number | null; available: number | null; over_budget: boolean} | null | undefined,
): StatusInfo {
  if (!y || y.adjusted_budget === null) return {tone: 'off', label: 'Assestato non indicato', icon: 'help_outline'};
  if (y.over_budget) return {tone: 'danger', label: "Oltre l'assestato", icon: 'report'};
  return {tone: 'ok', label: `Disponibile ${euro(y.available)}`, icon: 'check_circle'};
}
```

- [ ] **Step 3: dialog dell'anno** — `spending-edit-dialog.component.ts`: titolo `{{ data.item ? 'Modifica esercizio ' + data.item.year : 'Nuovo esercizio' }}`; campi `year` (obbligatorio), `initial_budget` "Stanziamento iniziale (€)", `adjusted_budget` "Assestato (€)", `amount` "Spesa ragioneria (€)", tutti `type="number" min="0" step="0.01"` senza `Validators.required`; validatore di gruppo:

```ts
function someAmount(group: AbstractControl): ValidationErrors | null {
  const v = group.value as Record<string, unknown>;
  return ['initial_budget', 'adjusted_budget', 'amount'].some(k => v[k] !== null && v[k] !== '' && v[k] !== undefined)
    ? null : {noAmount: true};
}
```

messaggio sotto i campi se `form.hasError('noAmount') && form.touched`: "Indicare almeno un importo." Payload: `const n = (x: unknown) => (x === null || x === '' || x === undefined ? null : Number(x));` per i tre importi. Default anno nuovo: `new Date().getFullYear()`. `BudgetChapterSpending`/`BudgetChapterSpendingPayload` nel servizio: `amount: number | null; initial_budget: number | null; adjusted_budget: number | null`.

- [ ] **Step 4: tab Esercizi** — `budget-chapter-years-tab.component.ts`: componente presentazionale (i dati li carica la scheda):

```ts
@Component({
  selector: 'app-budget-chapter-years-tab',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="yt">
      @if (canEdit) {
        <button mat-stroked-button type="button" (click)="edit()"><mat-icon>add</mat-icon> Nuovo esercizio</button>
      }
      <table class="yt-table">
        <thead><tr>
          <th>Esercizio</th><th class="n">Stanz. iniziale</th><th class="n">Assestato</th><th class="n">Impegnato</th>
          <th class="n">Fatturato</th><th class="n">Spesa ragioneria</th><th class="n">Disponibile</th><th>Note</th><th></th>
        </tr></thead>
        <tbody>
          @for (y of years; track y.year) {
            <tr [class.over]="y.over_budget">
              <td>{{ y.year }}</td>
              <td class="n">{{ eur(y.initial_budget) }}</td>
              <td class="n">{{ eur(y.adjusted_budget) }}</td>
              <td class="n">{{ y.commitments ? eur(y.committed) : '' }}
                @if (y.commitments_without_amount) { <div class="sub">{{ y.commitments_without_amount }} senza importo</div> }</td>
              <td class="n">{{ y.invoices ? eur(y.invoiced) : '' }}
                @if (y.invoices) { <div class="sub">{{ y.invoices }} fatture</div> }</td>
              <td class="n">{{ eur(y.recorded_spending) }}</td>
              <td class="n">{{ eur(y.available) }}</td>
              <td>{{ y.notes ?? '' }}</td>
              <td class="actions">
                @if (canEdit) {
                  <button mat-icon-button type="button" (click)="edit(y)" matTooltip="Modifica"><mat-icon>edit</mat-icon></button>
                  @if (y.spending_id) {
                    <button mat-icon-button type="button" (click)="remove(y)" matTooltip="Elimina dati della ragioneria"><mat-icon>delete</mat-icon></button>
                  }
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: [`
    .yt { display: flex; flex-direction: column; align-items: flex-start; gap: 0.75rem; padding: 1rem 0; }
    .yt-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    .yt-table th, .yt-table td { padding: 6px; border-bottom: 1px solid var(--sheet-border); text-align: left; vertical-align: top; }
    .yt-table .n { text-align: right; white-space: nowrap; }
    .yt-table tr.over td { background: var(--tone-danger-bg); }
    .sub { font-size: 0.75rem; color: var(--sheet-muted); }
    .actions { white-space: nowrap; text-align: right; }
  `],
})
export class BudgetChapterYearsTabComponent {
  private dialog = inject(MatDialog);
  private spending = inject(BudgetChapterSpendingService);

  @Input({required: true}) chapterId!: number;
  @Input() years: ChapterYear[] = [];
  @Input() canEdit = false;
  @Output() changed = new EventEmitter<void>();

  readonly eur = formatEuro;

  // Riga senza dati della ragioneria (solo impegni/fatture): si crea quella dell'anno.
  edit(y?: ChapterYear): void {
    const item = y?.spending_id
      ? {id: y.spending_id, budget_chapter_id_fk: this.chapterId, year: y.year, amount: y.recorded_spending,
         initial_budget: y.initial_budget, adjusted_budget: y.adjusted_budget, notes: y.notes}
      : undefined;
    this.dialog.open<SpendingEditDialogComponent, SpendingEditDialogData, boolean>(SpendingEditDialogComponent, {
      width: '520px',
      data: {chapterId: this.chapterId, item, year: y?.year},
    }).afterClosed().subscribe(saved => { if (saved) this.changed.emit(); });
  }

  remove(y: ChapterYear): void {
    this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
      width: '380px',
      data: {title: 'Elimina dati dell’esercizio', message: `Eliminare stanziamenti e spesa ragioneria del ${y.year}? Impegni e fatture restano.`, confirmLabel: 'Elimina', danger: true},
    }).afterClosed().subscribe(ok => {
      if (!ok || !y.spending_id) return;
      this.spending.delete(y.spending_id).subscribe({next: () => this.changed.emit(), error: err => console.error('Errore eliminazione esercizio:', err)});
    });
  }
}
```

`SpendingEditDialogData` riceve `year?: number` (anno proposto per una riga nuova; il default resta l'anno in corso). Eliminare `budget-chapter-spending-tab.component.ts` (`git rm`) dopo aver verificato con `grep -rn "app-budget-chapter-spending-tab\|BudgetChapterSpendingTabComponent" frontend/src` che lo usava solo il dialog del capitolo (riscritto nel Task 6).

- [ ] **Step 5: compilazione** — il Task 6 monta il tab; qui basta che `ng serve` non dia errori sui file toccati (il vecchio dialog del capitolo importa ancora il tab eliminato: eseguire il Task 6 subito dopo, nello stesso giro di compilazione, prima di controllare i log).
- [ ] **Step 6: commit** (insieme al Task 6, perché il dialog vecchio non compila senza il tab eliminato).

---

### Task 6: Scheda capitolo (frontend)

**Files:**
- Modify (riscrittura): `frontend/src/app/pages/budget-chapters/budget-chapter-edit-dialog.component.ts`
- Modify (riscrittura): `frontend/src/app/pages/budget-chapters/budget-chapter-edit-dialog.component.html`
- Modify: `frontend/src/app/pages/budget-chapters/data-table-budget-chapters.component.ts` (`useSheet()` → `true`)
- Modify: `frontend/src/app/pages/budget-chapters/budget-chapters.component.ts` (`?selectedId`)
- Modify: `frontend/src/app/core/services/entity-navigator.service.ts`
- Modify: `frontend/src/app/pages/audit-log/audit-log-page.component.ts`
- Modify: `frontend/src/styles.scss` (`--entity-chapter`)

**Interfaces:**
- Consumes: `ChapterBudgetService`, `chapterBudgetStatus`, `BudgetChapterYearsTabComponent` (Task 5); `BudgetChapterUtilitiesTabComponent`, `EntityHistoryComponent`, `LinkedTableComponent`, `PreviewCardComponent`, `MultiSelectComponent` (esistenti).
- Produces: `EntityNavigatorService.openBudgetChapter(id: number): Observable<BudgetChapter | null>`; dialog che chiude con `BudgetChapter` (Salva) o `undefined`, dati `EditDialogData<BudgetChapter>` come prima.

- [ ] **Step 1: scheda** — `.ts` (campi del form invariati rispetto al dialog attuale: `chapter_code` disabilitato in modifica, `article`, `pdc`, `utility_type_ids`, `description`):

```ts
export class BudgetChapterEditDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<BudgetChapterEditDialogComponent, BudgetChapter | undefined>);
  private budget = inject(ChapterBudgetService);
  private consumption = inject(UtilityConsumptionService);
  private navigator = inject(EntityNavigatorService);
  protected data = inject<EditDialogData<BudgetChapter>>(MAT_DIALOG_DATA);

  @ViewChild(MatTabGroup) tabGroup?: MatTabGroup;
  @ViewChildren(MatTab) tabList?: QueryList<MatTab>;

  readonly isNew = this.data.mode === 'create';
  readonly canEdit = isEditorRole(inject(AuthService).getCurrentUser()?.role);
  readonly lastModified = lastModifiedLabel(this.data.item.update_date, this.data.item.updated_by);
  readonly year = new Date().getFullYear();
  readonly eur = formatEuro;

  utilityTypeOptions: TOption[] = [];
  // Campi cache (mai getter) per app-linked-table e le anteprime.
  years: ChapterYear[] = [];
  current: ChapterYear | null = null;
  status: StatusInfo = chapterBudgetStatus(null);
  commitments: ChapterCommitment[] = [];
  lines: ChapterInvoiceLine[] = [];
  utilityPreview: PreviewItem[] = [];
  commitmentPreview: PreviewItem[] = [];
  linePreview: PreviewItem[] = [];

  readonly commitmentColumns: LinkedColumn<ChapterCommitment>[] = [
    {label: 'Esercizio', value: c => String(c.fiscal_year)},
    {label: 'Fornitore', value: c => c.supplier ?? ''},
    {label: 'CIG', value: c => c.cig_contract ?? 'CIG non specificato'},
    {label: 'Numero', value: c => c.commitment_number ?? ''},
    {label: 'Importo', value: c => (c.amount === null ? 'senza importo' : formatEuro(c.amount))},
  ];
  readonly lineColumns: LinkedColumn<ChapterInvoiceLine>[] = [
    {label: 'Fattura', value: l => `${l.number} del ${dateIt(l.invoice_date)}`},
    {label: 'Fornitore', value: l => l.supplier ?? ''},
    {label: 'Utenza', value: l => l.utility_code ?? ''},
    {label: 'Esercizio', value: l => String(l.year)},
    {label: 'Importo', value: l => formatEuro(l.amount)},
  ];

  form = this.fb.group({
    chapter_code: [{value: this.data.item.chapter_code ?? '', disabled: !this.isNew}, Validators.required],
    article: [this.data.item.article ?? '', Validators.required],
    pdc: [this.data.item.pdc ?? ''],
    utility_type_ids: [(this.data.item.utilityTypes ?? []).map(t => t.id)],
    description: [this.data.item.description ?? ''],
  });

  constructor() {
    if (!this.canEdit) this.form.disable();
    inject(UtilityTypesService).search({deleted: false}).subscribe({
      next: list => this.utilityTypeOptions = list.map(t => ({label: t.name, value: t.id})),
      error: err => console.error('Errore nel caricamento dei tipi utenza:', err),
    });
  }

  ngOnInit(): void {
    if (this.isNew) return;
    const id = this.data.item.id;
    this.loadYears();
    this.budget.commitments(id).subscribe({
      next: rows => {
        this.commitments = rows;
        this.commitmentPreview = rows.map(c => ({id: c.id, label: `${c.fiscal_year} · ${c.supplier ?? ''}`, sublabel: c.amount === null ? 'senza importo' : formatEuro(c.amount)}));
      },
      error: err => console.error('Errore caricamento impegni del capitolo:', err),
    });
    this.budget.invoiceLines(id).subscribe({
      next: rows => {
        this.lines = rows;
        this.linePreview = rows.map(l => ({id: l.id, label: `${l.number} del ${dateIt(l.invoice_date)}`, sublabel: formatEuro(l.amount)}));
      },
      error: err => console.error('Errore caricamento fatture del capitolo:', err),
    });
    this.consumption.chapterSummary(id).subscribe({
      next: rows => this.utilityPreview = rows.map((r, i) => ({id: i + 1, label: `${HardTypeDescription[r.hard_type]}: ${r.utilities_count}`})),
      error: err => console.error('Errore caricamento utenze del capitolo:', err),
    });
  }

  loadYears(): void {
    this.budget.years(this.data.item.id).subscribe({
      next: rows => {
        this.years = rows;
        this.current = rows.find(r => r.year === this.year) ?? null;
        this.status = chapterBudgetStatus(this.current);
      },
      error: err => console.error('Errore caricamento esercizi del capitolo:', err),
    });
  }

  titleText(): string {
    const code = this.form.getRawValue().chapter_code;
    return code ? `Capitolo ${code}/${this.form.getRawValue().article || 0}` : 'Nuovo capitolo di spesa';
  }

  dataInvalid(): boolean {
    return hasInvalid(this.form, 'chapter_code', 'article');
  }

  goTo(label: string): void {
    selectTab(this.tabGroup, this.tabList, label);
  }

  openContract(c: ChapterCommitment): void {
    this.navigator.openSupplyContract(c.contract_id).subscribe(saved => { if (saved) this.ngOnInit(); });
  }

  openInvoice(l: ChapterInvoiceLine): void {
    this.navigator.openInvoice(l.invoice_id).subscribe(saved => { if (saved) this.ngOnInit(); });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.dialogRef.close(plainToInstance(BudgetChapter, {id: this.data.item.id, ...this.form.getRawValue()}));
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}
```

Nota: `utility_type_ids` dal form finisce nel payload tramite `BudgetChapter.toPayload` (usa `e.utility_type_ids` se presente). `dateIt` da `core/components/entity-sheet/sheet-utils`; `formatEuro` da `./spending/budget-chapter-spending.service`; `HardTypeDescription` da `../utility-types/enum/hard-type.enum`.

`.html`:

```html
<app-entity-sheet icon="account_balance" color="var(--entity-chapter)" [title]="titleText()"
                  [subtitle]="data.item.description ?? ''" [lastModified]="lastModified">
  <ng-container sheetBadges>
    @if (!isNew) {
      <app-status-badge [info]="status" size="sm"></app-status-badge>
    }
  </ng-container>

  <form [formGroup]="form">
    <mat-tab-group mat-stretch-tabs="false" mat-align-tabs="start" animationDuration="0ms">
      <mat-tab aria-label="Riepilogo">
        <ng-template mat-tab-label>
          <app-tab-label icon="summarize" label="Riepilogo" [error]="dataInvalid()"></app-tab-label>
        </ng-template>
        <div class="sheet-grid">
          <mat-form-field>
            <mat-label>Codice capitolo</mat-label>
            <input matInput formControlName="chapter_code">
          </mat-form-field>
          <mat-form-field>
            <mat-label>Articolo</mat-label>
            <input matInput formControlName="article" onlyNumbers>
          </mat-form-field>
          <mat-form-field>
            <mat-label>PDC</mat-label>
            <input matInput formControlName="pdc">
          </mat-form-field>
          <app-multi-select formControlName="utility_type_ids" label="Tipi utenza" placeholder="Tutti i tipi"
                            [options]="utilityTypeOptions"></app-multi-select>
          <mat-form-field class="span-all">
            <mat-label>Descrizione</mat-label>
            <textarea matInput formControlName="description" rows="2"></textarea>
          </mat-form-field>
        </div>
        @if (!isNew) {
          <div class="sheet-section-title">Esercizio {{ year }}</div>
          <div class="chapter-year">
            <div><span class="sheet-hint">Stanziamento iniziale</span><strong>{{ eur(current?.initial_budget) || '—' }}</strong></div>
            <div><span class="sheet-hint">Assestato</span><strong>{{ eur(current?.adjusted_budget) || '—' }}</strong></div>
            <div><span class="sheet-hint">Impegnato</span><strong>{{ eur(current?.committed ?? 0) }}</strong>
              @if (current?.commitments_without_amount) { <span class="sheet-hint">{{ current?.commitments_without_amount }} impegni senza importo</span> }</div>
            <div><span class="sheet-hint">Fatturato</span><strong>{{ eur(current?.invoiced ?? 0) }}</strong></div>
            <div><span class="sheet-hint">Disponibile</span><strong>{{ eur(current?.available) || '—' }}</strong></div>
          </div>
          <div class="sheet-previews">
            <app-preview-card title="Utenze" icon="electric_meter" color="var(--entity-utility)" [items]="utilityPreview"
                              emptyText="Nessuna utenza" (seeAll)="goTo('Utenze')" (open)="goTo('Utenze')"></app-preview-card>
            <app-preview-card title="Impegni" icon="description" color="var(--entity-supply-contract)" [items]="commitmentPreview"
                              emptyText="Nessun impegno" (seeAll)="goTo('Impegni')" (open)="goTo('Impegni')"></app-preview-card>
            <app-preview-card title="Fatture" icon="receipt_long" color="var(--entity-chapter)" [items]="linePreview"
                              emptyText="Nessuna fattura" (seeAll)="goTo('Fatture')" (open)="goTo('Fatture')"></app-preview-card>
          </div>
        }
      </mat-tab>

      @if (!isNew) {
        <mat-tab aria-label="Utenze">
          <ng-template mat-tab-label><app-tab-label icon="electric_meter" label="Utenze"></app-tab-label></ng-template>
          <ng-template matTabContent>
            <app-budget-chapter-utilities-tab [chapterId]="data.item.id"></app-budget-chapter-utilities-tab>
          </ng-template>
        </mat-tab>
        <mat-tab aria-label="Impegni">
          <ng-template mat-tab-label><app-tab-label icon="description" label="Impegni" [count]="commitments.length"></app-tab-label></ng-template>
          <app-linked-table [columns]="commitmentColumns" [rows]="commitments" emptyText="Nessun impegno su questo capitolo."
                            (open)="openContract($event)"></app-linked-table>
        </mat-tab>
        <mat-tab aria-label="Fatture">
          <ng-template mat-tab-label><app-tab-label icon="receipt_long" label="Fatture" [count]="lines.length"></app-tab-label></ng-template>
          <app-linked-table [columns]="lineColumns" [rows]="lines" emptyText="Nessuna fattura su questo capitolo."
                            (open)="openInvoice($event)"></app-linked-table>
        </mat-tab>
        <mat-tab aria-label="Esercizi">
          <ng-template mat-tab-label>
            <app-tab-label icon="euro" label="Esercizi" [dot]="!!current?.over_budget" tone="danger"></app-tab-label>
          </ng-template>
          <app-budget-chapter-years-tab [chapterId]="data.item.id" [years]="years" [canEdit]="canEdit"
                                        (changed)="loadYears()"></app-budget-chapter-years-tab>
        </mat-tab>
        <mat-tab aria-label="Storico">
          <ng-template mat-tab-label><app-tab-label icon="history" label="Storico"></app-tab-label></ng-template>
          <ng-template matTabContent>
            <app-entity-history [entity]="'budget_chapters'" [entityId]="data.item.id"
              [lastModifiedBy]="data.item.updated_by ? data.item.updated_by.firstName + ' ' + data.item.updated_by.lastName : null"
              [lastModifiedAt]="data.item.update_date ? data.item.update_date.toString() : null"></app-entity-history>
          </ng-template>
        </mat-tab>
      }
    </mat-tab-group>
  </form>

  <ng-container sheetActions>
    <button mat-stroked-button type="button" (click)="cancel()">{{ canEdit ? 'Annulla' : 'Chiudi' }}</button>
    @if (canEdit) {
      <button mat-flat-button type="button" (click)="save()">{{ isNew ? 'Crea capitolo' : 'Salva' }}</button>
    }
  </ng-container>
</app-entity-sheet>
```

Stile nel componente: `.chapter-year { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 16px; } .chapter-year > div { display: flex; flex-direction: column; gap: 2px; }`. Verificare i nomi reali delle classi `sheet-grid`, `span-all`, `sheet-previews`, `sheet-section-title`, `sheet-hint` in `asset-edit-dialog.component.html` prima di usarli. `styles.scss` in `:root`: `--entity-chapter: #4d7c0f;`.

Il `updated_by` della riga arriva solo se `findAll` lo joina: `BudgetChaptersService.findAll` non joina `created_by`/`updated_by` (CLAUDE.md, "findOne joina relazioni che findAll non joina"); aggiungere `qb.leftJoinAndSelect(`${alias}.updated_by`, 'updated_by')` in `findAll` e aggiornare lo spec del Task 2 (`leftJoinAndSelect` chiamato anche con `updated_by`).

- [ ] **Step 2: elenco e navigatore**
  - `data-table-budget-chapters.component.ts`: `protected override useSheet(): boolean { return true; }`.
  - `budget-chapters.component.ts`: `@ViewChild('dataTable')`, `#dataTable` nel template, `ngOnInit` con `this.initFromRoute(this.route, item => this.dataTable?.openEditDialog(item))` (stesso schema di `contracts.component.ts`).
  - Navigatore:

```ts
  openBudgetChapter(id: number): Observable<BudgetChapter | null> {
    return this.chapters.getById(id).pipe(
      switchMap(item => this.sheet<EditDialogData<BudgetChapter>, BudgetChapter>(BUDGET_CHAPTER_DIALOG, {mode: 'edit', item})),
      switchMap(r => (r ? this.chapters.update(r.id, BudgetChapter.toPayload(r)) : of(null))),
      catchError(err => this.fail('Errore apertura/salvataggio del capitolo', err)),
    );
  }
```

    e `createBudgetChapter` passa da `this.simple(...)` a `this.sheet(...)` (stesso payload).
  - Log modifiche: `budget_chapters: id => this.navigator.openBudgetChapter(id),` negli `openers`.

- [ ] **Step 3: compilazione** — `docker logs --since 60s utenzepa-frontend-1 2>&1 | grep -E "✘|generation"` → "generation complete", nessun `✘`.
- [ ] **Step 4: E2E** (utente temporaneo Admin): elenco capitoli → riga 12332 → scheda: badge "Assestato non indicato"; tab Esercizi → "Nuovo esercizio" 2026 assestato 100 → badge "Oltre l'assestato" solo se impegnato/fatturato > 100, altrimenti "Disponibile"; tab Impegni → apre il contratto; tab Fatture → apre la fattura; Salva della scheda non cambia il capitolo (nessuna modifica dei dati); `?selectedId=230` apre la scheda; Log modifiche → "Capitoli di spesa" → Apri. Poi riga 2026 eliminata, utente temporaneo e audit eliminati.
- [ ] **Step 5: commit** (Task 5 + 6)

```bash
git add frontend/src/app/pages/budget-chapters frontend/src/app/core/helpers/entity-status.ts frontend/src/app/core/services/entity-navigator.service.ts frontend/src/app/pages/audit-log/audit-log-page.component.ts frontend/src/styles.scss backend/src/apis/budget-chapters
git commit -m "feat(ui): scheda capitolo di spesa con esercizi, impegni e fatture"
```

---

### Task 7: Elenco capitoli e dashboard (colonne e segnalazioni)

**Files:**
- Modify: `frontend/src/app/core/services/anomalies.service.ts`
- Modify: `frontend/src/app/pages/budget-chapters/budget-chapters-filters.ts`
- Modify: `frontend/src/app/pages/budget-chapters/budget-chapters.component.ts` / `.html`
- Modify: `frontend/src/app/pages/budget-chapters/data-table-budget-chapters.component.ts` / `.html`
- Modify: `frontend/src/app/pages/dashboard/anomalies-card.component.ts`

**Interfaces:**
- Consumes: `chapters_over_budget`, `chapters_without_budget` (Task 4); `ChapterBudgetService.yearSummary` (Task 5); `openBudgetChapter` (Task 6).

- [ ] **Step 1: tipi** — in `anomalies.service.ts`:

```ts
export interface ChapterAnomaly {
  id: number;
  chapter: string;
  description: string | null;
}
// in Anomalies:
  chapters_over_budget: AnomalyList<ChapterAnomaly & {adjusted_budget: number; committed: number; invoiced: number}>;
  chapters_without_budget: AnomalyList<ChapterAnomaly>;
```

- [ ] **Step 2: segnalazioni dell'elenco** — `budget-chapters-filters.ts`:

```ts
export const CHAPTER_SIGNALS: SignalDef[] = [
  {key: 'chapters_over_budget', label: "Oltre l'assestato dell'anno"},
  {key: 'chapters_without_budget', label: "Senza assestato dell'anno"},
];
```

e in `budget-chapters.component.*` lo stesso cablaggio di `contracts.component.*` (`ListSignalsComponent`, `[signals]`, `[reloadToken]="signalsToken"`, `[activeKey]`, `(selected)="onSignal($event)"`, `[extraChips]="signalChips"`, `(extraChipRemoved)="clearSignal()"`).

- [ ] **Step 3: colonne dell'anno** — nella data table due colonne facoltative (non nel set di default), `{field: 'adjusted_budget', header: 'Assestato ' + anno}` e `{field: 'available', header: 'Disponibile ' + anno}`; i valori da una mappa caricata una volta:

```ts
  private budget = inject(ChapterBudgetService);
  readonly year = new Date().getFullYear();
  yearByChapter = new Map<number, ChapterYearSummary>();

  // nel costruttore:
  this.budget.yearSummary(this.year).subscribe({
    next: rows => this.yearByChapter = new Map(rows.map(r => [r.budget_chapter_id, r])),
    error: err => console.error('Errore caricamento riepilogo esercizio:', err),
  });
```

celle: `{{ eur(yearByChapter.get(item.id)?.adjusted_budget) }}` e, per il disponibile, valore + classe `tone-danger` se `over_budget`. Ricaricare la mappa dopo un salvataggio (`ngOnChanges` sui `data`, come il resto della tabella).

- [ ] **Step 4: dashboard** — due pannelli nel riquadro anomalie (stesso markup dei pannelli esistenti):

```html
@if (data.chapters_over_budget.count > 0) {
<mat-expansion-panel>
  <mat-expansion-panel-header><mat-panel-title>
    <span class="anomaly-count">{{ data.chapters_over_budget.count }}</span> Capitoli oltre l'assestato dell'anno
  </mat-panel-title></mat-expansion-panel-header>
  <ul class="anomaly-list">
    @for (c of data.chapters_over_budget.items; track c.id) {
      <li (click)="openChapter(c.id)">{{ c.chapter }} · assestato {{ eur(c.adjusted_budget) }} · impegnato {{ eur(c.committed) }} · fatturato {{ eur(c.invoiced) }}</li>
    }
  </ul>
</mat-expansion-panel>
}
@if (data.chapters_without_budget.count > 0) {
<mat-expansion-panel>
  <mat-expansion-panel-header><mat-panel-title>
    <span class="anomaly-count">{{ data.chapters_without_budget.count }}</span> Capitoli usati senza assestato dell'anno
  </mat-panel-title></mat-expansion-panel-header>
  <ul class="anomaly-list">
    @for (c of data.chapters_without_budget.items; track c.id) {
      <li (click)="openChapter(c.id)">{{ c.chapter }} · {{ c.description }}</li>
    }
  </ul>
</mat-expansion-panel>
}
```

`openChapter(id)` → `this.navigator.openBudgetChapter(id).subscribe(() => this.load())`; `eur = formatEuro`. Il getter `total` somma oggi a mano solo alcune voci (mancano anche quelle aggiunte in v1.13.0): sostituirlo con `Object.values(this.data).reduce((s, a) => s + a.count, 0)`.

- [ ] **Step 5: compilazione + E2E** — segnalazioni nell'elenco capitoli (il clic filtra), colonne Assestato/Disponibile attivabili, dashboard con le due voci e apertura della scheda.
- [ ] **Step 6: commit** — `git add` dei file del task, `git commit -m "feat(ui): segnalazioni e colonne dell'esercizio nell'elenco capitoli"`.

---

### Task 8: Avviso nella scheda fattura

**Files:**
- Modify: `frontend/src/app/pages/invoices/invoice-edit-dialog.component.ts` / `.html`

**Interfaces:**
- Consumes: `ChapterBudgetService.budgetCheck`, `BudgetWarning` (Task 5).

- [ ] **Step 1: implementazione** — nel dialog fattura:

```ts
  private budget = inject(ChapterBudgetService);
  private check$ = new Subject<void>();
  budgetWarnings: BudgetWarning[] = [];

  // nel costruttore, dopo il form:
  this.check$.pipe(
    debounceTime(400),
    switchMap(() => {
      const date = this.form.controls.invoice_date.value as Date | null;
      if (!date || !this.lines.length) return of([] as BudgetWarning[]);
      return this.budget.budgetCheck({
        invoice_id: this.isNew ? null : this.data.item.id,
        invoice_date: toIsoDate(date),
        lines: this.lines.map(l => ({utility_id_fk: l.utility_id_fk ?? null, commitment_id_fk: l.commitment_id_fk ?? null, amount: Number(l.amount) || 0})),
      }).pipe(catchError(() => of([] as BudgetWarning[])));
    }),
  ).subscribe(w => this.budgetWarnings = w);
  this.form.controls.invoice_date.valueChanges.subscribe(() => this.check$.next());
```

`(linesChange)="lines = $event"` diventa `(linesChange)="lines = $event; check$.next()"` (rendere `check$` non privato o esporre `checkBudget()`); in `ngOnInit`, dopo il caricamento delle righe esistenti, `this.check$.next()`. `toIsoDate` da `core/helpers/date.helper`; verificare il nome reale del controllo data nel form (`invoice_date`) e che il valore sia un `Date` (altrimenti usare il giorno così com'è). Template, sotto `<app-invoice-lines-tab>`:

```html
@for (w of budgetWarnings; track w.budget_chapter_id + '-' + w.year) {
  <div class="budget-warning tone-warn">
    <mat-icon>warning</mat-icon>
    Capitolo {{ w.chapter }}: con questa fattura il fatturato {{ w.year }} supera l'assestato ({{ eur(w.invoiced) }} su {{ eur(w.adjusted_budget) }}).
  </div>
}
```

stile `.budget-warning { display: flex; gap: 8px; align-items: center; padding: 8px 12px; border-radius: 6px; margin-top: 12px; }`.

- [ ] **Step 2: compilazione + E2E** — esercizio 2026 su un capitolo con assestato basso (es. 10 €), fattura di prova su un'utenza di quel capitolo con riga da 20 € → avviso; riga a 1 € → avviso sparisce; salvataggio non bloccato. Poi fattura e riga di bilancio di prova eliminate.
- [ ] **Step 3: commit** — `git commit -m "feat(ui): avviso di sforamento dell'assestato nella scheda fattura"`.

---

### Task 9: Documentazione, versione, verifica finale, PR

**Files:**
- Modify: `CLAUDE.md` (riga dei capitoli di spesa: esercizi e calcoli; `apis/spending/chapter-year.ts` condiviso)
- Modify: `docs/roadmap-patrimonio.md` (voci 14 e 20: fatto in v1.14.0; mandati restano)
- Modify: `publiccode.yml` (`softwareVersion: "v1.14.0"`, `releaseDate` di oggi)

- [ ] **Step 1:** aggiornare i tre file.
- [ ] **Step 2:** `docker exec utenzepa-api-1 pnpm exec jest src/apis/spending src/apis/budget-chapter-spending src/apis/anomalies src/apis/budget-chapters --maxWorkers=2` → PASS; `pnpm run build` frontend nel container → nessun errore.
- [ ] **Step 3:** pulizia: nessun utente `e2e_tmp`, nessuna riga di prova (`SELECT ... FROM budget_chapter_spending WHERE year = 2026`, fatture di prova).
- [ ] **Step 4:** commit, push, PR verso `main` con descrizione (cosa cambia, migration, verifica, nessun dato da sistemare prima), `gh pr checks <N> --watch`.

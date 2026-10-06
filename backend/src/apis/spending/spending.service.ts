import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { partyNameSql } from '@apis/third-parties/third-party.name';
import {
  CHAPTER_LINES,
  COMMITMENTS,
  ChapterYear,
  ChapterYearSummary,
  chaptersYearSummary,
  currentYear,
  LINE_CHAPTER,
  LINE_YEAR,
  mergeChapterYears,
  Query,
} from './chapter-year';
import { BudgetCheckDto } from './dto/budget-check.dto';

export interface YearSpending {
  year: number;
  total: number;
  invoices: number;
}

export interface ChapterSummary {
  budget_chapter_id: number | null;
  chapter_code: string | null;
  article: number | null;
  description: string | null;
  utilities: number;
  committed: { year: number; amount: number | null; commitment_id: number }[];
  spent: { year: number; total: number }[];
}

export interface ChapterCommitment {
  id: number;
  contract_id: number;
  fiscal_year: number;
  commitment_number: string | null;
  amount: number | null;
  cig_contract: string | null;
  supplier: string | null;
}

export interface ChapterInvoiceLine {
  id: number;
  invoice_id: number;
  number: string;
  invoice_date: string;
  supplier: string | null;
  utility_id: number | null;
  utility_code: string | null;
  year: number;
  amount: number;
}

export interface BudgetWarning {
  budget_chapter_id: number;
  chapter: string;
  year: number;
  invoiced: number;
  adjusted_budget: number;
}

// Anno di una riga: esercizio dell'impegno, altrimenti anno della fattura.
const YEAR = 'COALESCE(bcm.fiscal_year, YEAR(i.invoice_date))';
const LINES = `FROM invoice_lines il
  JOIN invoices i ON i.id = il.invoice_id_fk AND i.deleted = 0
  LEFT JOIN budget_commitments bcm ON bcm.id = il.commitment_id_fk`;

const toYears = (rows: Record<string, unknown>[]): YearSpending[] =>
  rows.map((r) => ({ year: Number(r.year), total: Number(r.total), invoices: Number(r.invoices) }));

// Spesa calcolata dalle righe fattura (IVA inclusa), mai salvata.
@Injectable()
export class SpendingService {
  constructor(private readonly dataSource: DataSource) {}

  private q: Query = (sql, params) => this.dataSource.query(sql, params);

  // Scheda capitolo: un elemento per esercizio (bilancio, impegni, fatturato).
  async forChapter(chapterId: number): Promise<ChapterYear[]> {
    const budget = await this.q(
      `SELECT id, year, initial_budget, adjusted_budget, amount, notes
       FROM budget_chapter_spending WHERE budget_chapter_id_fk = ? AND deleted = 0`,
      [chapterId],
    );
    const commitments = await this.q(
      `SELECT bcm.fiscal_year AS year, COUNT(*) AS commitments, SUM(bcm.amount) AS total,
              SUM(bcm.amount IS NULL) AS without_amount
       ${COMMITMENTS} WHERE bcm.budget_chapter_id_fk = ? AND bcm.deleted = 0 GROUP BY bcm.fiscal_year`,
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

  // Scheda fattura: capitoli che con queste righe superano l'assestato
  // dell'esercizio. Capitolo ed esercizio di ogni riga con le regole di
  // CHAPTER_LINES; la fattura stessa (già salvata) non si conta due volte.
  async budgetCheck(dto: BudgetCheckDto): Promise<BudgetWarning[]> {
    const ids = (values: (number | null | undefined)[]) => [...new Set(values.filter((v): v is number => !!v))];
    const commitmentIds = ids(dto.lines.map((l) => l.commitment_id_fk));
    const utilityIds = ids(dto.lines.filter((l) => !l.commitment_id_fk).map((l) => l.utility_id_fk));
    const commitments = commitmentIds.length
      ? await this.q(
          'SELECT id, budget_chapter_id_fk AS chapter_id, fiscal_year FROM budget_commitments WHERE id IN (?) AND deleted = 0',
          [commitmentIds],
        )
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
      const chapter = c ? c.chapter_id : line.utility_id_fk ? byUtility.get(line.utility_id_fk)?.chapter_id : null;
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
         WHERE b.id = ? AND b.deleted = 0`,
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
        warnings.push({
          budget_chapter_id: g.chapter,
          chapter: `${b.chapter_code}/${b.article}`,
          year: g.year,
          invoiced,
          adjusted_budget: adjusted,
        });
      }
    }
    return warnings;
  }

  // Elenco capitoli: riepilogo di un esercizio per tutti i capitoli.
  chaptersYear(year: number): Promise<ChapterYearSummary[]> {
    return chaptersYearSummary(this.q, year);
  }

  async forUtility(utilityId: number): Promise<YearSpending[]> {
    return toYears(
      await this.dataSource.query(
        `SELECT ${YEAR} AS year, SUM(il.amount) AS total, COUNT(DISTINCT i.id) AS invoices
         ${LINES}
         WHERE il.utility_id_fk = ?
         GROUP BY year ORDER BY year DESC`,
        [utilityId],
      ),
    );
  }

  // Un'utenza collegata a più immobili conta intera su ciascuno:
  // shared_utilities dice alla UI quante sono, per la nota.
  async forAsset(assetId: number): Promise<{ years: YearSpending[]; shared_utilities: number }> {
    const years = toYears(
      await this.dataSource.query(
        `SELECT ${YEAR} AS year, SUM(il.amount) AS total, COUNT(DISTINCT i.id) AS invoices
         ${LINES}
         JOIN utility_assets ua ON ua.utility_id = il.utility_id_fk AND ua.asset_id = ?
         GROUP BY year ORDER BY year DESC`,
        [assetId],
      ),
    );
    const [{ shared }] = await this.dataSource.query(
      `SELECT COUNT(*) AS shared FROM utility_assets ua
       WHERE ua.asset_id = ?
         AND EXISTS (SELECT 1 FROM utility_assets o WHERE o.utility_id = ua.utility_id AND o.asset_id <> ua.asset_id)`,
      [assetId],
    );
    return { years, shared_utilities: Number(shared) };
  }

  // Per capitolo: utenze attive del contratto, impegni per esercizio, speso
  // dalle fatture del contratto (capitolo dell'impegno, altrimenti
  // dell'utenza della riga).
  async chaptersSummary(contractId: number): Promise<ChapterSummary[]> {
    const byUtility: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT b.id AS budget_chapter_id, b.chapter_code, b.article, b.description, COUNT(*) AS utilities
       FROM contract_utilities cu
       JOIN utilities u ON u.id = cu.utility_id AND u.deleted = 0 AND u.supply_active = 1
       LEFT JOIN budget_chapters b ON b.id = u.budget_chapter_code_fk
       WHERE cu.contract_id = ?
       GROUP BY b.id, b.chapter_code, b.article, b.description
       ORDER BY b.chapter_code, b.article`,
      [contractId],
    );
    const commitments: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT bcm.id, bcm.budget_chapter_id_fk AS budget_chapter_id, bcm.fiscal_year, bcm.amount,
              b.chapter_code, b.article, b.description
       FROM budget_commitments bcm JOIN budget_chapters b ON b.id = bcm.budget_chapter_id_fk
       WHERE bcm.contract_id_fk = ? AND bcm.deleted = 0
       ORDER BY bcm.fiscal_year DESC`,
      [contractId],
    );
    const spent: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT b.id AS budget_chapter_id, b.chapter_code, b.article, b.description,
              ${YEAR} AS year, SUM(il.amount) AS total
       ${LINES}
       LEFT JOIN utilities u ON u.id = il.utility_id_fk
       LEFT JOIN budget_chapters b ON b.id = COALESCE(bcm.budget_chapter_id_fk, u.budget_chapter_code_fk)
       WHERE i.contratto_id_fk = ?
       GROUP BY b.id, b.chapter_code, b.article, b.description, year ORDER BY year DESC`,
      [contractId],
    );

    const key = (v: unknown) => (v === null || v === undefined ? 'null' : String(Number(v)));
    const rows = new Map<string, ChapterSummary>();
    const ensure = (r: Record<string, unknown>): ChapterSummary => {
      const k = key(r.budget_chapter_id);
      let row = rows.get(k);
      if (!row) {
        row = {
          budget_chapter_id: r.budget_chapter_id == null ? null : Number(r.budget_chapter_id),
          chapter_code: (r.chapter_code as string) ?? null,
          article: r.article == null ? null : Number(r.article),
          description: (r.description as string) ?? null,
          utilities: 0,
          committed: [],
          spent: [],
        };
        rows.set(k, row);
      }
      return row;
    };
    byUtility.forEach((r) => (ensure(r).utilities = Number(r.utilities)));
    commitments.forEach((r) =>
      ensure(r).committed.push({
        year: Number(r.fiscal_year),
        amount: r.amount == null ? null : Number(r.amount),
        commitment_id: Number(r.id),
      }),
    );
    spent.forEach((r) => ensure(r).spent.push({ year: Number(r.year), total: Number(r.total) }));
    return [...rows.values()];
  }
}

import { Injectable } from '@nestjs/common';
import { NOT_REJECTED_SQL } from '@apis/invoices/sdi-status';
import { DataSource } from 'typeorm';
import { partyNameSql } from '@apis/third-parties/third-party.name';
import { idList } from '@apis/budget-commitments/id-list';
import { inChargeSql } from '@apis/utility/cost-status';
import {
  CHAPTER_ITEMS,
  COMMITMENT_SPENT,
  COMMITMENTS,
  COMMITMENTS_REMAINING,
  ChapterYear,
  ChapterYearSummary,
  chaptersYearSummary,
  currentYear,
  mergeChapterYears,
  Query,
} from './chapter-year';
import { BudgetCheckDto } from './dto/budget-check.dto';
import { invoiceCompetenceYear, lineFiscalYear, lineYearSql } from './line-year';
import { annualityFor } from '@apis/budget-commitments/annuality';
import { commitmentLabel } from '@apis/budget-commitments/commitment-label';

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

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
  label: string;
  // Prima annualità e tutte le annualità (pluriennale); importi sommati.
  fiscal_year: number;
  fiscal_years: number[];
  amount: number | null;
  spent: number;
  remaining: number | null;
  supplier: string | null;
  contract_ids: number[];
}

// Voce del capitolo: quota d'impegno della fattura (id della quota, senza
// utenza) o riga di una fattura senza quote (id della riga).
export interface ChapterInvoiceLine {
  id: number;
  kind: 'share' | 'line';
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

// Spesa per utenza/immobile: anno = competenza del periodo della riga.
const YEAR = lineYearSql({ line: 'il', invoice: 'i' });
const LINES = `FROM invoice_lines il
  JOIN invoices i ON i.id = il.invoice_id_fk AND i.deleted = 0 AND ${NOT_REJECTED_SQL('i')}`;

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
      `SELECT bcy.fiscal_year AS year, COUNT(*) AS commitments, SUM(bcy.amount) AS total,
              SUM(bcy.amount IS NULL) AS without_amount, ${COMMITMENTS_REMAINING} AS remaining
       ${COMMITMENTS} WHERE bcm.budget_chapter_id_fk = ? AND bcm.deleted = 0 GROUP BY bcy.fiscal_year`,
      [chapterId],
    );
    const invoiced = await this.q(
      `SELECT ci.year, SUM(ci.amount) AS total, COUNT(DISTINCT ci.invoice_id) AS invoices
       ${CHAPTER_ITEMS} WHERE ci.chapter_id = ? GROUP BY ci.year`,
      [chapterId],
    );
    return mergeChapterYears(budget, commitments, invoiced, currentYear());
  }

  async chapterCommitments(chapterId: number): Promise<ChapterCommitment[]> {
    const rows = await this.q(
      `SELECT bcm.id, bcm.commitment_year, bcm.commitment_num, bcm.commitment_sub,
              MIN(bcy.fiscal_year) AS fiscal_year, JSON_ARRAYAGG(bcy.fiscal_year) AS fiscal_years,
              IF(SUM(bcy.amount IS NULL) > 0, NULL, SUM(bcy.amount)) AS amount,
              SUM(${COMMITMENT_SPENT}) AS spent, MAX(${partyNameSql('s')}) AS supplier,
              (SELECT JSON_ARRAYAGG(x.contract_id) FROM budget_commitment_contracts x
                WHERE x.commitment_id = bcm.id) AS contract_ids
       ${COMMITMENTS}
       LEFT JOIN third_parties s ON s.id = bcm.supplier_id_fk
       WHERE bcm.budget_chapter_id_fk = ? AND bcm.deleted = 0
       GROUP BY bcm.id
       ORDER BY fiscal_year DESC, bcm.commitment_num IS NULL, bcm.commitment_year, bcm.commitment_num, bcm.commitment_sub`,
      [chapterId],
    );
    return rows.map((r) => {
      const amount = r.amount == null ? null : Number(r.amount);
      const spent = Math.round(Number(r.spent ?? 0) * 100) / 100;
      return {
        id: Number(r.id),
        label: commitmentLabel(num(r.commitment_year), num(r.commitment_num), num(r.commitment_sub)),
        fiscal_year: Number(r.fiscal_year),
        fiscal_years: idList(r.fiscal_years),
        amount,
        spent,
        remaining: amount === null ? null : Math.round((amount - spent) * 100) / 100,
        supplier: (r.supplier as string) ?? null,
        contract_ids: idList(r.contract_ids),
      };
    });
  }

  async chapterInvoiceLines(chapterId: number): Promise<ChapterInvoiceLine[]> {
    const rows = await this.q(
      `SELECT ci.share_id, ci.line_id, i.id AS invoice_id, i.invoice_id AS number,
              DATE_FORMAT(i.invoice_date, '%Y-%m-%d') AS invoice_date,
              ${partyNameSql('tp')} AS supplier, u.id AS utility_id, u.utility_id AS utility_code,
              ci.year, ci.amount
       ${CHAPTER_ITEMS}
       LEFT JOIN third_parties tp ON tp.id = i.supplier_id_fk
       LEFT JOIN utilities u ON u.id = ci.utility_id
       WHERE ci.chapter_id = ?
       ORDER BY i.invoice_date DESC, i.id DESC, ci.share_id, ci.line_id`,
      [chapterId],
    );
    return rows.map((r) => ({
      id: Number(r.line_id ?? r.share_id),
      kind: r.line_id == null ? ('share' as const) : ('line' as const),
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

  // Scheda fattura: capitoli che con questa fattura superano l'assestato
  // dell'esercizio, con le regole di CHAPTER_ITEMS: con quote, capitolo
  // dell'impegno e annualità della quota (omessa = la più vicina alla
  // competenza della fattura); senza, righe per capitolo dell'utenza e
  // competenza della riga. La fattura stessa (già salvata) non si conta due volte.
  async budgetCheck(dto: BudgetCheckDto): Promise<BudgetWarning[]> {
    const ids = (values: (number | null | undefined)[]) => [...new Set(values.filter((v): v is number => !!v))];
    const groups = new Map<string, { chapter: number; year: number; amount: number }>();
    const add = (chapter: unknown, year: number, amount: unknown) => {
      if (chapter === null || chapter === undefined) return;
      const key = `${chapter}-${year}`;
      const g = groups.get(key) ?? { chapter: Number(chapter), year, amount: 0 };
      g.amount += Number(amount) || 0;
      groups.set(key, g);
    };

    const shares = dto.commitment_shares ?? [];
    if (shares.length) {
      const commitmentIds = ids(shares.map((s) => s.commitment_id_fk));
      const commitments = commitmentIds.length
        ? await this.q(
            'SELECT bcm.id, bcm.budget_chapter_id_fk AS chapter_id, JSON_ARRAYAGG(bcy.fiscal_year) AS years ' +
              `${COMMITMENTS} WHERE bcm.id IN (?) AND bcm.deleted = 0 GROUP BY bcm.id`,
            [commitmentIds],
          )
        : [];
      const byCommitment = new Map(commitments.map((c) => [Number(c.id), c] as const));
      const competence = this.invoiceCompetence(dto);
      for (const share of shares) {
        const c = byCommitment.get(share.commitment_id_fk);
        if (!c) continue;
        const year = share.fiscal_year ?? annualityFor(idList(c.years), competence) ?? competence;
        add(c.chapter_id, year, share.amount);
      }
    } else {
      const utilityIds = ids(dto.lines.map((l) => l.utility_id_fk));
      const utilities = utilityIds.length
        ? await this.q('SELECT id, budget_chapter_code_fk AS chapter_id FROM utilities WHERE id IN (?)', [utilityIds])
        : [];
      const byUtility = new Map(utilities.map((u) => [Number(u.id), u] as const));
      for (const line of dto.lines) {
        const chapter = line.utility_id_fk ? byUtility.get(line.utility_id_fk)?.chapter_id : null;
        add(chapter, lineFiscalYear(line.period_start ?? null, line.period_end ?? null, dto.invoice_date), line.amount);
      }
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
        `SELECT COALESCE(SUM(ci.amount), 0) AS total ${CHAPTER_ITEMS}
         WHERE ci.chapter_id = ? AND ci.year = ? AND i.id <> ?`,
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

  // Competenza della fattura: periodo dal primo inizio all'ultima fine delle
  // righe (stessa regola del ricalcolo delle quote).
  private invoiceCompetence(dto: BudgetCheckDto): number {
    return invoiceCompetenceYear(
      dto.lines.map((l) => ({ period_start: l.period_start ?? null, period_end: l.period_end ?? null })),
      dto.invoice_date,
    );
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

  // Per capitolo: utenze in carico al Comune (attive e non volturate) del
  // contratto, impegni per esercizio, speso dalle fatture del contratto
  // (voci di CHAPTER_ITEMS: quote, altrimenti righe con il capitolo dell'utenza).
  async chaptersSummary(contractId: number): Promise<ChapterSummary[]> {
    const byUtility: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT b.id AS budget_chapter_id, b.chapter_code, b.article, b.description, COUNT(*) AS utilities
       FROM contract_utilities cu
       JOIN utilities u ON u.id = cu.utility_id AND u.deleted = 0 AND ${inChargeSql('u')}
       LEFT JOIN budget_chapters b ON b.id = u.budget_chapter_code_fk
       WHERE cu.contract_id = ?
       GROUP BY b.id, b.chapter_code, b.article, b.description
       ORDER BY b.chapter_code, b.article`,
      [contractId],
    );
    const commitments: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT bcm.id, bcm.budget_chapter_id_fk AS budget_chapter_id, bcy.fiscal_year, bcy.amount,
              b.chapter_code, b.article, b.description
       ${COMMITMENTS} JOIN budget_chapters b ON b.id = bcm.budget_chapter_id_fk
       JOIN budget_commitment_contracts bcc ON bcc.commitment_id = bcm.id AND bcc.contract_id = ?
       WHERE bcm.deleted = 0
       ORDER BY bcy.fiscal_year DESC`,
      [contractId],
    );
    const spent: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT b.id AS budget_chapter_id, b.chapter_code, b.article, b.description,
              ci.year, SUM(ci.amount) AS total
       ${CHAPTER_ITEMS}
       LEFT JOIN budget_chapters b ON b.id = ci.chapter_id
       WHERE i.contratto_id_fk = ?
       GROUP BY b.id, b.chapter_code, b.article, b.description, ci.year ORDER BY ci.year DESC`,
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

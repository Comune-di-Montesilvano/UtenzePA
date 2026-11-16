import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { idList } from '@apis/budget-commitments/id-list';
import {
  ChapterYear,
  ChapterYearSummary,
  chaptersYearSummary,
  currentYear,
  mergeChapterYears,
} from './chapter-year';
import {
  chapterInvoiced,
  chapterItems,
  chapterYearInvoiced,
  contractSpent,
} from './chapter-items.sql';
import * as q from './spending.queries';
import { BudgetCheckDto } from './dto/budget-check.dto';
import { invoiceCompetenceYear, lineFiscalYear } from './line-year';
import { annualityFor } from '@apis/budget-commitments/annuality';
import { commitmentLabel } from '@apis/budget-commitments/commitment-label';
import {
  type ConsumptionRecord,
  fromDay,
  todayDay,
} from '@apis/utility-consumptions/consumption-calculator';
import { HardTypeEnum } from '@apis/utility-types/enum/hard-type.enum';
import {
  type ChapterUtilityStats,
  chapterUtilityStats,
  periodWindows,
  type StatsPeriod,
} from './chapter-utility-stats';

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

const toYears = (rows: Record<string, unknown>[]): YearSpending[] =>
  rows.map((r) => ({ year: Number(r.year), total: Number(r.total), invoices: Number(r.invoices) }));

// Spesa calcolata dalle righe fattura (IVA inclusa), mai salvata.
@Injectable()
export class SpendingService {
  constructor(private readonly dataSource: DataSource) {}

  private get m() {
    return this.dataSource.manager;
  }

  // Scheda capitolo: un elemento per esercizio (bilancio, impegni, fatturato).
  async forChapter(chapterId: number): Promise<ChapterYear[]> {
    const budget = await q.chapterBudgets(this.m, chapterId);
    const commitments = await q.chapterCommitted(this.m, chapterId);
    const invoiced = await chapterInvoiced(this.m, chapterId);
    return mergeChapterYears(budget, commitments, invoiced, currentYear());
  }

  async chapterCommitments(chapterId: number): Promise<ChapterCommitment[]> {
    const rows = await q.chapterCommitments(this.m, chapterId);
    return rows.map((r) => {
      const amount = r.amount == null ? null : Number(r.amount);
      const spent = Math.round(Number(r.spent ?? 0) * 100) / 100;
      return {
        id: Number(r.id),
        label: commitmentLabel(
          num(r.commitment_year),
          num(r.commitment_num),
          num(r.commitment_sub),
        ),
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
    const rows = await chapterItems(this.m, chapterId);
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

  // Scheda capitolo → Utenze: statistiche delle utenze oggi sul capitolo nel
  // periodo, con gli anni che hanno fatture per il selettore.
  async chapterUtilityStats(
    chapterId: number,
    period: StatsPeriod,
  ): Promise<ChapterUtilityStats & { years: number[] }> {
    const utilities = await q.chapterUtilities(this.m, chapterId);
    const ids = utilities.map((u) => Number(u.id));
    const today = todayDay();
    const { current, previous } = periodWindows(period, today);
    const lines = ids.length
      ? await q.utilityLines(this.m, ids, fromDay(previous.start), fromDay(current.end))
      : [];
    const consumptions = ids.length ? await q.utilityConsumptions(this.m, ids) : [];
    const years = ids.length ? await q.utilityLineYears(this.m, ids) : [];

    const byUtility = <T extends Record<string, unknown>>(rows: T[]) => {
      const map = new Map<number, T[]>();
      rows.forEach((r) =>
        map.set(Number(r.utility_id), [...(map.get(Number(r.utility_id)) ?? []), r]),
      );
      return map;
    };
    const linesOf = byUtility(lines);
    const consumptionsOf = byUtility(consumptions);
    const stats = chapterUtilityStats(
      utilities.map((u) => ({
        id: Number(u.id),
        utility_code: (u.utility_code as string) ?? null,
        type_name: (u.type_name as string) ?? null,
        hard_type: (u.hard_type as HardTypeEnum) ?? null,
        active: u.supply_active === null || Number(u.supply_active) !== 0,
        lines: (linesOf.get(Number(u.id)) ?? []).map((l) => ({
          amount: Number(l.amount),
          period_start: (l.period_start as string) ?? null,
          period_end: (l.period_end as string) ?? null,
          invoice_date: String(l.invoice_date),
        })),
        consumptions: (consumptionsOf.get(Number(u.id)) ?? []).map((c) => ({
          ...c,
          id: Number(c.id),
          is_estimated: Number(c.is_estimated) === 1,
        })) as ConsumptionRecord[],
      })),
      period,
      today,
    );
    const yearList = new Set(years.map((y) => Number(y.year)));
    yearList.add(currentYear());
    return { ...stats, years: [...yearList].sort((a, b) => b - a) };
  }

  // Scheda fattura: capitoli che con questa fattura superano l'assestato
  // dell'esercizio, con le regole di CHAPTER_ITEMS: con quote, capitolo
  // dell'impegno e annualità della quota (omessa = la più vicina alla
  // competenza della fattura); senza, righe per capitolo dell'utenza e
  // competenza della riga. La fattura stessa (già salvata) non si conta due volte.
  async budgetCheck(dto: BudgetCheckDto): Promise<BudgetWarning[]> {
    const ids = (values: (number | null | undefined)[]) => [
      ...new Set(values.filter((v): v is number => !!v)),
    ];
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
        ? await q.commitmentChapters(this.m, commitmentIds)
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
      const utilities = utilityIds.length ? await q.utilityChapters(this.m, utilityIds) : [];
      const byUtility = new Map(utilities.map((u) => [Number(u.id), u] as const));
      for (const line of dto.lines) {
        const chapter = line.utility_id_fk ? byUtility.get(line.utility_id_fk)?.chapter_id : null;
        add(
          chapter,
          lineFiscalYear(line.period_start ?? null, line.period_end ?? null, dto.invoice_date),
          line.amount,
        );
      }
    }

    const warnings: BudgetWarning[] = [];
    for (const g of groups.values()) {
      const b = await q.chapterBudget(this.m, g.chapter, g.year);
      if (!b || b.adjusted_budget == null) continue;
      const total = await chapterYearInvoiced(this.m, g.chapter, g.year, dto.invoice_id ?? 0);
      const invoiced = Math.round((total + g.amount) * 100) / 100;
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
      dto.lines.map((l) => ({
        period_start: l.period_start ?? null,
        period_end: l.period_end ?? null,
      })),
      dto.invoice_date,
    );
  }

  // Elenco capitoli: riepilogo di un esercizio per tutti i capitoli.
  chaptersYear(year: number): Promise<ChapterYearSummary[]> {
    return chaptersYearSummary(this.m, year);
  }

  async forUtility(utilityId: number): Promise<YearSpending[]> {
    return toYears(await q.utilityYears(this.m, utilityId));
  }

  // Un'utenza collegata a più immobili conta intera su ciascuno:
  // shared_utilities dice alla UI quante sono, per la nota.
  async forAsset(assetId: number): Promise<{ years: YearSpending[]; shared_utilities: number }> {
    const years = toYears(await q.assetYears(this.m, assetId));
    return { years, shared_utilities: await q.sharedUtilities(this.m, assetId) };
  }

  // Per capitolo: utenze in carico al Comune (attive e non volturate) del
  // contratto, impegni per esercizio, speso dalle fatture del contratto
  // (voci di CHAPTER_ITEMS: quote, altrimenti righe con il capitolo dell'utenza).
  async chaptersSummary(contractId: number): Promise<ChapterSummary[]> {
    const byUtility = await q.contractUtilityChapters(this.m, contractId);
    const commitments = await q.contractCommitments(this.m, contractId);
    const spent = await contractSpent(this.m, contractId);

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

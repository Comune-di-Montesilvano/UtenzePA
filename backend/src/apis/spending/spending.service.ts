import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

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
      `SELECT COALESCE(bcm.budget_chapter_id_fk, u.budget_chapter_code_fk) AS budget_chapter_id,
              ${YEAR} AS year, SUM(il.amount) AS total
       ${LINES}
       LEFT JOIN utilities u ON u.id = il.utility_id_fk
       WHERE i.contratto_id_fk = ?
       GROUP BY budget_chapter_id, year ORDER BY year DESC`,
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

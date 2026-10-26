import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AccChapterRow, AccCommitmentRow, AccLiquidationRow } from './accounting-csv';
import { computeScope, type AccountingScope } from './scope';

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

// Fornitori del perimetro: soggetti terzi con almeno un contratto di fornitura
// (stessa regola dell'import PEC). Chiave = P.IVA, altrimenti codice fiscale.
const SUPPLIERS_SQL =
  'SELECT t.id, COALESCE(NULLIF(t.vat_number, ""), t.tax_code) AS vat FROM third_parties t ' +
  'WHERE t.deleted = 0 AND COALESCE(NULLIF(t.vat_number, ""), t.tax_code) IS NOT NULL ' +
  'AND EXISTS (SELECT 1 FROM contracts c WHERE c.supplier_id_fk = t.id AND c.deleted = 0)';

// Lettura delle tabelle di appoggio con i tipi del formato neutro (i decimal
// arrivano da MySQL come stringhe) e calcolo del perimetro: in comune a tutti
// gli applicatori.
@Injectable()
export class AccountingDataService {
  constructor(private readonly dataSource: DataSource) {}

  async chapters(): Promise<AccChapterRow[]> {
    const rows = await this.dataSource.query(
      'SELECT year, chapter, article, description, initial_budget, adjusted_budget, spent FROM acc_chapters',
    );
    return rows.map((r: Record<string, unknown>) => ({
      year: Number(r.year),
      chapter: String(r.chapter),
      article: Number(r.article),
      description: (r.description as string | null) ?? null,
      initial_budget: num(r.initial_budget),
      adjusted_budget: num(r.adjusted_budget),
      spent: num(r.spent),
    }));
  }

  async commitments(): Promise<AccCommitmentRow[]> {
    const rows = await this.dataSource.query(
      'SELECT commitment_year, commitment_num, commitment_sub, fiscal_year, chapter, article, supplier_vat, amount, ' +
        'cig, cancelled, description FROM acc_commitments',
    );
    return rows.map((r: Record<string, unknown>) => ({
      commitment_year: Number(r.commitment_year),
      commitment_num: Number(r.commitment_num),
      commitment_sub: Number(r.commitment_sub),
      fiscal_year: Number(r.fiscal_year),
      chapter: String(r.chapter),
      article: Number(r.article),
      supplier_vat: (r.supplier_vat as string | null) ?? null,
      amount: Number(r.amount),
      cig: (r.cig as string | null) ?? null,
      cancelled: !!Number(r.cancelled),
      description: (r.description as string | null) ?? null,
    }));
  }

  async liquidations(): Promise<AccLiquidationRow[]> {
    const rows = await this.dataSource.query(
      'SELECT liquidation_key, commitment_year, commitment_num, commitment_sub, fiscal_year, sdi_identifier, ' +
        "invoice_number, DATE_FORMAT(invoice_date, '%Y-%m-%d') AS invoice_date, invoice_total, invoice_cig, " +
        'supplier_vat, amount, cancelled FROM acc_liquidations',
    );
    return rows.map((r: Record<string, unknown>) => ({
      liquidation_key: String(r.liquidation_key),
      commitment_year: Number(r.commitment_year),
      commitment_num: Number(r.commitment_num),
      commitment_sub: Number(r.commitment_sub),
      fiscal_year: Number(r.fiscal_year),
      sdi_identifier: (r.sdi_identifier as string | null) ?? null,
      invoice_number: (r.invoice_number as string | null) ?? null,
      invoice_date: (r.invoice_date as string | null) ?? null,
      invoice_total: num(r.invoice_total),
      invoice_cig: (r.invoice_cig as string | null) ?? null,
      supplier_vat: (r.supplier_vat as string | null) ?? null,
      amount: Number(r.amount),
      cancelled: !!Number(r.cancelled),
    }));
  }

  // P.IVA (o CF) → id del soggetto terzo, solo fornitori del perimetro.
  async suppliersByVat(): Promise<Map<string, number>> {
    const rows: { id: number; vat: string }[] = await this.dataSource.query(SUPPLIERS_SQL);
    return new Map(rows.map((r) => [r.vat, Number(r.id)]));
  }

  // P.IVA (o CF) → id di qualsiasi soggetto terzo non cancellato: fornitore
  // dell'impegno anche fuori dal perimetro.
  async thirdPartiesByVat(): Promise<Map<string, number>> {
    const rows: { id: number; vat: string }[] = await this.dataSource.query(
      'SELECT id, COALESCE(NULLIF(vat_number, ""), tax_code) AS vat FROM third_parties ' +
        'WHERE deleted = 0 AND COALESCE(NULLIF(vat_number, ""), tax_code) IS NOT NULL',
    );
    return new Map(rows.map((r) => [r.vat, Number(r.id)]));
  }

  async scope(): Promise<AccountingScope> {
    const [commitments, liquidations, suppliers, chapters] = await Promise.all([
      this.commitments(),
      this.liquidations(),
      this.suppliersByVat(),
      this.dataSource.query('SELECT chapter_code, article FROM budget_chapters WHERE deleted = 0'),
    ]);
    return computeScope(
      { commitments, liquidations },
      new Set(suppliers.keys()),
      chapters.map((c: { chapter_code: string; article: number }) => ({
        chapter_code: c.chapter_code,
        article: Number(c.article),
      })),
    );
  }
}

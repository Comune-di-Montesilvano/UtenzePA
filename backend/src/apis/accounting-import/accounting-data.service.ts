import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type {
  AccChapterRow,
  AccCommitmentRow,
  AccCreditNoteRow,
  AccLiquidationRow,
} from './accounting-csv';
import { computeScope, type AccountingScope } from './scope';
import * as q from './accounting-import.queries';

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

// Lettura delle tabelle di appoggio con i tipi del formato neutro (i decimal
// arrivano da MySQL come stringhe) e calcolo del perimetro: in comune a tutti
// gli applicatori.
@Injectable()
export class AccountingDataService {
  constructor(private readonly dataSource: DataSource) {}

  private get m() {
    return this.dataSource.manager;
  }

  async chapters(): Promise<AccChapterRow[]> {
    const rows = await q.accChapters(this.m);
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
    const rows = await q.accCommitments(this.m);
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
    const rows = await q.accLiquidations(this.m);
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
      liquidation_number: (r.liquidation_number as string | null) ?? null,
      mandate_number: (r.mandate_number as string | null) ?? null,
      mandate_date: (r.mandate_date as string | null) ?? null,
      paid_date: (r.paid_date as string | null) ?? null,
      paid_amount: num(r.paid_amount),
    }));
  }

  async creditNotes(): Promise<AccCreditNoteRow[]> {
    const rows = await q.accCreditNotes(this.m);
    return rows.map((r: Record<string, unknown>) => ({
      link_key: String(r.link_key),
      fiscal_year: Number(r.fiscal_year),
      amount: Number(r.amount),
      supplier_vat: (r.supplier_vat as string | null) ?? null,
      note_sdi_identifier: (r.note_sdi_identifier as string | null) ?? null,
      note_number: (r.note_number as string | null) ?? null,
      note_date: (r.note_date as string | null) ?? null,
      note_total: num(r.note_total),
      invoice_sdi_identifier: (r.invoice_sdi_identifier as string | null) ?? null,
      invoice_number: (r.invoice_number as string | null) ?? null,
      invoice_date: (r.invoice_date as string | null) ?? null,
      invoice_total: num(r.invoice_total),
    }));
  }

  // P.IVA (o CF) → id del soggetto terzo, solo fornitori del perimetro.
  async suppliersByVat(): Promise<Map<string, number>> {
    const rows = await q.suppliersInScope(this.m);
    return new Map(rows.map((r) => [r.vat, Number(r.id)]));
  }

  // P.IVA (o CF) → id di qualsiasi soggetto terzo non cancellato: fornitore
  // dell'impegno anche fuori dal perimetro.
  async thirdPartiesByVat(): Promise<Map<string, number>> {
    const rows = await q.partiesWithVat(this.m);
    return new Map(rows.map((r) => [r.vat, Number(r.id)]));
  }

  async scope(): Promise<AccountingScope> {
    const [commitments, liquidations, suppliers, chapters] = await Promise.all([
      this.commitments(),
      this.liquidations(),
      this.suppliersByVat(),
      q.liveChapters(this.m),
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

import type { AccLiquidationRow } from './accounting-csv';
import { normalizeInvoiceNumber } from './invoice-number';

export interface MatchableInvoice {
  id: number;
  supplier_vat: string | null;
  invoice_number: string;
  invoice_date: string;
  sdi_identifier: string | null;
}

export const invoiceKey = (vat: string, number: string, date: string): string =>
  `${vat}|${normalizeInvoiceNumber(number)}|${date}`;

// Liquidazione → fattura: prima per IdentificativoSdI (in un lotto SDI più
// fatture hanno lo stesso identificativo: lì vale il numero normalizzato), poi
// per P.IVA del fornitore + numero normalizzato + data. Le fatture passate sono
// già solo quelle non cancellate e non rifiutate.
export function matchInvoices(
  liquidations: AccLiquidationRow[],
  invoices: MatchableInvoice[],
): Map<string, number> {
  const bySdi = new Map<string, MatchableInvoice[]>();
  const byNumber = new Map<string, number>();
  for (const i of invoices) {
    if (i.sdi_identifier) bySdi.set(i.sdi_identifier, [...(bySdi.get(i.sdi_identifier) ?? []), i]);
    if (i.supplier_vat) {
      const key = invoiceKey(i.supplier_vat, i.invoice_number, i.invoice_date);
      if (!byNumber.has(key)) byNumber.set(key, i.id);
    }
  }
  const sdiMatch = (l: AccLiquidationRow): number | undefined => {
    const found = l.sdi_identifier ? (bySdi.get(l.sdi_identifier) ?? []) : [];
    if (found.length === 1) return found[0].id;
    const number = l.invoice_number ? normalizeInvoiceNumber(l.invoice_number) : null;
    return found.find((i) => normalizeInvoiceNumber(i.invoice_number) === number)?.id;
  };
  const result = new Map<string, number>();
  for (const l of liquidations) {
    const id =
      sdiMatch(l) ??
      (l.supplier_vat && l.invoice_number && l.invoice_date
        ? byNumber.get(invoiceKey(l.supplier_vat, l.invoice_number, l.invoice_date))
        : undefined);
    if (id !== undefined) result.set(l.liquidation_key, id);
  }
  return result;
}

import { contractOwnInvoices } from './invoices-tab.component';
import { Invoice } from './entity/invoice.entity';

const inv = (id: number, utilities: number, contractLines: number, linesTotal: number | null): Invoice =>
  ({ id, utilities_count: utilities, contract_lines_count: contractLines, lines_total: linesTotal }) as Invoice;

describe('contractOwnInvoices', () => {
  it('contratto diviso per utenza: solo le fatture con righe senza utenza', () => {
    const list = [inv(1, 3, 0, 100), inv(2, 0, 1, 20), inv(3, 0, 0, null), inv(4, 1, 1, 50)];
    expect(contractOwnInvoices(list).map(i => i.id)).toEqual([2]);
  });

  it('contratto di soli canoni: anche le fatture senza righe', () => {
    const list = [inv(1, 0, 0, null), inv(2, 0, 2, 40)];
    expect(contractOwnInvoices(list).map(i => i.id)).toEqual([1, 2]);
  });

  it('nessuna fattura del contratto in sé', () => {
    expect(contractOwnInvoices([inv(1, 2, 0, 10)])).toEqual([]);
  });
});

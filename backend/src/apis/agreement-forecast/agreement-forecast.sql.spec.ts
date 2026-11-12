import { NOT_OFFSET_SQL } from '@apis/invoices/enum/payment-status.enum';
import { NOT_REJECTED_SQL } from '@apis/invoices/sdi-status';
import { COMMITMENT_SPENT } from '@apis/spending/chapter-year';
import * as sql from './agreement-forecast.sql';

describe('agreement-forecast.sql', () => {
  it('ordini: tutti i contratti non cancellati della convenzione, bozze comprese', () => {
    expect(sql.ORDERS_SQL).toContain('c.deleted = 0');
    expect(sql.ORDERS_SQL).toContain('c.consip_agreement_id = ?');
    expect(sql.ORDERS_SQL).not.toContain('draft = 0');
    expect(sql.ORDERS_SQL).not.toContain('closed = 0');
  });

  it('righe: solo fatture valide, non rifiutate e non compensate', () => {
    expect(sql.LINES_SQL).toContain('i.deleted = 0');
    expect(sql.LINES_SQL).toContain(NOT_REJECTED_SQL('i'));
    expect(sql.LINES_SQL).toContain(NOT_OFFSET_SQL('i'));
  });

  it('impegnato: annualità degli impegni collegati a un ordine della convenzione, con la rimanenza', () => {
    expect(sql.COMMITTED_SQL).toContain(COMMITMENT_SPENT);
    expect(sql.COMMITTED_SQL).toContain('budget_commitment_contracts');
    expect(sql.COMMITTED_SQL).toContain('bcm.deleted = 0');
    expect(sql.COMMITTED_SQL).toContain('GROUP BY bcm.budget_chapter_id_fk, bcy.fiscal_year');
  });

  it('convenzioni da ricalcolare: almeno un ordine non chiuso', () => {
    expect(sql.OPEN_AGREEMENTS_SQL).toContain('c.closed = 0');
    expect(sql.OPEN_AGREEMENTS_SQL).toContain('a.deleted = 0');
  });

  it('nessuna query passa dal CIG', () => {
    for (const [name, text] of Object.entries(sql)) {
      expect(`${name}: ${String(text).toLowerCase().includes('cig')}`).toBe(`${name}: false`);
    }
  });
});

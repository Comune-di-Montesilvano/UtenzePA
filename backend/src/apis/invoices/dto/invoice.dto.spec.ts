import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateInvoiceDto } from './create-invoice.dto';
import { UpdateInvoiceDto } from './update-invoice.dto';
import { SearchInvoiceDto } from './search-invoice.dto';

const errors = (cls: new () => object, body: object) =>
  validateSync(plainToInstance(cls, body) as object, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

describe('DTO fattura', () => {
  const aca = {
    invoice_id: 'F-1',
    invoice_date: '2025-03-15',
    total_amount: 120.5,
    lines: [{ amount: 120.5, utility_id_fk: 3 }],
  };

  it('fattura senza protocollo, imponibile e contratto è valida (caso ACA)', () => {
    expect(errors(CreateInvoiceDto, aca)).toEqual([]);
    expect(errors(UpdateInvoiceDto, aca)).toEqual([]);
  });

  it('riga senza importo non è valida', () => {
    expect(errors(CreateInvoiceDto, { ...aca, lines: [{ utility_id_fk: 3 }] })).not.toEqual([]);
  });

  it('periodo della riga con date AAAA-MM-GG', () => {
    const dto = plainToInstance(CreateInvoiceDto, {
      ...aca,
      lines: [{ amount: 1, period_start: '2025-01-01T23:00:00.000Z', period_end: '2025-02-28' }],
    });
    expect(dto.lines[0].period_start).toBe('2025-01-01');
    expect(validateSync(dto)).toEqual([]);
  });

  it('ricerca: deleted=false in query string resta false (solo fatture attive)', () => {
    expect(plainToInstance(SearchInvoiceDto, { deleted: 'false' }).deleted).toBe(false);
    expect(plainToInstance(SearchInvoiceDto, { deleted: 'true' }).deleted).toBe(true);
  });
});

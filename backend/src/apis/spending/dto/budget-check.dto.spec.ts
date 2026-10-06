import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BudgetCheckDto } from './budget-check.dto';

describe('BudgetCheckDto', () => {
  const dto = (n: number) =>
    plainToInstance(BudgetCheckDto, {
      invoice_date: '2026-03-01',
      lines: Array.from({ length: n }, () => ({ utility_id_fk: 1, amount: 1 })),
    });

  it('accetta fino a 500 righe', async () => {
    expect((await validate(dto(500))).filter((e) => e.property === 'lines')).toEqual([]);
  });

  it('rifiuta oltre 500 righe', async () => {
    expect((await validate(dto(501))).filter((e) => e.property === 'lines')).not.toEqual([]);
  });
});

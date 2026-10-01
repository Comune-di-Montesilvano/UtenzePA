import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateUtilityConsumptionDto } from './create-utility-consumption.dto';

describe('CreateUtilityConsumptionDto', () => {
  const errorsFor = async (payload: Record<string, unknown>) =>
    (await validate(plainToInstance(CreateUtilityConsumptionDto, payload))).map((e) => e.property);

  it('rifiuta una data inesistente (30 febbraio)', async () => {
    const errors = await errorsFor({ kind: 'READING', reading_date: '2026-02-30', reading_value: 5, meter_number: 'M1' });
    expect(errors).toContain('reading_date');
  });

  it('accetta una data valida', async () => {
    const errors = await errorsFor({ kind: 'PERIOD', period_start: '2026-02-01', period_end: '2026-02-28', consumption: 5 });
    expect(errors).toEqual([]);
  });
});

import { plainToInstance } from 'class-transformer';
import { IsOptional, validateSync } from 'class-validator';
import { DateOnly } from './date-only.decorator';

class Dto {
  @IsOptional()
  @DateOnly()
  day?: string | null;
}

const parse = (day: unknown) => {
  const dto = plainToInstance(Dto, { day });
  return { day: dto.day, errors: validateSync(dto) };
};

describe('DateOnly', () => {
  it('tiene il giorno ricevuto, senza spostarlo', () => {
    expect(parse('2025-03-31')).toEqual({ day: '2025-03-31', errors: [] });
  });

  it('tronca un ISO completo ai primi 10 caratteri, senza conversioni di fuso', () => {
    expect(parse('2025-03-31T22:00:00.000Z').day).toBe('2025-03-31');
  });

  it('stringa vuota = null (campo svuotato)', () => {
    expect(parse('')).toEqual({ day: null, errors: [] });
  });

  it('rifiuta date inesistenti o in altro formato', () => {
    expect(parse('2025-02-30').errors).toHaveLength(1);
    expect(parse('31/03/2025').errors).toHaveLength(1);
    expect(parse(20250331).errors).toHaveLength(1);
  });
});

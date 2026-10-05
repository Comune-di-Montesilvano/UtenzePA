import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { ValidateBy, isDateString } from 'class-validator';

// Intervallo di date 'AAAA-MM-GG' come [da, a]: da query string 'da,a'.
// Le posizioni restano fisse ('…,a' = solo "a", null in prima posizione):
// togliere i vuoti trasformava un "fino al" in un "dal".
export function DateRange() {
  return applyDecorators(
    Transform(({ value }) => {
      if (value === undefined || value === null || value === '') return undefined;
      const parts: unknown[] = Array.isArray(value) ? value : String(value).split(',');
      const range = [parts[0], parts[1]].map((v) =>
        typeof v === 'string' && v.trim() ? v.trim() : null,
      );
      return range.some(Boolean) ? range : undefined;
    }),
    ValidateBy({
      name: 'dateRange',
      validator: {
        validate: (value: unknown) =>
          Array.isArray(value) &&
          value.every((v) => v === null || isDateString(v, { strict: true })),
        defaultMessage: () => 'Intervallo di date non valido (formato AAAA-MM-GG).',
      },
    }),
  );
}

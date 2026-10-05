import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsDateString } from 'class-validator';
import { DateHelper } from '@/helpers/date.helpers';

// Data di calendario 'AAAA-MM-GG': il client manda il giorno locale e il
// backend lo salva così com'è (stringa vuota = null). Mai passare da Date:
// il fuso del server sposterebbe il giorno.
export function DateOnly() {
  return applyDecorators(
    Transform(({ value }) => DateHelper.dateOnly(value)),
    IsDateString({ strict: true }, { message: 'Data non valida (formato AAAA-MM-GG).' }),
  );
}

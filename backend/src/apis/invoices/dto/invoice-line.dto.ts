import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { DateOnly } from '@/common/decorators/date-only.decorator';

// Riga di fattura: solo l'importo (IVA inclusa) è obbligatorio.
export class InvoiceLineDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "L'importo della riga è obbligatorio." })
  amount: number;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  utility_id_fk?: number | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  commitment_id_fk?: number | null;

  @IsOptional()
  @DateOnly()
  period_start?: string | null;

  @IsOptional()
  @DateOnly()
  period_end?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  consumption?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  supply_code?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string | null;
}

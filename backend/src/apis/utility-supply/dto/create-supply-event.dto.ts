import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, ValidateIf } from 'class-validator';
import { DateOnly } from '@/common/decorators/date-only.decorator';
import { SupplyEventType } from '../enum/supply-event-type.enum';

// Un cambiamento dello storico inserito a mano (anche già avvenuto: si
// compila direttamente la data effettiva).
export class CreateSupplyEventDto {
  @Type(() => Number)
  @IsInt({ message: 'Utenza obbligatoria.' })
  utility_id_fk: number;

  @IsEnum(SupplyEventType, { message: 'Tipo di cambiamento non valido.' })
  type: SupplyEventType;

  // Solo TRANSFER.
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @Type(() => Number)
  @IsInt()
  third_party_id_fk?: number | null;

  @IsOptional()
  @DateOnly()
  requested_on?: string | null;

  @IsOptional()
  @DateOnly()
  effective_on?: string | null;

  @IsOptional()
  @IsBoolean()
  date_unknown?: boolean;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  notes?: string | null;
}

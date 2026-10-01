import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ConsumptionKind } from '../enum/consumption-kind.enum';

// PATCH parziale: la completezza del record risultante (merge con quello
// persistito) è verificata da validateConsumption nel service.
export class UpdateUtilityConsumptionDto {
  @IsOptional()
  @IsEnum(ConsumptionKind)
  kind?: ConsumptionKind;

  @IsOptional()
  @IsDateString({ strict: true })
  reading_date?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  reading_value?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  meter_number?: string | null;

  @IsOptional()
  @IsDateString({ strict: true })
  period_start?: string | null;

  @IsOptional()
  @IsDateString({ strict: true })
  period_end?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  consumption?: number | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

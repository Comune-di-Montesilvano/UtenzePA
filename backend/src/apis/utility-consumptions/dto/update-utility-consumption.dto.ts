import { Type } from 'class-transformer';
import {
  IsBoolean,
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

  // Fasce e penale: solo periodi di utenze elettriche, il service le azzera altrove.
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  consumption_f0?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  consumption_f1?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  consumption_f2?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  consumption_f3?: number | null;

  @IsOptional()
  @IsBoolean()
  reactive_penalty?: boolean | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

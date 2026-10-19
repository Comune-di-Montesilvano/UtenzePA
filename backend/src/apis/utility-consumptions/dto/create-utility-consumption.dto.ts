import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ConsumptionKind } from '../enum/consumption-kind.enum';

const isReading = (o: CreateUtilityConsumptionDto) => o.kind === ConsumptionKind.READING;
const isPeriod = (o: CreateUtilityConsumptionDto) => o.kind === ConsumptionKind.PERIOD;

// I campi dell'altro tipo possono arrivare null (il form li invia sempre):
// ValidateIf li salta, normalizeByKind li azzera comunque.
export class CreateUtilityConsumptionDto {
  @IsEnum(ConsumptionKind)
  kind: ConsumptionKind;

  @ValidateIf(isReading)
  @IsDateString({ strict: true })
  reading_date?: string | null;

  @ValidateIf(isReading)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  reading_value?: number | null;

  @ValidateIf(isReading)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  meter_number?: string | null;

  @ValidateIf(isPeriod)
  @IsDateString({ strict: true })
  period_start?: string | null;

  @ValidateIf(isPeriod)
  @IsDateString({ strict: true })
  period_end?: string | null;

  @ValidateIf(isPeriod)
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

  // Valore stimato dal fornitore (fattura): assente = reale / invariato.
  @IsOptional()
  @IsBoolean()
  is_estimated?: boolean;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

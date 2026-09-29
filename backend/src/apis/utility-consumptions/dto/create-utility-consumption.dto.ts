import { Type } from 'class-transformer';
import {
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
  @IsDateString()
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
  @IsDateString()
  period_start?: string | null;

  @ValidateIf(isPeriod)
  @IsDateString()
  period_end?: string | null;

  @ValidateIf(isPeriod)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  consumption?: number | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

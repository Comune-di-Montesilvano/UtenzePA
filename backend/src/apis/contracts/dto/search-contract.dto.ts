import { DateRange } from '@common/decorators/date-range.decorator';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class SearchContractDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  utility_id?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  supplier_id_fk?: number;

  @IsOptional()
  @IsString()
  cig_contract?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true' || value === 1 || value === '1') return true;
    if (value === false || value === 'false' || value === 0 || value === '0') return false;
    return undefined;
  })
  deleted?: boolean;

  @IsOptional()
  @DateRange()
  supply_expiry_date_range?: (string | null)[];

  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true' || value === 1 || value === '1') return true;
    if (value === false || value === 'false' || value === 0 || value === '0') return false;
    return undefined;
  })
  closed?: boolean;

  @IsOptional()
  @IsString()
  consip_order?: string;

  // Solo contratti senza CIG e non esclusi (anomalia).
  @IsOptional()
  @Transform(({ value }) => (value === true || value === 'true' || value === '1' ? true : undefined))
  missing_cig?: boolean;
}

import { DateRange } from '@common/decorators/date-range.decorator';
import { IsBoolean, IsInt, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

export class SearchConsipAgreementDto {
  @IsOptional()
  name: string;

  @IsOptional()
  description: string;

  @IsOptional()
  cig_master: string;

  @IsOptional()
  @DateRange()
  expiration_date_range?: (string | null)[];

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true' || value === 1 || value === true) return true;
    if (value === 'false' || value === 0 || value === false) return false;
    return value;
  })
  safeguard?: boolean;

  @IsOptional()
  @IsInt()
  @Transform(({ value }) => parseInt(value, 10))
  supplier_id: number;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true' || value === 1 || value === true) return true;
    if (value === 'false' || value === 0 || value === false) return false;
    return value;
  })
  deleted?: boolean;
}

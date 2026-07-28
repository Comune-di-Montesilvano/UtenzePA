import { IsBoolean, IsDateString, IsInt, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

export class SearchConsipAgreementDto {
  @IsOptional()
  name: string;

  @IsOptional()
  description: string;

  @IsOptional()
  cig_master: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return undefined;
    if (Array.isArray(value)) return value;
    return value
      .split(',')
      .map((v: string) => v.trim())
      .filter((v: string) => v !== '');
  })
  @IsDateString({}, { each: true })
  expiration_date_range?: string[];

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

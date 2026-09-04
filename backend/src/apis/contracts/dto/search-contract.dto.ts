import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

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
  @Transform(({ value }) => {
    if (!value) return undefined;
    if (Array.isArray(value)) return value;
    return value.split(',').map((v: string) => v.trim()).filter((v: string) => v !== '');
  })
  supply_expiry_date_range?: string[];
}

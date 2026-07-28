import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class SearchUtilityAggregatorDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true' || value === 1 || value === true) return true;
    if (value === 'false' || value === 0 || value === false) return false;
    return value;
  })
  deleted?: boolean;
}

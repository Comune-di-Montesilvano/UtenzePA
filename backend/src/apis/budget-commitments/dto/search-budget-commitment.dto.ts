import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional } from 'class-validator';

export class SearchBudgetCommitmentDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  fiscal_year?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  budget_chapter_id?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  supplier_id?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  contract_id?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  consip_agreement_id?: number;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true' || value === 1 || value === '1') return true;
    if (value === false || value === 'false' || value === 0 || value === '0') return false;
    return undefined;
  })
  deleted?: boolean;
}

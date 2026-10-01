import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateBudgetChapterSpendingDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1990)
  @Max(2100)
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

import { Transform, Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateBudgetChapterSpendingDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1990)
  @Max(2100)
  year?: number;

  // Vuoto = non indicato (null); almeno un importo per riga (nel service).
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value === null || value === undefined ? value : Number(value)))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  initial_budget?: number | null;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value === null || value === undefined ? value : Number(value)))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  adjusted_budget?: number | null;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value === null || value === undefined ? value : Number(value)))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateBudgetCommitmentDto {
  @Type(() => Number)
  @IsInt({ message: 'Capitolo obbligatorio.' })
  budget_chapter_id_fk: number;

  @Type(() => Number)
  @IsInt({ message: 'Esercizio non valido.' })
  @Min(2000)
  @Max(2100)
  fiscal_year: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  commitment_number?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

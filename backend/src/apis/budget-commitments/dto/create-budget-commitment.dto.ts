import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const notNull = (_o: unknown, v: unknown) => v !== null;

// Annualità: esercizio di competenza + importo (null = non noto).
export class CommitmentYearDto {
  @Type(() => Number)
  @IsInt({ message: 'Esercizio non valido.' })
  @Min(2000)
  @Max(2100)
  fiscal_year: number;

  @IsOptional()
  @ValidateIf(notNull)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number | null;
}

export class CreateBudgetCommitmentDto {
  @Type(() => Number)
  @IsInt({ message: 'Capitolo obbligatorio.' })
  budget_chapter_id_fk: number;

  // Una annualità per esercizio di competenza (pluriennale = più annualità).
  @IsArray()
  @ArrayMinSize(1, { message: 'Indicare almeno un esercizio.' })
  @ValidateNested({ each: true })
  @Type(() => CommitmentYearDto)
  years: CommitmentYearDto[];

  // Numero della ragioneria: anno/num/sub (sub = 1 se assente).
  @IsOptional()
  @ValidateIf(notNull)
  @Type(() => Number)
  @IsInt({ message: 'Anno impegno non valido.' })
  @Min(2000)
  @Max(2100)
  commitment_year?: number | null;

  @IsOptional()
  @ValidateIf(notNull)
  @Type(() => Number)
  @IsInt({ message: 'Numero impegno non valido.' })
  @Min(1)
  commitment_num?: number | null;

  @IsOptional()
  @ValidateIf(notNull)
  @Type(() => Number)
  @IsInt({ message: 'Sub-impegno non valido.' })
  @Min(1)
  commitment_sub?: number | null;

  @IsOptional()
  @ValidateIf(notNull)
  @Type(() => Number)
  @IsInt()
  supplier_id_fk?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  contract_ids?: number[];

  @IsOptional()
  @IsString()
  notes?: string | null;
}

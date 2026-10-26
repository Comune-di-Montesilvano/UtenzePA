import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsNumber, IsOptional, ValidateNested } from 'class-validator';
import { DateOnly } from '@/common/decorators/date-only.decorator';

export class BudgetCheckLineDto {
  @IsOptional()
  @IsInt()
  utility_id_fk?: number | null;

  // Periodo della riga: esercizio per competenza (fattura senza quote) e
  // competenza della fattura (annualità delle quote che non la indicano).
  @IsOptional()
  @DateOnly()
  period_start?: string | null;

  @IsOptional()
  @DateOnly()
  period_end?: string | null;

  @Type(() => Number)
  @IsNumber()
  amount: number;
}

// Quota d'impegno della fattura in modifica; annualità omessa = la più
// vicina alla competenza della fattura.
export class BudgetCheckShareDto {
  @IsInt()
  commitment_id_fk: number;

  @IsOptional()
  @IsInt()
  fiscal_year?: number | null;

  @Type(() => Number)
  @IsNumber()
  amount: number;
}

// Fattura in modifica (anche non salvata): l'avviso confronta fatturato delle
// altre fatture + questa con l'assestato. Con quote conta il capitolo
// dell'impegno, senza le righe con il capitolo dell'utenza.
export class BudgetCheckDto {
  @IsOptional()
  @IsInt()
  invoice_id?: number | null;

  @DateOnly()
  invoice_date: string;

  @IsArray()
  @ArrayMaxSize(500, { message: 'Al massimo 500 righe per fattura.' })
  @ValidateNested({ each: true })
  @Type(() => BudgetCheckLineDto)
  lines: BudgetCheckLineDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100, { message: 'Al massimo 100 quote per fattura.' })
  @ValidateNested({ each: true })
  @Type(() => BudgetCheckShareDto)
  commitment_shares?: BudgetCheckShareDto[] | null;
}

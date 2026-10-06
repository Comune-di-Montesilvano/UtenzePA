import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsNumber, IsOptional, ValidateNested } from 'class-validator';
import { DateOnly } from '@/common/decorators/date-only.decorator';

export class BudgetCheckLineDto {
  @IsOptional()
  @IsInt()
  utility_id_fk?: number | null;

  @IsOptional()
  @IsInt()
  commitment_id_fk?: number | null;

  @Type(() => Number)
  @IsNumber()
  amount: number;
}

// Righe della fattura in modifica (anche non salvate): l'avviso confronta
// fatturato delle altre fatture + queste righe con l'assestato.
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
}

import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, ValidateIf } from 'class-validator';

// Quota d'impegno scelta a mano sulla fattura. Esercizio assente: l'annualità
// dell'impegno per la competenza della fattura. Importo negativo ammesso
// (note di credito).
export class InvoiceCommitmentShareDto {
  @Type(() => Number)
  @IsInt({ message: "L'impegno della quota è obbligatorio." })
  commitment_id_fk: number;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @Type(() => Number)
  @IsInt({ message: "L'esercizio della quota deve essere un anno." })
  fiscal_year?: number | null;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "L'importo della quota è obbligatorio." })
  amount: number;
}

import { IsNumber, Max, Min, ValidateIf } from 'class-validator';

// Costo unitario a mano (IVA inclusa). null esplicito = torna al proposto;
// campo assente = 400 (un body vuoto non cancella il prezzo per sbaglio).
// Massimo: la colonna è decimal(12,6).
export class AgreementPriceDto {
  @ValidateIf((o: AgreementPriceDto) => o.unit_price !== null)
  @IsNumber({}, { message: 'Il costo unitario deve essere un numero.' })
  @Min(0.000001, { message: 'Il costo unitario deve essere maggiore di zero.' })
  @Max(999999, { message: 'Il costo unitario non può superare 999999 €.' })
  unit_price: number | null;
}

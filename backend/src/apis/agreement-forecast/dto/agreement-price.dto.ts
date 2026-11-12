import { IsNumber, IsOptional, Min } from 'class-validator';

// Costo unitario a mano (IVA inclusa). null = torna al proposto.
export class AgreementPriceDto {
  @IsOptional()
  @IsNumber({}, { message: 'Il costo unitario deve essere un numero.' })
  @Min(0.000001, { message: 'Il costo unitario deve essere maggiore di zero.' })
  unit_price: number | null;
}

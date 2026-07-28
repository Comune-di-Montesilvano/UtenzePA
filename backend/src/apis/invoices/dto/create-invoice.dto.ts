import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateInvoiceDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  invoice_id?: string;

  @IsNotEmpty({ message: 'La data della fattura è obbligatoria.' })
  @Transform(({ value }) => (value ? (value as string).slice(0, 10) : value))
  invoice_date: string;

  @IsNotEmpty({ message: 'Il numero di protocollo è obbligatorio.' })
  @IsString()
  @MaxLength(100)
  protocol_number: string;

  @IsNotEmpty({ message: "L'importo netto è obbligatorio." })
  @IsNumber({}, { message: "L'importo netto deve essere un numero valido." })
  @Min(0, { message: "L'importo netto non può essere negativo." })
  net_amount_excl_vat: number;

  @IsNotEmpty({ message: "L'utenza di riferimento è obbligatoria." })
  @IsInt()
  utility_id_fk: number;

  @IsOptional()
  @IsNumber({}, { message: 'La morosità deve essere un numero valido.' })
  @Min(0, { message: 'La morosità non può essere negativa.' })
  last_invoice_arrears?: number;

  @IsOptional()
  @IsString()
  notes_on_invoices?: string;

  @IsOptional()
  @IsInt()
  supplier_id_fk?: number;

  @IsOptional()
  @IsArray({ message: 'I capitoli di spesa devono essere forniti come un array.' })
  @IsInt({ each: true, message: 'Ogni elemento dei capitoli di spesa deve essere un ID intero.' })
  budget_chapters?: number[];

  @IsOptional()
  @IsInt()
  created_by_user_id?: number;

  @IsOptional()
  @IsInt()
  updated_by_user_id?: number;
}

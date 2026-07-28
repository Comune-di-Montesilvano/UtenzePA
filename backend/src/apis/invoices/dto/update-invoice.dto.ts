import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateInvoiceDto {
  @IsOptional()
  id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  invoice_id?: string;

  @IsNotEmpty({ message: 'La data della fattura è obbligatoria.' })
  @Transform(({ value }) => (value ? (value as string).slice(0, 10) : value))
  invoice_date?: string;

  @IsNotEmpty({ message: 'Il numero di protocollo è obbligatorio.' })
  @IsString()
  @MaxLength(100)
  protocol_number?: string;

  @IsNotEmpty({ message: "L'importo netto è obbligatorio." })
  @ValidateIf((object, value) => value !== null && value !== undefined)
  @IsNumber()
  @Min(0)
  net_amount_excl_vat?: number | null;

  @IsOptional()
  @ValidateIf((object, value) => value !== null && value !== undefined)
  @IsNumber()
  @Min(0)
  last_invoice_arrears?: number | null;

  @IsOptional()
  @IsString()
  notes_on_invoices?: string;

  @IsOptional()
  @IsInt()
  utility_id_fk?: number;

  @IsOptional()
  @IsInt()
  supplier_id_fk?: number;

  @IsOptional()
  create_date?: Date;

  @IsOptional()
  update_date?: Date;

  @IsOptional()
  @IsInt()
  created_by_user_id?: number;

  @IsOptional()
  @IsNotEmpty({ message: 'Il campo updated_by_user_id è obbligatorio.' })
  @IsInt()
  updated_by_user_id?: number;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true' || value === 1 || value === true) return true;
    if (value === 'false' || value === 0 || value === false) return false;
    return value;
  })
  deleted?: number;

  @IsOptional()
  @IsArray({ message: 'I capitoli di spesa devono essere forniti come un array.' })
  @IsInt({ each: true, message: 'Ogni elemento dei capitoli di spesa deve essere un ID intero.' })
  budget_chapters?: number[];
}

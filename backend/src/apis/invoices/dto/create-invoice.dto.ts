import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InvoiceLineDto } from './invoice-line.dto';
import { DateOnly } from '@/common/decorators/date-only.decorator';

export class CreateInvoiceDto {
  @IsNotEmpty({ message: 'Il numero della fattura è obbligatorio.' })
  @IsString()
  @MaxLength(255)
  invoice_id: string;

  @IsNotEmpty({ message: 'La data della fattura è obbligatoria.' })
  @DateOnly()
  invoice_date: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  protocol_number?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsNumber({}, { message: "L'importo netto deve essere un numero valido." })
  @Min(0, { message: "L'importo netto non può essere negativo." })
  net_amount_excl_vat?: number | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  contratto_id_fk?: number | null;

  @IsOptional()
  @IsNumber({}, { message: 'La morosità deve essere un numero valido.' })
  @Min(0, { message: 'La morosità non può essere negativa.' })
  last_invoice_arrears?: number;

  @IsOptional()
  @IsString()
  notes_on_invoices?: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Il totale documento deve essere un numero valido.' })
  total_amount?: number | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  supplier_id_fk?: number | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  lines?: InvoiceLineDto[];

  @IsOptional()
  @IsInt()
  created_by_user_id?: number;

  @IsOptional()
  @IsInt()
  updated_by_user_id?: number;
}

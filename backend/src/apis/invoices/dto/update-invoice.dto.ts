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
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { InvoiceLineDto } from './invoice-line.dto';
import { DateOnly } from '@/common/decorators/date-only.decorator';

export class UpdateInvoiceDto {
  @IsOptional()
  id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  invoice_id?: string;

  @IsNotEmpty({ message: 'La data della fattura è obbligatoria.' })
  @DateOnly()
  invoice_date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  protocol_number?: string | null;

  @IsOptional()
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
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  contratto_id_fk?: number | null;

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
}

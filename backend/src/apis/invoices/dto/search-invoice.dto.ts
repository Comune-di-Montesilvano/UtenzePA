import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { TransformCsvToArray } from '@/common/decorators/transform-csv-to-array.decorator';

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export class SearchInvoiceDto {
  @IsOptional()
  @IsString()
  invoice_id?: string;

  @IsOptional()
  @IsString()
  protocol_number?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  contratto_id_fk?: number;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value === undefined ? undefined : parseFloat(value)))
  @IsNumber()
  @Min(0)
  net_amount_excl_vat?: number;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value === undefined ? undefined : parseFloat(value)))
  @IsNumber()
  @Min(0)
  last_invoice_arrears?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  utility_id?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  supplier_id_fk?: number;

  @IsOptional()
  @IsBoolean()
  // Non @Type(() => Boolean): Boolean('false') è true, e deleted=false mostrava le eliminate.
  @Transform(({ value }) => {
    if (value === true || value === 'true' || value === 1 || value === '1') return true;
    if (value === false || value === 'false' || value === 0 || value === '0') return false;
    return undefined;
  })
  deleted?: boolean;

  @IsOptional()
  @IsDateString()
  invoice_date_from?: string;

  @IsOptional()
  @IsDateString()
  invoice_date_to?: string;

  @IsOptional()
  @IsString()
  notes_on_invoices?: string;

  @IsOptional()
  @IsString()
  orderBy?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return undefined;
    if (Array.isArray(value)) return value;
    return value
      .split(',')
      .map((v: string) => v.trim())
      .filter((v: string) => v !== '');
  })
  @IsDateString({}, { each: true })
  invoice_date_range?: string[];

  @IsOptional()
  @IsEnum(SortOrder)
  orderDirection?: SortOrder;

  @IsOptional()
  @TransformCsvToArray()
  @IsArray()
  budget_chapter_ids?: number[];
}

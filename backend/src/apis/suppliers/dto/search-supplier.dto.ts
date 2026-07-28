import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class SearchSupplierDto {
  @IsOptional()
  id?: number;

  @IsOptional()
  @IsNotEmpty({ message: 'ID fornitore obblicatorio' })
  @IsString({ message: 'Il campo supplier_id deve essere una stringa' })
  supplier_id?: string;

  @IsOptional()
  @IsString({ message: 'Il campo vat_number deve essere una stringa' })
  vat_number?: string;

  @IsOptional()
  @IsString({ message: 'Il campo tax_code deve essere una stringa' })
  tax_code?: string;

  @IsOptional()
  @IsNotEmpty({ message: 'La ragione sociale è obbligatoria' })
  @IsString({ message: 'Il campo company_name deve essere una stringa' })
  company_name?: string;

  @IsOptional()
  @IsString({ message: 'Il campo address deve essere una stringa' })
  address?: string;

  @IsOptional()
  @IsString({ message: 'Il campo city deve essere una stringa' })
  city?: string;

  @IsOptional()
  @IsString({ message: 'Il campo postal_code deve essere una stringa' })
  postal_code?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  pec?: string;

  @IsOptional()
  updated_by_user_id?: number;

  @IsOptional()
  create_date: Date;

  @IsOptional()
  update_date: Date;

  @IsOptional()
  created_by_user_id?: number;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true' || value === 1 || value === true) return true;
    if (value === 'false' || value === 0 || value === false) return false;
    return value;
  })
  deleted?: boolean;
}

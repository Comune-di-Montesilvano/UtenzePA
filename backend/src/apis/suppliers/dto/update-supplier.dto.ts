import { IsOptional, IsBoolean, IsString, IsNotEmpty, IsEmail } from 'class-validator';

export class UpdateSupplierDto {
  @IsOptional()
  id?: number;

  @IsOptional()
  @IsNotEmpty({ message: 'ID fornitore obbligatorio' })
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
  @IsEmail({}, { message: 'Il campo email deve essere una mail valida' })
  email?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Il campo pec deve essere una mail valida' })
  pec?: string;

  @IsOptional()
  @IsBoolean({ message: 'Il campo deleted deve essere booleano' })
  deleted?: boolean;

  @IsOptional()
  create_date?: Date;

  @IsOptional()
  update_date?: Date;

  @IsOptional()
  created_by_user_id?: number;

  @IsOptional()
  updated_by_user_id?: number;
}

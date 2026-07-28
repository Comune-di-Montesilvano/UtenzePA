import { IsNotEmpty, IsOptional, IsBoolean, IsString, IsEmail } from 'class-validator';

export class CreateSupplierDto {
  @IsNotEmpty({ message: 'Il campo ID fornitore è obbligatorio' })
  @IsString({ message: 'Il campo ID fornitore deve essere una stringa' })
  supplier_id: string;

  @IsOptional()
  @IsString({ message: 'Il campo partita iva deve essere una stringa' })
  vat_number?: string;

  @IsOptional()
  @IsString({ message: 'Il campo codice fiscale deve essere una stringa' })
  tax_code?: string;

  @IsNotEmpty({ message: 'Il campo ragione sociale è obbligatorio' })
  @IsString({ message: 'Il campo ragione sociale deve essere una stringa' })
  company_name: string;

  @IsOptional()
  @IsString({ message: 'Il campo indirizzo deve essere una stringa' })
  address?: string;

  @IsOptional()
  @IsString({ message: 'Il campo città deve essere una stringa' })
  city?: string;

  @IsOptional()
  @IsString({ message: 'Il campo CAP deve essere una stringa' })
  postal_code?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Il campo email deve essere una mail valida' })
  email?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Il campo pec deve essere una mail valida' })
  pec?: string;

  @IsOptional()
  @IsNotEmpty({ message: 'Il campo created_by_user_id è obbligatorio' })
  created_by_user_id: number;

  @IsOptional()
  @IsNotEmpty({ message: 'Il campo updated_by_user_id è obbligatorio' })
  updated_by_user_id: number;

  @IsOptional()
  @IsBoolean({ message: 'Il campo deleted deve essere booleano' })
  deleted?: boolean;
}

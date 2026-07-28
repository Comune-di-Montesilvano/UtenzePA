import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateConsipAgreementDto {
  @IsNotEmpty({ message: 'Il campo nome è obbligatorio' })
  @IsString({ message: 'Il campo nome deve essere una stringa' })
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString({ message: 'Il campo descrizione deve essere una stringa' })
  description: string | null;

  @IsNotEmpty({ message: 'Il campo CIG master è obbligatorio' })
  @IsString({ message: 'Il campo CIG master deve essere una stringa' })
  @MaxLength(10, { message: 'Il campo CIG master deve essere di 10 caratteri' })
  cig_master: string;

  @IsNotEmpty({ message: 'Il campo scadenza è obbligatorio' })
  @Transform(({ value }) => (value ? (value as string).slice(0, 10) : value))
  @IsDateString()
  expiration_date: string;

  @IsOptional()
  @IsInt()
  @IsIn([0, 1], { message: 'Il campo safeguard deve essere 0 o 1' })
  safeguard: number;

  @IsNotEmpty({ message: 'Il campo fornitore è obbligatorio' })
  @IsInt()
  supplier_id: number;

  @IsOptional()
  @IsInt()
  created_by_user_id?: number;

  @IsOptional()
  @IsInt()
  updated_by_user_id?: number;
}

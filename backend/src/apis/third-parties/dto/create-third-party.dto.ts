import { IsEmail, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ThirdPartyType } from '../enum/third-party.enum';

// Solo tipi e formati: le regole che dipendono dal tipo (denominazione e
// P.IVA per i giuridici, nomi e CF per le persone) sono in validateThirdParty,
// applicata dal service al record risultante. tax_code accetta 20 caratteri
// perché gli spazi si tolgono nella normalizzazione (colonna da 16).
export class CreateThirdPartyDto {
  @IsEnum(ThirdPartyType, { message: 'Tipo soggetto non valido' })
  type: ThirdPartyType;

  @IsOptional() @IsString() @MaxLength(255) company_name?: string | null;
  @IsOptional() @IsString() @MaxLength(100) last_name?: string | null;
  @IsOptional() @IsString() @MaxLength(100) first_name?: string | null;
  @IsOptional() @IsString() @MaxLength(20) vat_number?: string | null;
  @IsOptional() @IsString() @MaxLength(20) tax_code?: string | null;
  @IsOptional() @IsString() @MaxLength(255) address?: string | null;
  @IsOptional() @IsString() @MaxLength(100) city?: string | null;
  @IsOptional() @IsString() @MaxLength(10) postal_code?: string | null;

  @IsOptional()
  @IsEmail({}, { message: 'Email non valida' })
  email?: string | null;

  @IsOptional()
  @IsEmail({}, { message: 'PEC non valida' })
  pec?: string | null;

  @IsOptional() @IsString() @MaxLength(50) phone?: string | null;
  @IsOptional() @IsString() contacts?: string | null;
  @IsOptional() @IsString() notes?: string | null;
}

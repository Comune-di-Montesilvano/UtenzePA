import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  ConstructionPeriod,
  HeritageConstraint,
  LegalNature,
} from '@apis/asset/enum/mef-domains.enum';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const blankToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const v = value.trim();
  return v === '' ? null : v;
};

export class CadastralUnitDto {
  @IsOptional()
  @Transform(blankToNull)
  @IsString()
  @MaxLength(5)
  section?: string | null;

  @Transform(trim)
  @IsNotEmpty({ message: 'Il foglio è obbligatorio in ogni unità catastale' })
  @IsString()
  @MaxLength(50)
  sheet: string;

  @Transform(trim)
  @IsNotEmpty({ message: 'La particella è obbligatoria in ogni unità catastale' })
  @IsString()
  @MaxLength(50)
  parcel: string;

  @IsOptional()
  @Transform(blankToNull)
  @IsString()
  @MaxLength(50)
  subordinate?: string | null;

  @IsOptional()
  @Transform(blankToNull)
  @IsString()
  @MaxLength(100)
  category?: string | null;

  @IsOptional()
  @IsNumber({}, { message: 'La rendita deve essere un numero' })
  cadastral_income?: number | null;
}

// Unità catastali e dati MEF modificabili, comuni a creazione e modifica.
// mef_id resta fuori: lo scrive solo l'import.
export class AssetMefFieldsDto {
  // Assente = unità invariate; presente = sostituite in blocco.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CadastralUnitDto)
  cadastral_units?: CadastralUnitDto[];

  @IsOptional()
  @IsEnum(LegalNature)
  legal_nature?: LegalNature | null;

  @IsOptional()
  @IsNumber({}, { message: 'La superficie di riferimento deve essere un numero' })
  reference_area_sqm?: number | null;

  @IsOptional()
  @IsNumber({}, { message: 'La superficie delle aree pertinenziali deve essere un numero' })
  appurtenance_area_sqm?: number | null;

  @IsOptional()
  @IsNumber({}, { message: 'La cubatura deve essere un numero' })
  volume_m3?: number | null;

  @IsOptional()
  @IsEnum(ConstructionPeriod)
  construction_period?: ConstructionPeriod | null;

  @IsOptional()
  @IsEnum(HeritageConstraint)
  heritage_constraint?: HeritageConstraint | null;

  @IsOptional()
  @IsBoolean()
  federal_transfer?: boolean | null;

  @IsOptional()
  @IsBoolean()
  confiscated?: boolean | null;
}

import { Transform } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsInt,
  MaxLength,
  IsBoolean,
  IsNumber,
  IsEnum,
  Min,
} from 'class-validator';
import { Phase } from '../../shared/enum/user.enums';
import { AreraCategory, GasUseCategory } from '../arera-category';
import { DateOnly } from '@/common/decorators/date-only.decorator';

export class CreateUtilityDto {
  @IsNotEmpty({ message: 'Il tipo di utenza è obbligatorio.' })
  @IsInt()
  utility_type_id_fk: number;

  @IsNotEmpty({ message: "Il codice identificativo dell'utenza è obbligatorio." })
  @IsString()
  @MaxLength(20)
  utility_id: string;

  // Almeno un immobile o un impianto: verificato nel service.
  @IsOptional()
  @IsArray({ message: 'Gli immobili associati devono essere un array.' })
  @IsInt({ each: true, message: 'Ogni immobile associato deve essere un ID intero.' })
  asset_ids?: number[];

  @IsOptional()
  @IsArray({ message: 'Gli impianti associati devono essere un array.' })
  @IsInt({ each: true, message: 'Ogni impianto associato deve essere un ID intero.' })
  plant_ids?: number[];

  // Facoltativo: senza capitolo l'utenza finisce tra le segnalazioni, salvo
  // contratto a titolo gratuito.
  @IsOptional()
  @IsInt()
  budget_chapter_code_fk?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  utility_code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  meter_number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  supplier_address?: string;

  @IsOptional()
  @IsBoolean()
  supply_active?: boolean;

  @IsOptional()
  @IsBoolean()
  meter_removed?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  reported_consumption_year?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimated_annual_consumption?: number;

  // Vuoto = non noto (null).
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value === null || value === undefined ? value : Number(value)))
  @IsNumber()
  @Min(0)
  security_deposit?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  power_kw_electric?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  voltage_kw_electric?: string;

  @IsOptional()
  @IsEnum(Phase)
  phase_type_electric?: Phase;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  latitude?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  longitude?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  wbs_gas_element?: string;

  @IsOptional()
  @DateOnly()
  water_concession?: string;

  @IsOptional()
  @IsBoolean()
  meter_verified?: boolean;

  @IsOptional()
  @IsEnum(AreraCategory, { message: 'Tipologia ARERA non valida.' })
  arera_category?: AreraCategory | null;

  @IsOptional()
  @IsEnum(GasUseCategory, { message: "Categoria d'uso gas non valida." })
  gas_use_category?: GasUseCategory | null;

  // Voltura (null = ripresa dal Comune).
  @IsOptional()
  @IsInt()
  transferred_to_third_party_id?: number | null;

  @IsOptional()
  @DateOnly()
  transferred_on?: string | null;

  @IsOptional()
  @IsBoolean()
  disconnectable?: boolean | null;

  @IsOptional()
  @IsInt()
  created_by_user_id?: number;

  @IsOptional()
  @IsInt()
  updated_by_user_id?: number;
}

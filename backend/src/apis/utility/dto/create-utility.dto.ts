import {
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
import { NormalizeDate } from '@/common/decorators/normalize-date.decorator';

export class CreateUtilityDto {
  @IsNotEmpty({ message: 'Il tipo di utenza è obbligatorio.' })
  @IsInt()
  utility_type_id_fk: number;

  @IsNotEmpty({ message: "Il codice identificativo dell'utenza è obbligatorio." })
  @IsString()
  @MaxLength(20)
  utility_id: string;

  @IsNotEmpty({ message: "L'asset di riferimento è obbligatorio." })
  @IsInt()
  asset_id_fk: number;

  @IsNotEmpty({ message: 'Il campo "Costi a carico di" è obbligatorio.' })
  @IsInt()
  costs_borne_by_id_fk: number;

  @IsNotEmpty({ message: 'Il capitolo di spesa è obbligatorio.' })
  @IsInt()
  budget_chapter_code_fk: number;

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
  actual_consumption?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimated_annual_consumption?: number;

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
  additional_notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  wbs_gas_element?: string;

  @IsOptional()
  @NormalizeDate()
  water_concession?: string;

  @IsOptional()
  @IsBoolean()
  meter_verified?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  disconnection_ability?: string;

  @IsOptional()
  @IsString()
  specifications?: string;

  @IsOptional()
  @IsInt()
  aggregator_id_fk?: number;

  @IsOptional()
  @IsInt()
  maintenance_management_id_fk?: number;

  @IsOptional()
  @IsInt()
  created_by_user_id?: number;

  @IsOptional()
  @IsInt()
  updated_by_user_id?: number;
}

import {
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
import { Transform } from 'class-transformer';

export class UpdateUtilityDto {
  @IsOptional()
  id?: number;

  @IsOptional()
  @IsInt()
  utility_type_id_fk?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  utility_id?: string;

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
  @IsInt()
  costs_borne_by_id_fk?: number;

  @IsOptional()
  @IsInt()
  maintenance_management_id_fk?: number;

  @IsOptional()
  @IsBoolean()
  supply_active?: boolean;

  @IsOptional()
  @IsBoolean()
  meter_removed?: boolean;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : Number(value)))
  @IsNumber()
  @Min(0)
  reported_consumption_year?: number | null;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : Number(value)))
  @IsNumber()
  @Min(0)
  actual_consumption?: number | null;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : Number(value)))
  @IsNumber()
  @Min(0)
  estimated_annual_consumption?: number | null;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : Number(value)))
  @IsNumber()
  @Min(0)
  power_kw_electric?: number | null;

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
  asset_id_fk?: number;

  @IsOptional()
  @IsInt()
  aggregator_id_fk?: number | null;

  @IsOptional()
  @IsInt()
  budget_chapter_code_fk?: number;

  @IsOptional()
  create_date?: string;

  @IsOptional()
  update_date?: string;

  @IsOptional()
  @IsInt()
  created_by_user_id?: number;

  @IsOptional()
  @IsInt()
  updated_by_user_id?: number;

  @IsOptional()
  @IsBoolean()
  deleted?: boolean;
}

import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ExpiryStatus } from '../enum/ExpiryStatus.enum';
import { Phase } from '../../shared/enum/user.enums';

export class SearchUtilityDto {
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
  supply_start_date_range?: string[];

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
  supply_expiry_date_range?: string[];

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
  management_expiry_date_range?: string[];

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
  takeover_termination_date_range?: string[];

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
  water_concession_range?: string[];

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === true || value === 'true' || value === 1 || value === '1') return true;
    if (value === false || value === 'false' || value === 0 || value === '0') return false;
    return undefined;
  })
  deleted?: boolean;

  @IsOptional()
  utilityState?: ExpiryStatus;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  supply_active?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  meter_removed?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  meter_verified?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true' || value === 1 || value === true) return true;
    if (value === 'false' || value === 0 || value === false) return false;
    return value;
  })
  safeguard?: boolean;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsInt()
  user_id_fk?: number;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsInt()
  utility_type_id_fk?: number;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsInt()
  supplier_id_fk?: number;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsInt()
  costs_borne_by_id_fk?: number;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsInt()
  maintenance_management_id_fk?: number;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsInt()
  asset_id_fk?: number;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsInt()
  aggregator_id_fk?: number;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsInt()
  budget_chapter_code_fk?: number;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsInt()
  consip_agreement_id?: number;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsInt()
  created_by_user_id?: number;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsInt()
  updated_by_user_id?: number;

  @IsOptional()
  @IsString()
  security_deposit?: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsNumber()
  @Min(0)
  power_kw_electric?: number;

  @IsOptional()
  @IsString()
  utility_id?: string;

  @IsOptional()
  @IsString()
  utility_code?: string;

  @IsOptional()
  @IsString()
  meter_number?: string;

  @IsOptional()
  @IsString()
  supplier_address?: string;

  @IsOptional()
  @IsString()
  consip_order?: string;

  @IsOptional()
  @IsString()
  voltage_kw_electric?: string;

  @IsOptional()
  @IsEnum(Phase)
  phase_type_electric?: Phase;

  @IsOptional()
  @IsString()
  latitude?: string;

  @IsOptional()
  @IsString()
  longitude?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  additional_notes?: string;

  @IsOptional()
  @IsString()
  wbs_gas_element?: string;

  @IsOptional()
  @IsString()
  disconnection_ability?: string;

  @IsOptional()
  @IsString()
  specifications?: string;

  @IsOptional()
  @IsString()
  reported_consumption_year?: string;

  @IsOptional()
  @IsString()
  estimated_annual_consumption?: string;

  @IsOptional()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  supply_start_date?: Date;

  @IsOptional()
  @IsString()
  supply_expiry_date?: string;

  @IsOptional()
  @IsString()
  management_expiry_date?: string;

  @IsOptional()
  @IsString()
  takeover_termination_date?: string;

  @IsOptional()
  @IsString()
  water_concession?: string;

  @IsOptional()
  @IsString()
  order_number?: string;

  @IsOptional()
  @IsString()
  cig_contract?: string;
}

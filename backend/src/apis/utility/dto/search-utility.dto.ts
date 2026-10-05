import { DateRange } from '@common/decorators/date-range.decorator';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ExpiryStatus } from '../enum/ExpiryStatus.enum';
import { Phase } from '../../shared/enum/user.enums';
import { AreraCategory, ARERA_NONE, GasUseCategory } from '../arera-category';
import { PlantType } from '@apis/plants/enum/plant.enum';
import { CostStatus } from '../cost-status';
import { MaintenanceStatus } from '../maintenance-status';

export class SearchUtilityDto {
  @IsOptional()
  @DateRange()
  supply_start_date_range?: (string | null)[];

  @IsOptional()
  @DateRange()
  supply_expiry_date_range?: (string | null)[];

  @IsOptional()
  @DateRange()
  management_expiry_date_range?: (string | null)[];

  @IsOptional()
  @DateRange()
  takeover_termination_date_range?: (string | null)[];

  @IsOptional()
  @DateRange()
  water_concession_range?: (string | null)[];

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
  party_id?: number;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsInt()
  utility_type_id_fk?: number;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsInt()
  supplier_id_fk?: number;

  // Utenze collegate a questo immobile (tra gli altri eventuali).
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsInt()
  asset_id?: number;

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
  wbs_gas_element?: string;

  @IsOptional()
  @IsIn([...Object.values(AreraCategory), ARERA_NONE])
  arera_category?: string;

  @IsOptional()
  @IsIn([...Object.values(GasUseCategory), ARERA_NONE])
  gas_use_category?: string;

  @IsOptional()
  @IsIn(['true', 'false', 'unknown'])
  disconnectable?: 'true' | 'false' | 'unknown';

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
  cig_contract?: string;

  // Utenze che alimentano almeno un immobile con una di queste funzioni.
  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value === undefined || value === null) return undefined;
    const list = Array.isArray(value) ? value : String(value).split(',');
    return list
      .map((v) => String(v).trim())
      .filter((v) => v !== '')
      .map(Number);
  })
  @IsInt({ each: true })
  asset_function_ids?: number[];

  // Utenze che alimentano almeno un impianto di uno di questi tipi.
  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value === undefined || value === null) return undefined;
    const list = Array.isArray(value) ? value : String(value).split(',');
    return list.map((v) => String(v).trim()).filter((v) => v !== '');
  })
  @IsEnum(PlantType, { each: true })
  plant_types?: PlantType[];

  // A carico di (calcolato, cost-status.ts).
  @IsOptional()
  @IsEnum(CostStatus)
  cost_status?: CostStatus;

  // Manutenzione a carico di (calcolata, maintenance-status.ts).
  @IsOptional()
  @IsEnum(MaintenanceStatus)
  maintenance_status?: MaintenanceStatus;

  // Utenze collegate agli immobili di un contratto immobiliare (scheda contratto).
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsInt()
  grant_id?: number;
}

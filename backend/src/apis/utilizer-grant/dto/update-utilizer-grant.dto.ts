import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ContractDirection,
  ContractKind,
  ContractStatus,
  RentPeriod,
} from '../enum/real-estate-contract.enum';

// PATCH parziale: la coerenza del contratto risultante (merge con il
// persistito) è verificata da validateContract nel service.
export class UpdateUtilizerGrantDto {
  @IsOptional()
  id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  concession_act?: string;

  @IsOptional()
  @IsBoolean()
  utilities_to_be_taken_over?: boolean;

  @IsOptional()
  @IsBoolean()
  maintenance_by_counterparty?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  usage_type?: string;

  @IsOptional()
  @IsArray({ message: 'Indicare le parti del contratto.' })
  @ArrayMinSize(1, { message: 'Indicare almeno una parte del contratto.' })
  @IsInt({ each: true })
  party_ids?: number[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  asset_ids?: number[];

  @IsOptional()
  @IsDateString({ strict: true })
  start_date?: string | null;

  @IsOptional()
  @IsDateString({ strict: true })
  end_date?: string | null;

  @IsOptional()
  @IsEnum(ContractDirection)
  direction?: ContractDirection;

  @IsOptional()
  @IsEnum(ContractKind)
  kind?: ContractKind;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  subject?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  rent_amount?: number | null;

  @IsOptional()
  @IsEnum(RentPeriod)
  rent_period?: RentPeriod | null;

  @IsOptional()
  @IsBoolean()
  vat_applicable?: boolean;

  @IsOptional()
  @IsBoolean()
  tacit_renewal?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  renewal_months?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  notice_months?: number | null;

  @IsOptional()
  @IsEnum(ContractStatus)
  status?: ContractStatus;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  registration_ref?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  cadastral_ref?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  area_sqm?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  department?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  parent_contract_id?: number | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  create_date?: Date;

  @IsOptional()
  update_date?: Date;

  @IsOptional()
  created_by_user_id?: number;

  @IsOptional()
  updated_by_user_id?: number;

  @IsOptional()
  @IsBoolean()
  deleted?: boolean;
}

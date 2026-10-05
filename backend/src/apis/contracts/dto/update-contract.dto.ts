import {
  IsBoolean,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { DateOnly } from '@/common/decorators/date-only.decorator';

export class UpdateContractDto {
  @IsOptional()
  @IsInt()
  supplier_id_fk?: number;

  @IsOptional()
  @IsString()
  cig_contract?: string;

  @IsOptional()
  @IsBoolean()
  cig_exempt?: boolean;

  @IsOptional()
  @IsBoolean()
  maintenance_included?: boolean;

  @IsOptional()
  @IsBoolean()
  closed?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  consip_order?: string;

  @IsOptional()
  @IsInt()
  consip_agreement_id?: number;

  @IsOptional()
  @DateOnly()
  supply_start_date?: string;

  @IsOptional()
  @DateOnly()
  supply_expiry_date?: string;

  @IsOptional()
  @DateOnly()
  management_expiry_date?: string;

  @IsOptional()
  @DateOnly()
  takeover_termination_date?: string;

  @IsOptional()
  @IsArray({ message: 'Le utenze coperte devono essere fornite come un array.' })
  @IsInt({ each: true, message: 'Ogni elemento delle utenze deve essere un ID intero.' })
  utility_ids?: number[];

  @IsOptional()
  @IsInt()
  created_by_user_id?: number;

  @IsOptional()
  @IsInt()
  updated_by_user_id?: number;
}

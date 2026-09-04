import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { NormalizeDate } from '@/common/decorators/normalize-date.decorator';

export class UpdateContractDto {
  @IsOptional()
  @IsInt()
  supplier_id_fk?: number;

  @IsOptional()
  @IsString()
  cig_contract?: string;

  @IsOptional()
  @IsString()
  order_number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  consip_order?: string;

  @IsOptional()
  @IsInt()
  consip_agreement_id?: number;

  @IsOptional()
  @NormalizeDate()
  supply_start_date?: string;

  @IsOptional()
  @NormalizeDate()
  supply_expiry_date?: string;

  @IsOptional()
  @NormalizeDate()
  management_expiry_date?: string;

  @IsOptional()
  @NormalizeDate()
  takeover_termination_date?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  security_deposit?: number;

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

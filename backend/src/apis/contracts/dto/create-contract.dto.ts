import {
  IsBoolean,
  IsEnum,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { CONTRACT_KINDS, ContractKind } from '../enum/contract-kind.enum';
import { DateOnly } from '@/common/decorators/date-only.decorator';

export class CreateContractDto {
  @IsOptional()
  @IsInt()
  supplier_id_fk?: number;

  @IsOptional()
  @IsString()
  cig_contract?: string;

  @IsOptional()
  @IsEnum(ContractKind, { message: `Tipologia non valida: ${CONTRACT_KINDS.join(', ')}` })
  contract_kind?: ContractKind;

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

import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { ContractDirection, ContractKind, DisplayStatus } from '../enum/real-estate-contract.enum';

const toBool = ({ value }: { value: unknown }) => {
  if (value === 'true' || value === 1 || value === true) return true;
  if (value === 'false' || value === 0 || value === false) return false;
  return value;
};

export type ContractAlertFilter = 'notice' | 'expiring' | 'expired_active' | 'without_assets';

export class SearchUtilizerGrantDto {
  @IsOptional()
  @IsString()
  concession_act?: string;

  @IsOptional()
  @IsString()
  usage_type?: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsInt()
  asset_id?: number;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsInt()
  party_id?: number;

  @IsOptional()
  @IsEnum(ContractDirection)
  direction?: ContractDirection;

  @IsOptional()
  @IsEnum(ContractKind)
  kind?: ContractKind;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsEnum(DisplayStatus)
  computed_status?: DisplayStatus;

  @IsOptional()
  @IsIn(['notice', 'expiring', 'expired_active', 'without_assets'])
  alert?: ContractAlertFilter;

  // Ricerca libera su controparte, oggetto, atto, registrazione, immobile.
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(toBool)
  utilities_to_be_taken_over?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(toBool)
  deleted?: boolean;
}

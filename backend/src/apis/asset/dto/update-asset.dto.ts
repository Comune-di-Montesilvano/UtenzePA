import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { AssetStatusEnum } from '@apis/asset/enum/asset-status.enum';

export class UpdateAssetDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  asset_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  associated_building?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  toponym?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  civic_number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  zip_code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  municipality?: string;

  @IsOptional()
  ownership?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  specific_details?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  memo?: string;

  @IsOptional()
  @IsString()
  services_and_artifacts?: string;

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
  @MaxLength(50)
  sheet?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  parcel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  subordinate?: string;

  @IsOptional()
  @Transform(({ value }) =>
    value !== undefined && value !== null && value !== '' ? parseFloat(value) : value,
  )
  @IsNumber()
  area_sqm?: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) =>
    value !== undefined && value !== null && value !== '' ? parseFloat(value) : value,
  )
  cadastral_value?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  // null ammesso (@IsOptional salta la validazione): un immobile legacy si
  // salva anche senza essere riclassificato.
  @IsOptional()
  @Transform(({ value }) =>
    value !== undefined && value !== null && value !== '' ? parseInt(value, 10) : null,
  )
  @IsInt()
  nature_id?: number | null;

  @IsOptional()
  @Transform(({ value }) =>
    value !== undefined && value !== null && value !== '' ? parseInt(value, 10) : null,
  )
  @IsInt()
  function_id?: number | null;

  @IsOptional()
  @IsEnum(AssetStatusEnum, { message: `Lo stato deve essere uno tra: ${Object.values(AssetStatusEnum).join(', ')}` })
  status?: AssetStatusEnum;

  @IsOptional()
  updated_by_user_id?: number;

  @IsOptional()
  created_by_user_id?: number;

  @IsOptional()
  @IsBoolean()
  deleted?: boolean;

  @IsOptional()
  create_date?: Date;

  @IsOptional()
  update_date?: Date;
}

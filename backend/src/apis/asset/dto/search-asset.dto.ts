import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { AssetStatusEnum } from '@apis/asset/enum/asset-status.enum';

export class SearchAssetDto {
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
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsInt()
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
  latitude?: string;

  @IsOptional()
  @IsString()
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
    value !== undefined && value !== null && value !== '' ? String(value) : undefined,
  )
  @IsString()
  area_sqm?: string;

  @IsOptional()
  @Transform(({ value }) =>
    value !== undefined && value !== null && value !== '' ? String(value) : undefined,
  )
  @IsString()
  cadastral_value?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsInt()
  asset_type_id?: number;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsInt()
  nature_id?: number;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsInt()
  function_id?: number;

  @IsOptional()
  @IsEnum(AssetStatusEnum)
  status?: AssetStatusEnum;

  // Solo immobili ancora col vecchio tipo (asset_type_id valorizzato): usato
  // dal banner "N immobili da riclassificare".
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  legacy_only?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  deleted?: boolean;
}

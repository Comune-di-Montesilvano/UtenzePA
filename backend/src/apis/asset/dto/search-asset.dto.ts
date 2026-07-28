import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

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
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  deleted?: boolean;
}

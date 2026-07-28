import { IsNotEmpty, IsOptional, IsString, IsInt, MaxLength, IsNumber } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateAssetDto {
  @IsNotEmpty({ message: 'Il campo asset_name è obbligatorio' })
  @IsString()
  @MaxLength(255)
  asset_name: string;

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
  ownership: number;

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
  @IsNumber({}, { message: 'Il campo area_sqm deve essere un numero' })
  area_sqm?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Il campo cadastral_value deve essere un numero' })
  cadastral_value?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsNotEmpty({ message: 'Il campo asset_type_id è obbligatorio' })
  @Transform(({ value }) =>
    value !== undefined && value !== null && value !== '' ? parseInt(value, 10) : value,
  )
  @IsInt()
  asset_type_id: number;

  @IsOptional()
  @IsInt()
  created_by_user_id?: number;

  @IsOptional()
  @IsInt()
  updated_by_user_id?: number;
}

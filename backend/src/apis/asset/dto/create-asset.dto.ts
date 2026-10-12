import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsInt,
  MaxLength,
  IsNumber,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { AssetStatusEnum } from '@apis/asset/enum/asset-status.enum';
import { AssetMefFieldsDto } from './cadastral-unit.dto';

export class CreateAssetDto extends AssetMefFieldsDto {
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
  @IsNumber({}, { message: 'Il campo area_sqm deve essere un numero' })
  area_sqm?: number;

  @IsNotEmpty({ message: 'La tipologia immobile è obbligatoria' })
  @Transform(({ value }) =>
    value !== undefined && value !== null && value !== '' ? parseInt(value, 10) : value,
  )
  @IsInt()
  nature_id: number;

  @IsNotEmpty({ message: 'La funzione immobile è obbligatoria' })
  @Transform(({ value }) =>
    value !== undefined && value !== null && value !== '' ? parseInt(value, 10) : value,
  )
  @IsInt()
  function_id: number;

  // Complesso di appartenenza (null = nessuno).
  @IsOptional()
  @Transform(({ value }) =>
    value !== undefined && value !== null && value !== '' ? parseInt(value, 10) : null,
  )
  @IsInt()
  complex_id?: number | null;

  @IsOptional()
  @IsEnum(AssetStatusEnum, {
    message: `Lo stato deve essere uno tra: ${Object.values(AssetStatusEnum).join(', ')}`,
  })
  status?: AssetStatusEnum;

  @IsOptional()
  @IsInt()
  created_by_user_id?: number;

  @IsOptional()
  @IsInt()
  updated_by_user_id?: number;
}

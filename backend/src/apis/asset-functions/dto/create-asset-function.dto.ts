import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { MefBuildingType, MefPurpose } from '@apis/asset/enum/mef-domains.enum';

export class CreateAssetFunctionDto {
  @IsNotEmpty({ message: 'Il nome è obbligatorio' })
  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string | null;

  // Tipologia e finalità del censimento MEF (vedi AssetFunction).
  @IsOptional()
  @IsEnum(MefBuildingType)
  mef_building_type?: MefBuildingType | null;

  @IsOptional()
  @IsEnum(MefPurpose)
  mef_purpose?: MefPurpose | null;

  @IsOptional()
  @IsInt()
  created_by_user_id?: number;

  @IsOptional()
  @IsInt()
  updated_by_user_id?: number;

  @IsOptional()
  @IsBoolean()
  deleted?: boolean;
}

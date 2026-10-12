import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { MefBuildingType, MefPurpose } from '@apis/asset/enum/mef-domains.enum';

export class UpdateAssetFunctionDto {
  @IsOptional()
  id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

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

  @IsOptional()
  create_date?: Date;

  @IsOptional()
  update_date?: Date;
}

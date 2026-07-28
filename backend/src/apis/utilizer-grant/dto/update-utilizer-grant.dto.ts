import { IsOptional, IsString, IsInt, MaxLength, IsBoolean } from 'class-validator';

export class UpdateUtilizerGrantDto {
  @IsOptional()
  id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  concession_act?: string;

  @IsOptional()
  @IsBoolean()
  utilities_to_be_taken_over?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  usage_type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  grant_date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  expire_date?: string;

  @IsOptional()
  @IsInt()
  asset_id_fk?: number;

  @IsOptional()
  @IsInt()
  utilizer_id_fk?: number;

  @IsOptional()
  create_date?: Date;

  @IsOptional()
  update_date?: Date;

  @IsOptional()
  created_by_user_id?: number;

  @IsOptional()
  updated_by_user_id?: number;

  @IsOptional()
  @IsBoolean()
  deleted?: boolean;
}

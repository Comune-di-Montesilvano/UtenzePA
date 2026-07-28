import { IsOptional, IsString, MaxLength, IsInt, IsBoolean } from 'class-validator';

export class UpdateMaintenanceManagerDto {
  @IsOptional()
  id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  code?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  deleted?: boolean;

  @IsOptional()
  @IsInt()
  updated_by_user_id?: number;

  @IsOptional()
  @IsInt()
  created_by_user_id?: number;

  @IsOptional()
  create_date?: Date;

  @IsOptional()
  update_date?: Date;
}

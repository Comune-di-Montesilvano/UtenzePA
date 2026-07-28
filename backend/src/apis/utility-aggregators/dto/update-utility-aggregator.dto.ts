import { IsOptional, IsString, IsBoolean } from 'class-validator';

export class UpdateUtilityAggregatorDto {
  @IsOptional()
  id?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  code?: string;

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

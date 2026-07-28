import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateUtilizerDto {
  @IsOptional()
  id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

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

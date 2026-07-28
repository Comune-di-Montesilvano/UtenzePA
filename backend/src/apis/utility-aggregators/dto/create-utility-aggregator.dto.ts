import { IsNotEmpty, IsOptional, IsBoolean, IsString, IsInt } from 'class-validator';

export class CreateUtilityAggregatorDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsNotEmpty({ message: 'Il campo code è obbligatorio' })
  @IsString()
  code: string;

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

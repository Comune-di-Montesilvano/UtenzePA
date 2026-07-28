import { IsNotEmpty, IsOptional, IsBoolean, IsString } from 'class-validator';

export class CreateAssetAggregatorDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsNotEmpty({ message: 'Il campo created_by_user_id è obbligatorio' })
  created_by_user_id: number;

  @IsOptional()
  @IsNotEmpty({ message: 'Il campo updated_by_user_id è obbligatorio' })
  updated_by_user_id: number;

  @IsOptional()
  @IsBoolean()
  deleted?: boolean;
}

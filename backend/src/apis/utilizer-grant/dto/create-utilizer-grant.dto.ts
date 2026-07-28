import { IsNotEmpty, IsOptional, IsString, IsInt, MaxLength, IsBoolean } from 'class-validator';

export class CreateUtilizerGrantDto {
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

  @IsNotEmpty({ message: 'Il campo asset_id_fk è obbligatorio' })
  @IsInt()
  asset_id_fk: number;

  @IsNotEmpty({ message: 'Il campo utilizer_id_fk è obbligatorio' })
  @IsInt()
  utilizer_id_fk: number;

  @IsOptional()
  @IsInt()
  created_by_user_id?: number;

  @IsOptional()
  @IsInt()
  updated_by_user_id?: number;
}

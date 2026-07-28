import { IsNotEmpty, IsOptional, IsString, MaxLength, IsInt } from 'class-validator';

export class CreateMaintenanceManagerDto {
  @IsNotEmpty({ message: 'Il codice del gestore è obbligatorio.' })
  @IsString()
  @MaxLength(100)
  code: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  created_by_user_id?: number;

  @IsOptional()
  @IsInt()
  updated_by_user_id?: number;
}

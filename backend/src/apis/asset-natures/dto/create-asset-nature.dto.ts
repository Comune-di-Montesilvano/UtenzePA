import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateAssetNatureDto {
  @IsNotEmpty({ message: 'Il nome è obbligatorio' })
  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string | null;

  // Funzioni ammesse per questa natura (tabella asset_nature_functions).
  @IsOptional()
  @IsArray({ message: 'Le funzioni ammesse devono essere un array.' })
  @IsInt({ each: true, message: 'Ogni funzione ammessa deve essere un ID intero.' })
  function_ids?: number[];

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

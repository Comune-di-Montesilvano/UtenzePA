import { IsArray, IsBoolean, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateAssetNatureDto {
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

  // Se presente sostituisce l'intero insieme delle funzioni ammesse.
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

  @IsOptional()
  create_date?: Date;

  @IsOptional()
  update_date?: Date;
}

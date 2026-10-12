import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ComplexType } from '../enum/complex-type.enum';
import { ComplexKind } from '../enum/complex-kind.enum';

export class CreateComplexDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsEnum(ComplexType)
  complex_type?: ComplexType | null;

  @IsOptional()
  @IsEnum(ComplexKind)
  kind?: ComplexKind;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  toponym?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  civic_number?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  latitude?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  longitude?: string | null;

  @IsOptional()
  @IsInt()
  mef_compendium_id?: number | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  // Immobili del complesso: sostituisce l'insieme (assente = invariato).
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  asset_ids?: number[];
}

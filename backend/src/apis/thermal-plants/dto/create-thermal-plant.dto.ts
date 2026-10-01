import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateThermalPlantDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  utility_id_fk?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  power_kw?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  generators_description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  vvf_certification?: string | null;

  @IsOptional()
  @IsBoolean()
  vvf_exempt?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  inail_certification?: string | null;

  @IsOptional()
  @IsBoolean()
  inail_exempt?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  served_area_sqm?: number | null;

  @IsOptional()
  @IsBoolean()
  water_room?: boolean | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  outdoor_units?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  indoor_units?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  fan_coils?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  air_handling_units?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  chillers_heat_pumps?: number | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

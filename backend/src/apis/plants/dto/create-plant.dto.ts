import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PlantStatus, PlantType } from '../enum/plant.enum';
import { PlantThermalDto } from './plant-thermal.dto';
import { PlantElevatorDto } from './plant-elevator.dto';

export class CreatePlantDto {
  @IsEnum(PlantType)
  type: PlantType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  code: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  asset_id_fk?: number | null;

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
  @IsEnum(PlantStatus)
  status?: PlantStatus;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  utility_ids?: number[];

  // Dati specifici: considerati solo se coerenti con il tipo.
  @IsOptional()
  @ValidateNested()
  @Type(() => PlantThermalDto)
  thermal?: PlantThermalDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => PlantElevatorDto)
  elevator?: PlantElevatorDto | null;
}

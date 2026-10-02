import { PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { FireEquipmentType } from '../enum/plant.enum';

export class CreatePlantFireEquipmentDto {
  @IsEnum(FireEquipmentType)
  equipment_type: FireEquipmentType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  serial_number?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  agent?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  capacity?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class UpdatePlantFireEquipmentDto extends PartialType(CreatePlantFireEquipmentDto) {}

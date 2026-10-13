import { PartialType } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { DateOnly } from '@/common/decorators/date-only.decorator';
import { FireEquipmentType } from '../enum/plant.enum';

export class CreatePlantFireEquipmentDto {
  @IsEnum(FireEquipmentType)
  equipment_type: FireEquipmentType;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

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

  // Mese/anno (solo estintori): il server porta la data al primo del mese.
  @IsOptional()
  @DateOnly()
  last_check_on?: string | null;

  @IsOptional()
  @DateOnly()
  revision_due_on?: string | null;

  @IsOptional()
  @DateOnly()
  test_due_on?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class UpdatePlantFireEquipmentDto extends PartialType(CreatePlantFireEquipmentDto) {}

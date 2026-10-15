import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { DateOnly } from '@/common/decorators/date-only.decorator';
import { ConformityType, ElectricalSupply, GroundingClass } from '../enum/plant.enum';

export class PlantElectricalDto {
  @IsOptional()
  @IsEnum(ElectricalSupply)
  supply?: ElectricalSupply | null;

  @IsOptional()
  @IsEnum(GroundingClass)
  grounding_class?: GroundingClass | null;

  @IsOptional()
  @IsEnum(ConformityType)
  conformity_type?: ConformityType | null;

  @IsOptional()
  @DateOnly()
  conformity_date?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  conformity_number?: string | null;

  @IsOptional()
  @DateOnly()
  inail_date?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  inail_number?: string | null;

  @IsOptional()
  @IsBoolean()
  lightning_protection?: boolean | null;
}

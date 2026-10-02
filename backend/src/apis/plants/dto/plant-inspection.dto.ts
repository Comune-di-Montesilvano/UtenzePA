import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreatePlantInspectionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  kind: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  period_months?: number | null;

  @IsOptional()
  @IsDateString({ strict: true })
  last_date?: string | null;

  // Se assente: last_date + period_months.
  @IsOptional()
  @IsDateString({ strict: true })
  next_date?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  provider?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  outcome?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class UpdatePlantInspectionDto extends PartialType(CreatePlantInspectionDto) {}

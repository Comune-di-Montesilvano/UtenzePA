import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class PlantElevatorDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  serial_number?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  plant_number?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  manufacturer?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2100)
  year?: number | null;

  @IsOptional()
  @IsDateString({ strict: true })
  test_date?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  elevator_type?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  drive?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  capacity_kg?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stops?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  speed?: string | null;
}

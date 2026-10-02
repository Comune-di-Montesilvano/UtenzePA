import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { PlantStatus, PlantType } from '../enum/plant.enum';

export type PlantInspectionFilter = 'overdue' | 'due_soon';
export type PlantPositionFilter = 'precise' | 'from_asset' | 'estimated' | 'missing';

const toInt = ({ value }: { value: unknown }) =>
  value === '' || value === undefined ? undefined : Number(value);

export class SearchPlantDto {
  @IsOptional()
  @IsEnum(PlantType)
  type?: PlantType;

  @IsOptional()
  @IsEnum(PlantStatus)
  status?: PlantStatus;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  asset_id?: number;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  utility_id?: number;

  @IsOptional()
  @IsIn(['overdue', 'due_soon'])
  inspection?: PlantInspectionFilter;

  @IsOptional()
  @IsIn(['precise', 'from_asset', 'estimated', 'missing'])
  position?: PlantPositionFilter;

  @IsOptional()
  @IsString()
  q?: string;
}

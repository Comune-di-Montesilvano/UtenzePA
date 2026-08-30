import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional } from 'class-validator';

export class MapQueryDto {
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => (value === undefined ? undefined : value === true || value === 'true'))
  showAssets?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => (value === undefined ? undefined : value === true || value === 'true'))
  showUtilities?: boolean;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value === undefined ? undefined : Number(value)))
  @IsInt()
  assetAggregatorId?: number;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value === undefined ? undefined : Number(value)))
  @IsInt()
  utilityTypeId?: number;
}

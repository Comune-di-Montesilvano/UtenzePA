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

  // Filtro multiselect lato frontend — arriva come stringa "1,2,3" (query
  // param singolo, coerente con MapService.getPoints che serializza un array
  // con String(), non "?assetAggregatorId=1&assetAggregatorId=2").
  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === undefined
      ? undefined
      : String(value)
          .split(',')
          .map((v: string) => Number(v))
          .filter((n: number) => !Number.isNaN(n)),
  )
  @IsInt({ each: true })
  assetAggregatorIds?: number[];

  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === undefined
      ? undefined
      : String(value)
          .split(',')
          .map((v: string) => Number(v))
          .filter((n: number) => !Number.isNaN(n)),
  )
  @IsInt({ each: true })
  utilityTypeIds?: number[];
}

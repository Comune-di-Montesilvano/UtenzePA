import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional } from 'class-validator';
import { AssetStatusEnum } from '@apis/asset/enum/asset-status.enum';
import { PlantStatus, PlantType } from '@apis/plants/enum/plant.enum';

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
  @IsBoolean()
  @Transform(({ value }) => (value === undefined ? undefined : value === true || value === 'true'))
  showPlants?: boolean;

  // Tipi impianto, stringa "FOUNTAIN,TRAFFIC_LIGHT" (stesso formato degli altri filtri).
  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === undefined
      ? undefined
      : String(value)
          .split(',')
          .map((v: string) => v.trim())
          .filter(Boolean),
  )
  @IsEnum(PlantType, { each: true })
  plantTypes?: PlantType[];

  // Stati impianto, "ACTIVE,TO_VERIFY" (default frontend: senza i dismessi).
  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === undefined
      ? undefined
      : String(value)
          .split(',')
          .map((v: string) => v.trim())
          .filter(Boolean),
  )
  @IsEnum(PlantStatus, { each: true })
  plantStatuses?: PlantStatus[];

  // false = solo utenze con fornitura attiva (default frontend); assente = tutte.
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => (value === undefined ? undefined : value === true || value === 'true'))
  includeInactiveUtilities?: boolean;

  // Filtri multiselect lato frontend — arrivano come stringa "1,2,3" (query
  // param singolo, MapService.getPoints serializza l'array con String(), non
  // "?functionIds=1&functionIds=2").
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
  natureIds?: number[];

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
  functionIds?: number[];

  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === undefined
      ? undefined
      : String(value)
          .split(',')
          .filter((v: string) => v !== ''),
  )
  @IsEnum(AssetStatusEnum, { each: true })
  statuses?: AssetStatusEnum[];
}

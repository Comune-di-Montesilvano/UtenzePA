import { ArrayMaxSize, IsArray, IsInt } from 'class-validator';

export class AssignAssetsDto {
  @IsArray()
  @ArrayMaxSize(1000)
  @IsInt({ each: true })
  asset_ids: number[];
}

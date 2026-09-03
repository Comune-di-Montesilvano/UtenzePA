import { IsEnum, IsInt, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { PhotoEntityType } from '../enum/photo-entity-type.enum';

export class PhotoQueryDto {
  @IsEnum(PhotoEntityType, { message: 'entityType deve essere "asset" o "utility"' })
  entityType: PhotoEntityType;

  @Transform(({ value }) => Number(value))
  @IsInt({ message: 'entityId deve essere un intero' })
  @Min(1)
  entityId: number;
}

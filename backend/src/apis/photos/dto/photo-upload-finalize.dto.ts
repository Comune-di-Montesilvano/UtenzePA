import { IsEnum, IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PhotoEntityType } from '../enum/photo-entity-type.enum';

export class PhotoUploadFinalizeDto {
  @IsNotEmpty({ message: 'Il campo uploadId è obbligatorio' })
  @IsString({ message: 'Il campo uploadId deve essere una stringa' })
  uploadId: string;

  @Type(() => Number)
  @IsInt({ message: 'Il campo totalChunks deve essere un intero' })
  @Min(1, { message: 'Il campo totalChunks deve essere >= 1' })
  totalChunks: number;

  @IsEnum(PhotoEntityType, { message: 'entityType deve essere "asset" o "utility"' })
  entityType: PhotoEntityType;

  @Transform(({ value }) => Number(value))
  @IsInt({ message: 'entityId deve essere un intero' })
  @Min(1)
  entityId: number;

  // Metadati del file originale — persi durante lo slicing lato browser
  // (ogni chunk è un Blob "nudo", non porta più mimetype/filename), vanno
  // passati esplicitamente qui per essere riattaccati al file riassemblato.
  @IsNotEmpty({ message: 'Il campo originalFilename è obbligatorio' })
  @IsString({ message: 'Il campo originalFilename deve essere una stringa' })
  originalFilename: string;

  @IsNotEmpty({ message: 'Il campo mimeType è obbligatorio' })
  @IsString({ message: 'Il campo mimeType deve essere una stringa' })
  mimeType: string;
}

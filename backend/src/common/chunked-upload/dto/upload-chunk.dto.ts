import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UploadChunkDto {
  @IsNotEmpty({ message: 'Il campo uploadId è obbligatorio' })
  @IsString({ message: 'Il campo uploadId deve essere una stringa' })
  uploadId: string;

  @Type(() => Number)
  @IsInt({ message: 'Il campo chunkIndex deve essere un intero' })
  @Min(0, { message: 'Il campo chunkIndex deve essere >= 0' })
  chunkIndex: number;

  @Type(() => Number)
  @IsInt({ message: 'Il campo totalChunks deve essere un intero' })
  @Min(1, { message: 'Il campo totalChunks deve essere >= 1' })
  totalChunks: number;
}

import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { AttachmentQueryDto } from './attachment-query.dto';

export class AttachmentFinalizeDto extends AttachmentQueryDto {
  @IsNotEmpty()
  @IsString()
  uploadId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  totalChunks: number;

  @IsNotEmpty({ message: 'Nome del file mancante' })
  @IsString()
  @MaxLength(255)
  originalFilename: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string | null;
}

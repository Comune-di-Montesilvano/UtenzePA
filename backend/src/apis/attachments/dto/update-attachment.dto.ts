import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateAttachmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string | null;
}

import { IsEnum, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { AttachmentEntityType } from '../enum/attachment-entity-type.enum';

export class AttachmentQueryDto {
  @IsEnum(AttachmentEntityType)
  entity_type: AttachmentEntityType;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  entity_id: number;
}

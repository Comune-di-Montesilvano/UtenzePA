import { IsIn, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ActLinkEntity, LINK_ENTITIES } from '../act-links';

export class ActLinkDto {
  @IsIn(LINK_ENTITIES as unknown as string[])
  entity: ActLinkEntity;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  id: number;
}

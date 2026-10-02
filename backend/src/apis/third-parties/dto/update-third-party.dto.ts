import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateThirdPartyDto } from './create-third-party.dto';

export class UpdateThirdPartyDto extends PartialType(CreateThirdPartyDto) {
  @IsOptional() @IsBoolean() deleted?: boolean;
  @IsOptional() updated_by_user_id?: number;
}

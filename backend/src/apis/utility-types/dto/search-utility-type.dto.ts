import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { HardTypeEnum } from '@apis/utility-types/enum/hard-type.enum';

export class SearchUtilityTypeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(HardTypeEnum, {
    message: `Il campo hard_type deve essere uno dei seguenti valori: ${Object.values(HardTypeEnum).join(', ')}`,
  })
  hard_type?: HardTypeEnum;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true' || value === 1 || value === true) return true;
    if (value === 'false' || value === 0 || value === false) return false;
    return value;
  })
  deleted?: boolean;
}

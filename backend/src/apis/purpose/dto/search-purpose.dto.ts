import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { UseTypeEnum } from '@apis/purpose/enum/useType.enum';

export class SearchPurposeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(UseTypeEnum, {
    message: `Il campo use_type deve essere uno dei seguenti valori: ${Object.values(UseTypeEnum).join(', ')}`,
  })
  use_type?: UseTypeEnum;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true' || value === 1 || value === true) return true;
    if (value === 'false' || value === 0 || value === false) return false;
    return value;
  })
  deleted?: boolean;
}

import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { UseTypeEnum } from '@apis/purpose/enum/useType.enum';

export class UpdatePurposeDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsEnum(UseTypeEnum, {
    message: `Il campo use_type deve essere uno dei seguenti valori: ${Object.values(UseTypeEnum).join(', ')}`,
  })
  use_type?: UseTypeEnum;

  @IsOptional()
  @IsInt()
  created_by_user_id?: number;

  @IsOptional()
  @IsInt()
  updated_by_user_id?: number;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true' || value === 1 || value === true) return true;
    if (value === 'false' || value === 0 || value === false) return false;
    return value;
  })
  deleted?: boolean;
}

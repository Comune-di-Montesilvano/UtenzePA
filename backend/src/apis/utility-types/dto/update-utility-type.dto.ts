import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { HardTypeEnum } from '@apis/utility-types/enum/hard-type.enum';
import { Transform } from 'class-transformer';

export class UpdateUtilityTypeDto {
  @IsOptional()
  @IsArray({ message: "ILe finalità d'uso devono essere forniti come un array." })
  @IsInt({ each: true, message: "Ogni elemento delle finalità d'uso deve essere un ID intero." })
  purposes?: number[];

  @IsNotEmpty({ message: 'Il nome è obbligatorio' })
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

import { IsArray, IsEnum, IsInt, IsNotEmpty, IsOptional } from 'class-validator';
import { HardTypeEnum } from '@apis/utility-types/enum/hard-type.enum';

export class CreateUtilityTypeDto {
  @IsNotEmpty({ message: 'Il nome è obbligatorio' })
  name: string;

  @IsOptional()
  description: string;

  @IsEnum(HardTypeEnum, {
    message: `Il campo hard_type deve essere uno dei seguenti valori: ${Object.values(HardTypeEnum).join(', ')}`,
  })
  hard_type: HardTypeEnum;

  @IsOptional()
  @IsInt()
  created_by_user_id?: number;

  @IsOptional()
  @IsInt()
  updated_by_user_id?: number;

  @IsOptional()
  @IsArray({ message: "ILe finalità d'uso devono essere forniti come un array." })
  @IsInt({ each: true, message: "Ogni elemento delle finalità d'uso deve essere un ID intero." })
  purposes?: number[];
}

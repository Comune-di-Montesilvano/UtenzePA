import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { UseTypeEnum } from '@apis/purpose/enum/useType.enum';

export class CreatePurposeDto {
  @IsNotEmpty({ message: 'Il campo nome è obbligatorio' })
  @IsString({ message: 'Il campo nome deve essere una stringa' })
  @MaxLength(255)
  name: string;

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
}

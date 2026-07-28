import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { SupplyTypeEnum } from '@apis/budget-chapters/enum/supply-type.enum';
import { Transform } from 'class-transformer';

export class CreateBudgetChapterDto {
  @IsNotEmpty({ message: 'Il campo chapter_code è obbligatorio' })
  @IsString()
  @MaxLength(50)
  chapter_code: string;

  @IsOptional()
  @Transform(({ value }) =>
    value !== undefined && value !== null && value !== '' ? parseInt(value, 10) : value,
  )
  @IsInt()
  article?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  pdc?: string;

  @IsEnum(SupplyTypeEnum, {
    message: `Il campo use_type deve essere uno dei seguenti valori: ${Object.values(SupplyTypeEnum).join(', ')}`,
  })
  supply_type?: SupplyTypeEnum;

  @IsOptional()
  @IsInt()
  created_by_user_id?: number;

  @IsOptional()
  @IsInt()
  updated_by_user_id?: number;
}

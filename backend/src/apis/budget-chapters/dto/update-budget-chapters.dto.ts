import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { SupplyTypeEnum } from '@apis/budget-chapters/enum/supply-type.enum';

export class UpdateBudgetChapterDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  chapter_code?: string;

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

  @IsOptional()
  @IsEnum(SupplyTypeEnum, {
    message: `Il campo supply_type deve essere uno dei seguenti valori: ${Object.values(SupplyTypeEnum).join(', ')}`,
  })
  supply_type?: SupplyTypeEnum;

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

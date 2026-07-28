import { Transform } from 'class-transformer';
import { IsBoolean, IsDate, IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { SupplyTypeEnum } from '@apis/budget-chapters/enum/supply-type.enum';

export class SearchBudgetChapterDto {
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsInt()
  id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  chapter_code?: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
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
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsInt()
  created_by_user_id?: number;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsInt()
  updated_by_user_id?: number;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  deleted?: boolean;

  /** Filtri a range sulla data di creazione */
  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return undefined;
    const date = new Date(value);
    return isNaN(date.getTime()) ? undefined : date;
  })
  @IsDate()
  create_date_from?: Date;

  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return undefined;
    const date = new Date(value);
    if (isNaN(date.getTime())) return undefined;
    date.setHours(23, 59, 59, 999);
    return date;
  })
  @IsDate()
  create_date_to?: Date;
}

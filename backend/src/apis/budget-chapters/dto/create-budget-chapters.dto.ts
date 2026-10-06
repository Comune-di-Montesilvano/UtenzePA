import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
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

  // Tipi utenza del capitolo (tabella budget_chapter_utility_types); vuoto = tutti.
  @IsOptional()
  @IsArray({ message: 'I tipi utenza devono essere un array.' })
  @IsInt({ each: true, message: 'Ogni tipo utenza deve essere un ID intero.' })
  utility_type_ids?: number[];

  @IsOptional()
  @IsInt()
  created_by_user_id?: number;

  @IsOptional()
  @IsInt()
  updated_by_user_id?: number;
}

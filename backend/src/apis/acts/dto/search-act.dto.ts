import { IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

const bool = ({ value }: { value: unknown }) => value === true || value === 'true' || value === '1';

export class SearchActDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  act_type_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  year?: number;

  @IsOptional()
  @Transform(bool)
  without_files?: boolean;

  @IsOptional()
  @IsIn(['asset', 'plant', 'utilizer_grant', 'contract', 'none'])
  linked_to?: string;

  @IsOptional()
  @Transform(bool)
  deleted?: boolean;
}

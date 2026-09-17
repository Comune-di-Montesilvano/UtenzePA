import { Transform } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Min } from 'class-validator';

const toOptionalInt = ({ value }: { value: unknown }) =>
  value === undefined || value === '' ? undefined : Number(value);

export class QueryAuditLogDto {
  @IsString()
  entity: string;

  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(1)
  entityId?: number;

  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(1)
  userId?: number;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(1)
  pageSize?: number;
}

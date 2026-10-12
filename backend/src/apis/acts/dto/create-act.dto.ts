import {
  ArrayUnique,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { DateOnly } from '@/common/decorators/date-only.decorator';

const trimOrNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? (value.trim() ? value.trim() : null) : value;

export class CreateActDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  act_type_id: number;

  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(100)
  number?: string | null;

  @IsOptional()
  @DateOnly()
  act_date?: string | null;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: "L'oggetto è obbligatorio" })
  @MaxLength(500)
  subject: string;

  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(255)
  issuer?: string | null;

  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(100)
  protocol_number?: string | null;

  @IsOptional()
  @DateOnly()
  protocol_date?: string | null;

  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  asset_ids?: number[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  plant_ids?: number[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  utilizer_grant_ids?: number[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  contract_ids?: number[];
}

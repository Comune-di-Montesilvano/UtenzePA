import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateConsipAgreementDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  description: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  cig_master: string;

  @IsOptional()
  @Transform(({ value }) => (value ? (value as string).slice(0, 10) : value))
  @IsDateString()
  expiration_date: string;

  @IsOptional()
  @IsInt()
  @IsIn([0, 1])
  safeguard: number;

  @IsOptional()
  @IsInt()
  supplier_id: number;

  @IsOptional()
  create_date?: Date;

  @IsOptional()
  update_date?: Date;

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
  deleted?: number;
}

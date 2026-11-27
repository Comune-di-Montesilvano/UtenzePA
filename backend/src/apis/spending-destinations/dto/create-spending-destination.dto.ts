import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateSpendingDestinationDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'Il nome è obbligatorio' })
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

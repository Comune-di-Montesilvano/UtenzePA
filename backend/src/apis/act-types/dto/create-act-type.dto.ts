import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateActTypeDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'Il nome è obbligatorio' })
  @MaxLength(150)
  name: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sort_order?: number;
}

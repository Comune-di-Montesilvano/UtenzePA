import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ComplexType } from '../enum/complex-type.enum';

export class SearchComplexDto {
  @IsOptional()
  @IsEnum(ComplexType)
  complex_type?: ComplexType;

  @IsOptional()
  @IsString()
  q?: string;
}

import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateAccountingImportDto {
  @IsOptional()
  @IsBoolean({ message: 'Il campo enabled deve essere booleano' })
  enabled?: boolean;

  @IsOptional()
  @IsInt({ message: "L'anno di partenza deve essere un numero intero" })
  @Min(2000, { message: "L'anno di partenza non può essere prima del 2000" })
  @Max(new Date().getFullYear(), { message: "L'anno di partenza non può essere nel futuro" })
  from_year?: number;
}

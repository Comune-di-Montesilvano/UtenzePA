import { IsBoolean } from 'class-validator';

export class UpdateInvoiceImportDto {
  @IsBoolean({ message: 'Il campo enabled deve essere booleano' })
  enabled: boolean;
}

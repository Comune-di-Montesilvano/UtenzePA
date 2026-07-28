import { IsInt, IsNotEmpty } from 'class-validator';

export class DeleteInvoiceDto {
  @IsNotEmpty({ message: 'Campo updated_by_user_id è obbligatorio' })
  @IsInt()
  updated_by_user_id: number;
}

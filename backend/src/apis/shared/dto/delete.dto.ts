import { IsInt, IsNotEmpty } from 'class-validator';

export class DeleteDto {
  @IsNotEmpty({ message: 'Campo updated_by_user_id è obbligatorio' })
  @IsInt()
  updated_by_user_id: number;
}

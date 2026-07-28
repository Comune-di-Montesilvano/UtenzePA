import { IsEmail, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { UserRole, UserStatus } from '@/apis/shared/enum/user.enums';

export class CreateSystemUserDto {
  @IsNotEmpty({ message: 'Il nome è obbligatorio' })
  firstName: string;

  @IsNotEmpty({ message: 'Il cognome è obbligatorio' })
  lastName: string;

  @IsEmail({}, { message: 'Email non valida' })
  email: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsNotEmpty({ message: 'Password obbligatoria' })
  password: string;
}

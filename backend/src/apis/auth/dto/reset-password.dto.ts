import { IsEmail, IsNotEmpty, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsEmail({}, { message: 'Email non valida' })
  email: string;

  @IsNotEmpty({ message: 'OTP obbligatorio' })
  otp: string;

  @MinLength(8, { message: 'La password deve avere almeno 8 caratteri' })
  newPassword: string;
}

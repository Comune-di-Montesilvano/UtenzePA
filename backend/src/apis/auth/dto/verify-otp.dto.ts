import { IsEmail, IsNotEmpty } from 'class-validator';

export class VerifyOtpDto {
  @IsEmail({}, { message: 'Email non valida' })
  email: string;

  @IsNotEmpty({ message: 'OTP obbligatorio' })
  otp: string;
}

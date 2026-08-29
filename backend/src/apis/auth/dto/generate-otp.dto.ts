import { IsEmail } from 'class-validator';

export class GenerateOtpDto {
  @IsEmail({}, { message: 'Email non valida' })
  email: string;
}

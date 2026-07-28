import { IsEmail, IsOptional, IsString } from 'class-validator';

export class UpdateSystemUserDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  role?: string;

  @IsOptional()
  status?: string;

  created_by_user_id?: number;
  updated_by_user_id?: number;

  otp?: string;
  otp_expires?: Date;
}

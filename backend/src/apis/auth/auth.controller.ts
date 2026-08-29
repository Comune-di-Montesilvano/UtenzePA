import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { GenerateOtpDto } from './dto/generate-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Controller('authModule')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() body: LoginDto) {
    try {
      const user = await this.authService.validateUser(body.email, body.password);
      if (!user) {
        return { status: 'error', message: 'Invalid credentials' };
      }

      if (user.deleted) {
        return { status: 'error_deleted', message: 'Deleted user.' };
      }

      const token = await this.authService.login(user);

      return {
        status: 'ok',
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
        token,
      };
    } catch (error) {
      console.error('Login error:', error);
      return { status: 'error', message: 'Internal server error' };
    }
  }

  @Post('generate-otp')
  async generateOtp(@Body() body: GenerateOtpDto) {
    const success = await this.authService.generateOtp(body.email);
    if (!success) {
      return { status: 'error', message: 'User not found' };
    }
    return { status: 'ok' };
  }

  @Post('verify-otp')
  async verifyOtp(@Body() body: VerifyOtpDto) {
    const valid = await this.authService.verifyOtp(body.email, body.otp);
    return { status: valid ? 'ok' : 'error' };
  }

  @Post('reset-password')
  async resetPassword(@Body() body: ResetPasswordDto) {
    const success = await this.authService.resetPassword(body.email, body.otp, body.newPassword);
    return { status: success ? 'ok' : 'error' };
  }
}

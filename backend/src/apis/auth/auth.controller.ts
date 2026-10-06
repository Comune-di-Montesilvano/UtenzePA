import { Controller, Post, Body, HttpCode, Logger, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuditLogService } from '@apis/audit-log/audit-log.service';
import { AccessChannel, AuditAction } from '@apis/audit-log/entity/audit-log.entity';
import { AuthProvider } from '../shared/enum/user.enums';
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard';
import { CurrentUser, ICurrentUser } from '@core/auth/decorators/current-user.decorator';
import { LogoutDto } from './dto/logout.dto';
import { LoginDto } from './dto/login.dto';
import { GenerateOtpDto } from './dto/generate-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Controller('authModule')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly auditLog: AuditLogService,
  ) {}

  // Il log accessi non deve mai bloccare login o logout.
  private async recordAccess(
    userId: number,
    action: AuditAction.LOGIN | AuditAction.LOGOUT | AuditAction.TIMEOUT,
    channel: AccessChannel | null = null,
  ): Promise<void> {
    try {
      await this.auditLog.recordAccess(userId, action, channel);
    } catch (error) {
      this.logger.error(`Log accessi non scritto: ${(error as Error).message}`);
    }
  }

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
      await this.recordAccess(
        user.id,
        AuditAction.LOGIN,
        user.authProvider === AuthProvider.LDAP ? AccessChannel.LDAP : AccessChannel.LOCAL,
      );

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

  @Post('logout')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async logout(@Body() body: LogoutDto, @CurrentUser() user: ICurrentUser): Promise<void> {
    await this.recordAccess(
      user.id,
      body.reason === 'TIMEOUT' ? AuditAction.TIMEOUT : AuditAction.LOGOUT,
    );
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

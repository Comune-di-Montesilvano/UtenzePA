import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { Roles } from '@/core/auth/decorators/roles.decorator';
import { CurrentUser, ICurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { SettingsService } from './settings.service';
import { UpdateBrandingDto } from './dto/update-branding.dto';
import { AppSettings } from './entity/app-settings.entity';

@Controller('settings')
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  // Pubblico: serve alla login page (prima dell'autenticazione) e al
  // title/favicon del tab browser, caricati a bootstrap dell'app.
  @Get('branding')
  getBranding(): Promise<AppSettings> {
    return this.service.getBranding();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Admin')
  @Patch('branding')
  updateBranding(
    @Body() dto: UpdateBrandingDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<AppSettings> {
    return this.service.updateBranding(dto, user.id);
  }
}

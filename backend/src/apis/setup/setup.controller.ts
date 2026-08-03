import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { SetupService } from './setup.service';
import { SetupGuard } from './setup.guard';

@Controller('setup')
export class SetupController {
  constructor(private readonly setupService: SetupService) {}

  @Get('status')
  async status() {
    return { available: await this.setupService.isAvailable() };
  }

  @UseGuards(SetupGuard)
  @Post('request-otp')
  async requestOtp(
    @Body() body: { email: string; firstName: string; lastName: string; password: string },
  ) {
    const success = await this.setupService.requestOtp(body);
    return { status: success ? 'ok' : 'error' };
  }

  @UseGuards(SetupGuard)
  @Post('verify')
  async verify(@Body() body: { email: string; otp: string }) {
    return { status: 'ok' };
  }
}

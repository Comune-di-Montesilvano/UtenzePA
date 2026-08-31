import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemUser } from '../system-users/entity/system-user.entity';
import { EMailerModule } from '@/core/email/mailer.module';
import { SetupService } from './setup.service';
import { SetupGuard } from './setup.guard';
import { SetupController } from './setup.controller';
import { SettingsModule } from '@apis/settings/settings.module';

@Module({
  imports: [TypeOrmModule.forFeature([SystemUser]), EMailerModule, SettingsModule],
  controllers: [SetupController],
  providers: [SetupService, SetupGuard],
})
export class SetupModule {}

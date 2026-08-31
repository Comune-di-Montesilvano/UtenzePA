import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { AppSettings } from './entity/app-settings.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AppSettings])],
  providers: [SettingsService],
  controllers: [SettingsController],
  exports: [SettingsService],
})
export class SettingsModule {}

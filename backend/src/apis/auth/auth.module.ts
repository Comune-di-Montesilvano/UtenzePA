// src/apis/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { SystemUser } from '../system-users/entity/system-user.entity';
import { JwtModule } from '@nestjs/jwt';
import { EMailerModule } from '@/core/email/mailer.module';
import { JwtStrategyMySql } from '@/core/auth/guards/jwt.strategy';
import { SettingsModule } from '@apis/settings/settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SystemUser]),
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET || 'defaultSecret',
    }),
    EMailerModule,
    SettingsModule,
  ],
  providers: [AuthService, JwtStrategyMySql],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthMysqlModule {}

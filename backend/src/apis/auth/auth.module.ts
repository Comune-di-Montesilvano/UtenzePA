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
import { LdapService } from './ldap/ldap.service';
import { jwtExpiresInSeconds } from '@/core/auth/jwt-expires-in';

@Module({
  imports: [
    TypeOrmModule.forFeature([SystemUser]),
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET || 'defaultSecret',
      // Token breve, rinnovato dal frontend finché l'utente è attivo (refresh).
      signOptions: { expiresIn: jwtExpiresInSeconds() },
    }),
    EMailerModule,
    SettingsModule,
  ],
  providers: [AuthService, JwtStrategyMySql, LdapService],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthMysqlModule {}

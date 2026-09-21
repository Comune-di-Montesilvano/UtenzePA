import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemUser } from '../system-users/entity/system-user.entity';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { EMailerService } from '@/core/email/email.service';
import { generateOtp } from '../shared/otp.helper';
import { SettingsService } from '@apis/settings/settings.service';
import { LdapService } from './ldap/ldap.service';
import { AuthProvider, UserRole, UserStatus } from '../shared/enum/user.enums';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(SystemUser)
    private readonly userRepository: Repository<SystemUser>,
    private readonly jwtService: JwtService,
    private mailer: EMailerService,
    private settings: SettingsService,
    private readonly ldapService: LdapService,
  ) {}

  async validateUser(email: string, password: string): Promise<SystemUser | null> {
    const user = await this.userRepository.findOne({
      where: { email },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        passwordHash: true,
        authProvider: true,
        deleted: true,
      },
    });

    if (user) {
      if (user.authProvider === AuthProvider.LDAP) {
        return this.validateLdapUser(user, email, password);
      }
      if (user.passwordHash && (await bcrypt.compare(password, user.passwordHash))) {
        return user;
      }
      return null;
    }

    if (this.ldapService.isConfigured()) {
      return this.provisionLdapUser(email, password);
    }

    return null;
  }

  private async validateLdapUser(
    user: SystemUser,
    username: string,
    password: string,
  ): Promise<SystemUser | null> {
    try {
      const ldapUser = await this.ldapService.authenticate(username, password);
      const [firstName, ...rest] = ldapUser.displayName.split(' ');
      user.firstName = firstName || user.firstName;
      user.lastName = rest.join(' ') || user.lastName;
      return await this.userRepository.save(user);
    } catch {
      return null;
    }
  }

  private async provisionLdapUser(email: string, password: string): Promise<SystemUser | null> {
    try {
      const ldapUser = await this.ldapService.authenticate(email, password);
      const [firstName, ...rest] = ldapUser.displayName.split(' ');

      const newUser = this.userRepository.create({
        email,
        firstName: firstName || null,
        lastName: rest.join(' ') || ldapUser.displayName,
        role: UserRole.LETTORE,
        status: UserStatus.ATTIVO,
        authProvider: AuthProvider.LDAP,
        passwordHash: null,
        created_by_user_id: 1,
        updated_by_user_id: 1,
      });

      return await this.userRepository.save(newUser);
    } catch {
      return null;
    }
  }

  async login(user: SystemUser) {
    await this.userRepository.update(user.id, { lastLogin: new Date() });

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }

  async sendOtpEmail(user: SystemUser, otp: string) {
    const { entity_name } = await this.settings.getBrandingSummary();
    const subject = `Reset password OTP UtenzePA - ${entity_name}`;
    const text = `Il tuo codice OTP per il reset della password è: ${otp}`;
    const html = `<p>Il tuo codice OTP per il reset della password è: <b>${otp}</b></p>`;

    // fromName: mittente email = nome ente (non "UtenzePA", quello resta
    // solo nell'oggetto) — vedi spec, riga email.service.ts.
    return this.mailer.sendMail(user.email, subject, text, html, entity_name);
  }

  async generateOtp(email: string): Promise<boolean> {
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) return false;

    const { code: otp, expiry } = generateOtp();

    user.otp = otp;
    user.otp_expiry = expiry;

    await this.userRepository.save(user);

    await this.sendOtpEmail(user, otp);

    return true;
  }

  async verifyOtp(email: string, otp: string): Promise<boolean> {
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user || !user.otp || !user.otp_expiry) return false;

    const now = new Date();
    if (user.otp !== otp || now > user.otp_expiry) return false;

    return true;
  }

  async resetPassword(email: string, otp: string, newPassword: string): Promise<boolean> {
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user || !user.otp || !user.otp_expiry) return false;

    const now = new Date();
    if (user.otp !== otp || now > user.otp_expiry) return false;

    const hash = await bcrypt.hash(newPassword, 10);
    user.passwordHash = hash;

    user.otp = null;
    user.otp_expiry = null;

    await this.userRepository.save(user);
    return true;
  }
}

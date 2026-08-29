import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemUser } from '../system-users/entity/system-user.entity';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { EMailerService } from '@/core/email/email.service';
import { generateOtp } from '../shared/otp.helper';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(SystemUser)
    private readonly userRepository: Repository<SystemUser>,
    private readonly jwtService: JwtService,
    private mailer: EMailerService,
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
        deleted: true,
      },
    });
    if (user && (await bcrypt.compare(password, user.passwordHash))) {
      return user;
    }
    return null;
  }

  async login(user: SystemUser) {
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
    const subject = 'Reset password OTP Gestione Utenze Comunali - Comune di Montesilvano';
    const text = `Il tuo codice OTP per il reset della password è: ${otp}`;
    const html = `<p>Il tuo codice OTP per il reset della password è: <b>${otp}</b></p>`;

    return this.mailer.sendMail(user.email, subject, text, html);
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

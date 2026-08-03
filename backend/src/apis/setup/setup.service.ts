import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SystemUser } from '../system-users/entity/system-user.entity';
import { EMailerService } from '@/core/email/email.service';
import * as bcrypt from 'bcrypt';

interface PendingSetup {
  email: string;
  firstName: string;
  lastName: string;
  passwordHash: string;
  otp: string;
  otpExpiry: Date;
}

@Injectable()
export class SetupService {
  private pending: PendingSetup | null = null;

  constructor(
    @InjectRepository(SystemUser)
    private readonly userRepository: Repository<SystemUser>,
    private readonly mailer: EMailerService,
    private readonly dataSource: DataSource,
  ) {}

  async isAvailable(): Promise<boolean> {
    return (await this.userRepository.count()) === 0;
  }

  async requestOtp(dto: {
    email: string;
    firstName: string;
    lastName: string;
    password: string;
  }): Promise<boolean> {
    if (!(await this.isAvailable())) return false;

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date();
    otpExpiry.setMinutes(otpExpiry.getMinutes() + 60);
    const passwordHash = await bcrypt.hash(dto.password, 10);

    this.pending = {
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      passwordHash,
      otp,
      otpExpiry,
    };

    await this.mailer.sendMail(
      dto.email,
      'Attivazione account amministratore - Gestione Utenze Comunali',
      `Il tuo codice di verifica per completare la configurazione iniziale è: ${otp}`,
      `<p>Il tuo codice di verifica per completare la configurazione iniziale è: <b>${otp}</b></p>`,
    );

    return true;
  }
}

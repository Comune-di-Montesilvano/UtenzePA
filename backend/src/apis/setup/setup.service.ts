import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SystemUser } from '../system-users/entity/system-user.entity';
import { EMailerService } from '@/core/email/email.service';
import * as bcrypt from 'bcrypt';
import { UserRole, UserStatus } from '../shared/enum/user.enums';
import { generateOtp } from '../shared/otp.helper';
import { SettingsService } from '@apis/settings/settings.service';

const MAX_OTP_ATTEMPTS = 5;

interface PendingSetup {
  email: string;
  firstName: string;
  lastName: string;
  passwordHash: string;
  otp: string;
  otpExpiry: Date;
  attempts: number;
}

@Injectable()
export class SetupService {
  private pending: PendingSetup | null = null;

  constructor(
    @InjectRepository(SystemUser)
    private readonly userRepository: Repository<SystemUser>,
    private readonly mailer: EMailerService,
    private readonly dataSource: DataSource,
    private readonly settings: SettingsService,
  ) {}

  async isAvailable(): Promise<boolean> {
    return (await this.userRepository.count()) === 0;
  }

  async requestOtp(dto: {
    email: string;
    firstName: string;
    lastName: string;
    password: string;
    bootstrapToken: string;
  }): Promise<boolean> {
    // Confronto prima di ogni altro controllo (anche prima di isAvailable()):
    // stesso `return false` di un fallimento generico, per non dare a un
    // attaccante un oracolo per capire se il token è la causa del rifiuto.
    if (dto.bootstrapToken !== process.env.SETUP_BOOTSTRAP_TOKEN) return false;

    if (!(await this.isAvailable())) return false;

    const { code: otp, expiry: otpExpiry } = generateOtp();
    const passwordHash = await bcrypt.hash(dto.password, 10);

    this.pending = {
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      passwordHash,
      otp,
      otpExpiry,
      attempts: 0,
    };

    const { entity_name } = await this.settings.getBrandingSummary();
    await this.mailer.sendMail(
      dto.email,
      `Attivazione account amministratore - UtenzePA (${entity_name})`,
      `Il tuo codice di verifica per completare la configurazione iniziale è: ${otp}`,
      `<p>Il tuo codice di verifica per completare la configurazione iniziale è: <b>${otp}</b></p>`,
      entity_name,
    );

    return true;
  }

  async verifyOtp(email: string, otp: string): Promise<boolean> {
    if (!this.pending || this.pending.email !== email) return false;
    if (this.pending.otp !== otp) {
      this.pending.attempts += 1;
      if (this.pending.attempts > MAX_OTP_ATTEMPTS) {
        // Troppi tentativi falliti: invalida lo stato pendente per mitigare
        // il brute-force, l'utente deve rifare da capo la richiesta OTP.
        this.pending = null;
      }
      return false;
    }
    if (new Date() > this.pending.otpExpiry) return false;

    // Anti-race: un'altra richiesta potrebbe aver creato l'admin nel
    // frattempo (due bootstrap in parallelo).
    if (!(await this.isAvailable())) return false;

    const { firstName, lastName, passwordHash } = this.pending;

    await this.dataSource.transaction(async (manager) => {
      // created_by_user_id/updated_by_user_id sono NOT NULL con FK
      // self-referenziante su system_users.id: il primissimo utente non
      // può puntare a un id esistente. Si disabilitano i check FK per la
      // sola connessione di questa transazione, si inserisce, si fa
      // puntare la riga a se stessa, si riabilitano i check.
      await manager.query('SET FOREIGN_KEY_CHECKS=0');
      try {
        const insertResult = await manager.insert(SystemUser, {
          firstName,
          lastName,
          email,
          passwordHash,
          role: UserRole.ADMIN,
          status: UserStatus.ATTIVO,
          created_by_user_id: 0,
          updated_by_user_id: 0,
        });
        const newId = insertResult.identifiers[0].id as number;
        await manager.update(SystemUser, newId, {
          created_by_user_id: newId,
          updated_by_user_id: newId,
        });
      } finally {
        await manager.query('SET FOREIGN_KEY_CHECKS=1');
      }
    });

    this.pending = null;
    return true;
  }
}

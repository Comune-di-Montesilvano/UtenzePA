import {Exclude, plainToInstance} from 'class-transformer';
import {AbstractEntity} from '../../../core/entities/abstract.entity';
import {ISystemUser} from './system-user.interface';

export class SystemUser extends AbstractEntity implements ISystemUser {
  firstName!: string;
  lastName!: string;
  email!: string;
  role!: 'Admin' | 'Operatore' | 'Lettore';
  status!: 'Attivo' | 'Disattivo';

  @Exclude({ toPlainOnly: true })
  otp?: string;

  @Exclude({ toPlainOnly: true })
  otp_expiry?: Date;

  get fullName(): string {
    return `${this.firstName} ${this.lastName}`.trim();
  }

  static create(data?: Partial<SystemUser>): SystemUser {
    return plainToInstance(SystemUser, {
      id: 0,
      firstName: '',
      lastName: '',
      email: '',
      role: null,
      status: 'Attivo',
      create_date: new Date(),
      update_date: new Date(),
      deleted: false,
      ...data,
    });
  }
}


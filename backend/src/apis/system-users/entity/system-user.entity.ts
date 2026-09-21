import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { AuthProvider, UserRole, UserStatus } from '../../shared/enum/user.enums';

@Entity('system_users')
@Index('UK_email', ['email'], { unique: true })
export class SystemUser {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ length: 50, name: 'first_name', nullable: true })
  firstName: string;

  @Column({ length: 50, name: 'last_name', nullable: false })
  lastName: string;

  @Column({ length: 255, nullable: false })
  email: string;

  @Column({ length: 255, select: false, name: 'password_hash', nullable: true })
  passwordHash: string | null;

  @Column({
    type: 'enum',
    enum: AuthProvider,
    default: AuthProvider.LOCAL,
    name: 'auth_provider',
  })
  authProvider: AuthProvider;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.OPERATORE,
  })
  role: UserRole;

  @Column({
    type: 'enum',
    enum: UserStatus,
    default: UserStatus.ATTIVO,
  })
  status: UserStatus;

  @Column({ length: 6, nullable: true })
  otp?: string;

  @Column({ type: 'timestamp', nullable: true })
  otp_expiry?: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'last_login' })
  lastLogin: Date | null;

  @CreateDateColumn({ type: 'timestamp' })
  create_date: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  update_date: Date;

  @Column({ name: 'created_by_user_id' })
  @Index()
  created_by_user_id: number;

  @Column({ name: 'updated_by_user_id' })
  updated_by_user_id: number;

  @Column({ type: 'boolean', default: false })
  deleted: boolean;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'created_by_user_id' })
  created_by: SystemUser;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'updated_by_user_id' })
  updated_by: SystemUser;
}

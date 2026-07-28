import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
} from 'typeorm';
import { SystemUser } from '../../system-users/entity/system-user.entity';
import { Supplier } from '@apis/shared/entities/supplier.entity';

@Entity({ name: 'consip_agreement' })
export class ConsipAgreement {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255, unique: true })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ length: 10 })
  cig_master: string;

  @Column({ type: 'date', nullable: true })
  expiration_date: Date | null;

  @Column({ type: 'tinyint', default: 0 })
  safeguard: boolean;

  @Column({ name: 'supplier_id' })
  @Index()
  supplier_id: number;

  @CreateDateColumn({ type: 'timestamp' })
  create_date: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  update_date: Date;

  @Column({ name: 'created_by_user_id' })
  @Index()
  created_by_user_id: number;

  @Column({ name: 'updated_by_user_id' })
  updated_by_user_id: number;

  @Column({ type: 'tinyint', default: 0 })
  deleted: boolean;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'created_by_user_id' })
  created_by: SystemUser;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'updated_by_user_id' })
  updated_by: SystemUser;

  @OneToOne(() => Supplier)
  @JoinColumn({ name: 'supplier_id' })
  supplier: Supplier;
}

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SystemUser } from '../../system-users/entity/system-user.entity';
import { UtilizerGrant } from '@apis/utilizer-grant/entity/utilizer-grant.entity';

@Entity('utilizer')
export class Utilizer {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ length: 255 })
  name: string;

  @Column({ length: 255, nullable: true })
  description: string;

  // Codice fiscale o partita IVA della controparte (oscurato per il Lettore).
  @Column({ length: 16, nullable: true })
  tax_code: string | null;

  // Telefoni, email, referente: testo libero come nelle fonti.
  @Column({ type: 'text', nullable: true })
  contacts: string | null;

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
  @JoinColumn({ name: 'updated_by_user_id' })
  updated_by: SystemUser;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'created_by_user_id' })
  created_by: SystemUser;

  @OneToMany(() => UtilizerGrant, (utilizerGrant) => utilizerGrant.utilizer)
  utilizerGrants: UtilizerGrant[];
}

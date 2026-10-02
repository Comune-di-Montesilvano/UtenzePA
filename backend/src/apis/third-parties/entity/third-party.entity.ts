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
import { SystemUser } from '@apis/system-users/entity/system-user.entity';
import { ThirdPartyType } from '../enum/third-party.enum';

// Soggetto terzo: persona fisica o giuridica. Ruoli (fornitore, locatore,
// conduttore) calcolati dai collegamenti, mai salvati. P.IVA e CF unici anche
// tra le righe eliminate: un soggetto è uno solo.
@Entity('third_parties')
export class ThirdParty {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'enum', enum: ThirdPartyType })
  type: ThirdPartyType;

  @Column({ length: 255, nullable: true })
  company_name: string | null;

  @Column({ length: 100, nullable: true })
  last_name: string | null;

  @Column({ length: 100, nullable: true })
  first_name: string | null;

  @Index({ unique: true })
  @Column({ length: 20, nullable: true })
  vat_number: string | null;

  @Index({ unique: true })
  @Column({ length: 16, nullable: true })
  tax_code: string | null;

  @Column({ length: 255, nullable: true })
  address: string | null;

  @Column({ length: 100, nullable: true })
  city: string | null;

  @Column({ length: 10, nullable: true })
  postal_code: string | null;

  @Column({ length: 100, nullable: true })
  email: string | null;

  @Column({ length: 100, nullable: true })
  pec: string | null;

  @Column({ length: 50, nullable: true })
  phone: string | null;

  // Referente e recapiti in testo libero, come nelle fonti.
  @Column({ type: 'text', nullable: true })
  contacts: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

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

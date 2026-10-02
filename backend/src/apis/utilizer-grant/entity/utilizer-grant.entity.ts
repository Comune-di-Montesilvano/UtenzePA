import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  ManyToMany,
  OneToMany,
  JoinColumn,
  JoinTable,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

import { Asset } from '../../asset/entity/asset.entity';
import { SystemUser } from '../../system-users/entity/system-user.entity';
import { Utilizer } from '@apis/utilizer/entity/utilizer.entity';
import {
  ContractDirection,
  ContractKind,
  ContractStatus,
  RentPeriod,
} from '../enum/real-estate-contract.enum';

// Contratto immobiliare (ex "concessione"): locazione, concessione, comodato,
// assegnazione alloggio, occupazione suolo, attivo o passivo. Tabella
// utilizer_grant invariata per non toccare join e import esistenti.
@Entity('utilizer_grant')
export class UtilizerGrant {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ length: 255, nullable: true })
  concession_act: string;

  @Column({ type: 'boolean', default: false })
  utilities_to_be_taken_over: boolean;

  @Column({ length: 100, nullable: true })
  usage_type: string;

  @Column({ type: 'date', nullable: true })
  start_date: string | null;

  @Column({ type: 'date', nullable: true })
  end_date: string | null;

  @Column({ type: 'int' })
  utilizer_id_fk: number;

  @Column({ type: 'enum', enum: ContractDirection, default: ContractDirection.ACTIVE })
  direction: ContractDirection;

  @Column({ type: 'enum', enum: ContractKind, default: ContractKind.CONCESSION })
  kind: ContractKind;

  @Column({ length: 500, nullable: true })
  subject: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  rent_amount: number | null;

  @Column({ type: 'enum', enum: RentPeriod, nullable: true })
  rent_period: RentPeriod | null;

  @Column({ type: 'boolean', default: false })
  vat_applicable: boolean;

  @Column({ type: 'boolean', default: false })
  tacit_renewal: boolean;

  @Column({ type: 'int', nullable: true })
  renewal_months: number | null;

  @Column({ type: 'int', nullable: true })
  notice_months: number | null;

  @Column({ type: 'enum', enum: ContractStatus, default: ContractStatus.ACTIVE })
  status: ContractStatus;

  @Column({ length: 255, nullable: true })
  registration_ref: string | null;

  @Column({ length: 255, nullable: true })
  cadastral_ref: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  area_sqm: number | null;

  @Column({ length: 50, nullable: true })
  department: string | null;

  @Column({ type: 'int', nullable: true })
  parent_contract_id: number | null;

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
  @JoinColumn({ name: 'updated_by_user_id' })
  updated_by: SystemUser;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'created_by_user_id' })
  created_by: SystemUser;

  // Immobili oggetto del contratto (facoltativi: contratti importati non abbinati).
  @ManyToMany(() => Asset, (asset) => asset.utilizerGrants)
  @JoinTable({
    name: 'utilizer_grant_assets',
    joinColumn: { name: 'utilizer_grant_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'asset_id', referencedColumnName: 'id' },
  })
  assets: Asset[];

  @ManyToOne(() => Utilizer, (utilizer) => utilizer.utilizerGrants)
  @JoinColumn({ name: 'utilizer_id_fk', referencedColumnName: 'id' })
  utilizer: Utilizer;

  // Contratto padre (es. assegnazione alloggio sotto la concessione
  // all'Azienda Speciale o sotto una locazione passiva).
  @ManyToOne(() => UtilizerGrant, (g) => g.children, { nullable: true })
  @JoinColumn({ name: 'parent_contract_id' })
  parent: UtilizerGrant | null;

  @OneToMany(() => UtilizerGrant, (g) => g.parent)
  children: UtilizerGrant[];
}

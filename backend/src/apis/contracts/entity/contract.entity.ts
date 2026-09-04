import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Supplier } from '@apis/shared/entities/supplier.entity';
import { ConsipAgreement } from '@apis/consip-agreement/entity/consip-agreement.entity';
import { SystemUser } from '@apis/system-users/entity/system-user.entity';
import { Utility } from '@apis/utility/entity/utility.entity';
import { Invoice } from '@apis/invoices/entity/invoice.entity';

@Entity('contracts')
export class Contract {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int', nullable: true })
  supplier_id_fk: number;

  @Column({ type: 'text', nullable: true })
  cig_contract: string;

  @Column({ type: 'text', nullable: true })
  order_number: string;

  @Column({ length: 100, nullable: true })
  consip_order: string;

  @Column({ type: 'int', nullable: true })
  consip_agreement_id: number;

  @Column({ type: 'date', nullable: true })
  supply_start_date: string;

  @Column({ type: 'date', nullable: true })
  supply_expiry_date: string;

  @Column({ type: 'date', nullable: true })
  management_expiry_date: string;

  @Column({ type: 'date', nullable: true })
  takeover_termination_date: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  security_deposit: number;

  @CreateDateColumn({ type: 'timestamp' })
  create_date: string;

  @UpdateDateColumn({ type: 'timestamp' })
  update_date: string;

  @Column({ name: 'created_by_user_id' })
  @Index()
  created_by_user_id: number;

  @Column({ name: 'updated_by_user_id' })
  updated_by_user_id: number;

  @Column({ type: 'boolean', default: false, nullable: true })
  deleted: boolean;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'created_by_user_id' })
  created_by: SystemUser;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'updated_by_user_id' })
  updated_by: SystemUser;

  @ManyToOne(() => Supplier)
  @JoinColumn({ name: 'supplier_id_fk' })
  supplier: Supplier;

  @OneToOne(() => ConsipAgreement)
  @JoinColumn({ name: 'consip_agreement_id', referencedColumnName: 'id' })
  consipAgreement: ConsipAgreement;

  @ManyToMany(() => Utility, (utility) => utility.contratti)
  @JoinTable({
    name: 'contract_utilities',
    joinColumn: { name: 'contract_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'utility_id', referencedColumnName: 'id' },
  })
  utilities: Utility[];

  @OneToMany(() => Invoice, (invoice) => invoice.contratto)
  invoices: Invoice[];
}

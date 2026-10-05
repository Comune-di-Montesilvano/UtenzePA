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
import { ThirdParty } from '@apis/third-parties/entity/third-party.entity';
import { InvoiceLine } from './invoice-line.entity';
import { Contract } from '@apis/contracts/entity/contract.entity';

@Entity('invoices')
export class Invoice {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ length: 255 })
  invoice_id: string;

  @Column({ type: 'date' })
  invoice_date: Date;

  @Column({ length: 100, nullable: true })
  protocol_number: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  net_amount_excl_vat: number | null;

  // Totale documento IVA inclusa (es. fatture ACA, dove l'imponibile non c'è).
  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  total_amount: number | null;

  // Fornitore della fattura: per l'import si abbina per P.IVA anche senza
  // contratto; se manca, il service lo prende dal contratto.
  @Column({ type: 'int', nullable: true })
  supplier_id_fk: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  last_invoice_arrears: number;

  @Column({ type: 'text', nullable: true })
  notes_on_invoices: string;

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

  @Column({ type: 'int', nullable: true })
  contratto_id_fk: number;

  @ManyToOne(() => Contract, (contract) => contract.invoices)
  @JoinColumn({ name: 'contratto_id_fk', referencedColumnName: 'id' })
  contratto: Contract;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'created_by_user_id' })
  created_by: SystemUser;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'updated_by_user_id' })
  updated_by: SystemUser;

  @ManyToOne(() => ThirdParty)
  @JoinColumn({ name: 'supplier_id_fk', foreignKeyConstraintName: 'FK_invoices_supplier' })
  supplier: ThirdParty | null;

  @OneToMany(() => InvoiceLine, (l) => l.invoice)
  lines: InvoiceLine[];
}

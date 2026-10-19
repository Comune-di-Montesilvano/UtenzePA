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
import { ThirdParty } from '@apis/third-parties/entity/third-party.entity';
import { SystemUser } from '@apis/system-users/entity/system-user.entity';

// Come leggere le fatture di un fornitore con una certa struttura XML.
// Ignorato = struttura da non importare (rules null, structure_key esclusa).
@Entity('invoice_patterns')
@Index('IDX_invoice_patterns_supplier', ['supplier_id_fk', 'deleted'])
export class InvoicePattern {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int' })
  supplier_id_fk: number;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'boolean', default: false })
  ignored: boolean;

  @Column({ type: 'json', nullable: true })
  rules: Record<string, unknown> | null;

  // Struttura della fattura da cui è nato il pattern (sha1 dei percorsi).
  @Column({ type: 'varchar', length: 40 })
  structure_key: string;

  // Percorsi usati dalle regole: a parità di fattura vince il più specifico.
  @Column({ type: 'int', default: 0 })
  paths_count: number;

  @CreateDateColumn({ type: 'timestamp' })
  create_date: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  update_date: Date;

  @Column({ name: 'created_by_user_id' })
  created_by_user_id: number;

  @Column({ name: 'updated_by_user_id' })
  updated_by_user_id: number;

  @Column({ type: 'boolean', default: false })
  deleted: boolean;

  @ManyToOne(() => ThirdParty, { nullable: false })
  @JoinColumn({ name: 'supplier_id_fk', foreignKeyConstraintName: 'FK_invoice_patterns_supplier' })
  supplier: ThirdParty;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'created_by_user_id', foreignKeyConstraintName: 'FK_invoice_patterns_created_by' })
  created_by: SystemUser;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'updated_by_user_id', foreignKeyConstraintName: 'FK_invoice_patterns_updated_by' })
  updated_by: SystemUser;
}

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
import { SdiMessageStatus, type SdiMessageKind } from '../enum/sdi-message-status.enum';

// Registro dei file SDI letti dalla PEC: solo metadati, i file restano sulla
// casella e si rileggono quando servono (uid + message_id).
@Entity('sdi_messages')
@Index('UQ_sdi_messages_file', ['message_id', 'file_name'], { unique: true })
export class SdiMessage {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'bigint' })
  uid_validity: string;

  @Column({ type: 'bigint' })
  uid: string;

  @Column({ type: 'varchar', length: 255 })
  message_id: string;

  @Column({ type: 'datetime', nullable: true })
  received_at: Date | null;

  @Column({ type: 'varchar', length: 10 })
  kind: SdiMessageKind;

  @Column({ type: 'varchar', length: 255 })
  file_name: string;

  @Index('IDX_sdi_messages_identifier')
  @Column({ type: 'varchar', length: 20, nullable: true })
  sdi_identifier: string | null;

  // Solo esiti committente: EC01 accettata, EC02 rifiutata.
  @Column({ type: 'varchar', length: 4, nullable: true })
  outcome: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  supplier_vat: string | null;

  @Column({ type: 'int', nullable: true })
  supplier_id_fk: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  document_number: string | null;

  @Column({ type: 'date', nullable: true })
  document_date: string | null;

  @Column({ type: 'varchar', length: 20 })
  status: SdiMessageStatus;

  @Column({ type: 'varchar', length: 500, nullable: true })
  error: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  create_date: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  update_date: Date;

  @ManyToOne(() => ThirdParty, { nullable: true })
  @JoinColumn({ name: 'supplier_id_fk', foreignKeyConstraintName: 'FK_sdi_messages_supplier' })
  supplier: ThirdParty | null;
}

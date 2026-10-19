import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Invoice } from '@apis/invoices/entity/invoice.entity';
import { ImportIssueType } from '../enum/import-issue-type.enum';
import { SdiMessage } from './sdi-message.entity';

// Differenza trovata estraendo una fattura: si rigenerano a ogni estrazione.
@Entity('invoice_import_issues')
@Index('IDX_invoice_import_issues_message', ['sdi_message_id_fk'])
export class InvoiceImportIssue {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int' })
  sdi_message_id_fk: number;

  @Column({ type: 'int', nullable: true })
  invoice_id_fk: number | null;

  // Riga dell'XML (da 0); null = testata.
  @Column({ type: 'int', nullable: true })
  line_index: number | null;

  @Column({ type: 'varchar', length: 30 })
  type: ImportIssueType;

  @Column({ type: 'varchar', length: 500 })
  detail: string;

  @CreateDateColumn({ type: 'timestamp' })
  create_date: Date;

  @ManyToOne(() => SdiMessage, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'sdi_message_id_fk', foreignKeyConstraintName: 'FK_invoice_import_issues_message' })
  message: SdiMessage;

  @ManyToOne(() => Invoice, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'invoice_id_fk', foreignKeyConstraintName: 'FK_invoice_import_issues_invoice' })
  invoice: Invoice | null;
}

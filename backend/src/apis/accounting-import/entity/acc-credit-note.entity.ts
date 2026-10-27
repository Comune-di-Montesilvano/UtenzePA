import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// Tabella di appoggio dell'import contabilità: una riga per abbinamento nota
// di credito → fattura (note_credito.csv). In contabilità la nota non ha
// liquidazioni: si compensa sulla fattura, che si liquida al netto o, se
// stornata per intero, mai.
@Entity('acc_credit_notes')
@Index('IDX_acc_credit_notes_note_sdi', ['note_sdi_identifier'])
@Index('IDX_acc_credit_notes_invoice_sdi', ['invoice_sdi_identifier'])
export class AccCreditNote {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', length: 60 })
  link_key: string;

  @Column({ type: 'int' })
  fiscal_year: number;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 16, nullable: true })
  supplier_vat: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  note_sdi_identifier: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  note_number: string | null;

  @Column({ type: 'date', nullable: true })
  note_date: string | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  note_total: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  invoice_sdi_identifier: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  invoice_number: string | null;

  @Column({ type: 'date', nullable: true })
  invoice_date: string | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  invoice_total: number | null;
}

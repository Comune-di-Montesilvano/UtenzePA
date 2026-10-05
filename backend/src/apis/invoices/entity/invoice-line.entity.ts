import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Invoice } from './invoice.entity';
import { Utility } from '@apis/utility/entity/utility.entity';
import { BudgetCommitment } from '@apis/budget-commitments/entity/budget-commitment.entity';

// Riga di fattura: tutto facoltativo tranne l'importo (IVA inclusa), perché
// ogni fornitore struttura le fatture a modo suo. Si sostituiscono in blocco
// a ogni salvataggio della fattura: niente audit né soft delete.
@Entity('invoice_lines')
@Index('IDX_invoice_lines_utility', ['utility_id_fk'])
export class InvoiceLine {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int' })
  invoice_id_fk: number;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  amount: number;

  @Column({ type: 'int', nullable: true })
  utility_id_fk: number | null;

  @Column({ type: 'int', nullable: true })
  commitment_id_fk: number | null;

  @Column({ type: 'date', nullable: true })
  period_start: string | null;

  @Column({ type: 'date', nullable: true })
  period_end: string | null;

  @Column({ type: 'decimal', precision: 14, scale: 3, nullable: true })
  consumption: number | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  supply_code: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @ManyToOne(() => Invoice, (i) => i.lines, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'invoice_id_fk', foreignKeyConstraintName: 'FK_invoice_lines_invoice' })
  invoice: Invoice;

  @ManyToOne(() => Utility)
  @JoinColumn({ name: 'utility_id_fk', foreignKeyConstraintName: 'FK_invoice_lines_utility' })
  utility: Utility | null;

  @ManyToOne(() => BudgetCommitment)
  @JoinColumn({
    name: 'commitment_id_fk',
    foreignKeyConstraintName: 'FK_invoice_lines_commitment',
  })
  commitment: BudgetCommitment | null;
}

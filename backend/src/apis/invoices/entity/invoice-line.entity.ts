import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Invoice } from './invoice.entity';
import { Utility } from '@apis/utility/entity/utility.entity';
import { BudgetCommitment } from '@apis/budget-commitments/entity/budget-commitment.entity';
import { UtilityConsumption } from '@apis/utility-consumptions/entity/utility-consumption.entity';

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

  // true = impegno assegnato dal consumo automatico (ricalcolabile), false = scelto a mano.
  @Column({ type: 'boolean', default: true })
  commitment_auto: boolean;

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

  // Rilevazione del tab Consumi creata o adottata dall'import per questa riga.
  @Column({ type: 'int', nullable: true })
  consumption_id_fk: number | null;

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

  @ManyToOne(() => UtilityConsumption, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'consumption_id_fk', foreignKeyConstraintName: 'FK_invoice_lines_consumption' })
  consumption_record: UtilityConsumption | null;
}

import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { BudgetCommitment } from './budget-commitment.entity';
import { RecordSource } from '@apis/accounting-import/record-source.enum';

// Annualità di un impegno: importo per esercizio di competenza. Un impegno
// annuale ne ha una, un pluriennale una per anno. Importo null = non noto
// (l'annualità non si esaurisce).
@Entity('budget_commitment_years')
@Index('IDX_budget_commitment_years_year', ['commitment_id', 'fiscal_year'], { unique: true })
export class BudgetCommitmentYear {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int' })
  commitment_id: number;

  @Column({ type: 'int' })
  fiscal_year: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  amount: number | null;

  @Column({ type: 'varchar', length: 20, default: RecordSource.MANUAL })
  source: RecordSource;

  @ManyToOne(() => BudgetCommitment, (c) => c.years, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({
    name: 'commitment_id',
    foreignKeyConstraintName: 'FK_budget_commitment_years_commitment',
  })
  commitment: BudgetCommitment;
}

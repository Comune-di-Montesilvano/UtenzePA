import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Invoice } from './invoice.entity';
import { BudgetCommitment } from '@apis/budget-commitments/entity/budget-commitment.entity';
import { CommitmentShareSource } from './commitment-share-source.enum';

// Quota di una fattura su un'annualità di un impegno. Nessun unique: più
// liquidazioni sullo stesso impegno (fase 3).
@Entity('invoice_commitment_shares')
@Index('IDX_invoice_commitment_shares_invoice', ['invoice_id_fk'])
@Index('IDX_invoice_commitment_shares_commitment', ['commitment_id_fk', 'fiscal_year'])
export class InvoiceCommitmentShare {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int' })
  invoice_id_fk: number;

  @Column({ type: 'int' })
  commitment_id_fk: number;

  @Column({ type: 'int' })
  fiscal_year: number;

  // decimal torna come stringa dal driver: transformer numerico.
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: { to: (v: number | null) => v, from: (v: string | null) => (v === null ? null : Number(v)) },
  })
  amount: number;

  @Column({ type: 'varchar', length: 20, default: CommitmentShareSource.AUTO })
  source: CommitmentShareSource;

  @ManyToOne(() => Invoice, (i) => i.commitmentShares, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'invoice_id_fk', foreignKeyConstraintName: 'FK_invoice_commitment_shares_invoice' })
  invoice: Invoice;

  @ManyToOne(() => BudgetCommitment, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'commitment_id_fk', foreignKeyConstraintName: 'FK_invoice_commitment_shares_commitment' })
  commitment: BudgetCommitment;
}

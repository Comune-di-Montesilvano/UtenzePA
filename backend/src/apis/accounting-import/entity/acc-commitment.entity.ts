import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// Tabella di appoggio dell'import contabilità: una riga per impegno e anno di
// competenza (impegni.csv). Importo = importo valido, variazioni comprese.
@Entity('acc_commitments')
@Index('IDX_acc_commitments_number', ['commitment_year', 'commitment_num', 'commitment_sub'])
export class AccCommitment {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int' })
  commitment_year: number;

  @Column({ type: 'int' })
  commitment_num: number;

  @Column({ type: 'int' })
  commitment_sub: number;

  @Column({ type: 'int' })
  fiscal_year: number;

  @Column({ type: 'varchar', length: 50 })
  chapter: string;

  @Column({ type: 'int' })
  article: number;

  @Column({ type: 'varchar', length: 16, nullable: true })
  supplier_vat: string | null;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 20, nullable: true })
  cig: string | null;

  @Column({ type: 'boolean', default: false })
  cancelled: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;
}

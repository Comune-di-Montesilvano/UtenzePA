import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ConsipAgreement } from '@apis/consip-agreement/entity/consip-agreement.entity';
import { BudgetChapter } from '@apis/budget-chapters/entity/budgetChapter.entity';

// Cache del fabbisogno della convenzione: una riga per capitolo ed esercizio,
// sostituite in blocco a ogni calcolo. Le segnalazioni leggono da qui.
@Entity('consip_agreement_forecasts')
@Index('IDX_agreement_forecasts_agreement_year', ['consip_agreement_id_fk', 'fiscal_year'])
export class ConsipAgreementForecast {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  consip_agreement_id_fk: number;

  // null = utenze senza capitolo.
  @Column({ type: 'int', nullable: true })
  budget_chapter_id_fk: number | null;

  @Column({ type: 'int' })
  fiscal_year: number;

  @Column({ type: 'int' })
  utilities: number;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  invoiced: number;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  to_invoice: number;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  committed: number;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  remaining: number;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  difference: number;

  @Column({ type: 'decimal', precision: 5, scale: 4 })
  coverage: number;

  // Importo mancante, solo se scatta l'avviso.
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  shortfall: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  alert: string | null;

  @Column({ type: 'timestamp' })
  computed_at: Date;

  @ManyToOne(() => ConsipAgreement, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'consip_agreement_id_fk',
    foreignKeyConstraintName: 'FK_agreement_forecasts_agreement',
  })
  agreement: ConsipAgreement;

  @ManyToOne(() => BudgetChapter, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'budget_chapter_id_fk',
    foreignKeyConstraintName: 'FK_agreement_forecasts_chapter',
  })
  chapter: BudgetChapter | null;
}

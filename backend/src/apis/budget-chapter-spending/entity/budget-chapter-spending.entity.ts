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
import { BudgetChapter } from '@apis/budget-chapters/entity/budgetChapter.entity';
import { SystemUser } from '@apis/system-users/entity/system-user.entity';

// Dati della ragioneria per capitolo/anno: stanziamento iniziale, assestato,
// spesa consuntiva (almeno uno, verificato nel service). Un solo record per
// capitolo/anno tra le righe non cancellate: verificato nel service, un
// indice unique non escluderebbe le righe soft-deleted.
@Entity('budget_chapter_spending')
@Index(['budget_chapter_id_fk', 'deleted'])
export class BudgetChapterSpending {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int' })
  budget_chapter_id_fk: number;

  @Column({ type: 'int' })
  year: number;

  // Spesa consuntiva della ragioneria ("Spesa ragioneria"): facoltativa.
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  amount: number | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  initial_budget: number | null;

  // Assestato dell'esercizio.
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  adjusted_budget: number | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

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

  @ManyToOne(() => BudgetChapter, { nullable: false })
  @JoinColumn({ name: 'budget_chapter_id_fk' })
  budgetChapter: BudgetChapter;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'created_by_user_id' })
  created_by: SystemUser;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'updated_by_user_id' })
  updated_by: SystemUser;
}

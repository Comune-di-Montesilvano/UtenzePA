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
import { Contract } from '@apis/contracts/entity/contract.entity';
import { BudgetChapter } from '@apis/budget-chapters/entity/budgetChapter.entity';
import { SystemUser } from '@apis/system-users/entity/system-user.entity';

// Impegno di spesa: capitolo impegnato su un contratto di fornitura per un
// esercizio. Numero e importo arrivano dalla ragioneria, facoltativi.
@Entity('budget_commitments')
@Index('IDX_budget_commitments_contract', ['contract_id_fk', 'deleted'])
export class BudgetCommitment {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int' })
  contract_id_fk: number;

  @Column({ type: 'int' })
  budget_chapter_id_fk: number;

  @Column({ type: 'int' })
  fiscal_year: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  commitment_number: string | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  amount: number | null;

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

  @ManyToOne(() => Contract, { nullable: false })
  @JoinColumn({ name: 'contract_id_fk', foreignKeyConstraintName: 'FK_budget_commitments_contract' })
  contract: Contract;

  @ManyToOne(() => BudgetChapter, { nullable: false })
  @JoinColumn({
    name: 'budget_chapter_id_fk',
    foreignKeyConstraintName: 'FK_budget_commitments_chapter',
  })
  budgetChapter: BudgetChapter;

  @ManyToOne(() => SystemUser)
  @JoinColumn({
    name: 'created_by_user_id',
    foreignKeyConstraintName: 'FK_budget_commitments_created_by',
  })
  created_by: SystemUser;

  @ManyToOne(() => SystemUser)
  @JoinColumn({
    name: 'updated_by_user_id',
    foreignKeyConstraintName: 'FK_budget_commitments_updated_by',
  })
  updated_by: SystemUser;
}

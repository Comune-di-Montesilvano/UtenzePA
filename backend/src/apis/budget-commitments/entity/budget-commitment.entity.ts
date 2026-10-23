import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Contract } from '@apis/contracts/entity/contract.entity';
import { BudgetChapter } from '@apis/budget-chapters/entity/budgetChapter.entity';
import { SystemUser } from '@apis/system-users/entity/system-user.entity';
import { ThirdParty } from '@apis/third-parties/entity/third-party.entity';

// Impegno contabile: capitolo impegnato per un esercizio (competenza), con il
// numero della ragioneria (anno/num/sub) e zero o più contratti di fornitura
// (un impegno di una determina copre più ordinativi). Le righe di fattura lo
// consumano in ordine di numero (commitment-allocation.ts).
@Entity('budget_commitments')
@Index('IDX_budget_commitments_number', ['commitment_year', 'commitment_num', 'commitment_sub'])
export class BudgetCommitment {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int' })
  budget_chapter_id_fk: number;

  @Column({ type: 'int' })
  fiscal_year: number;

  @Column({ type: 'int', nullable: true })
  commitment_year: number | null;

  @Column({ type: 'int', nullable: true })
  commitment_num: number | null;

  @Column({ type: 'int', nullable: true })
  commitment_sub: number | null;

  @Column({ type: 'int', nullable: true })
  supplier_id_fk: number | null;

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

  @ManyToMany(() => Contract)
  @JoinTable({
    name: 'budget_commitment_contracts',
    joinColumn: {
      name: 'commitment_id',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'FK_budget_commitment_contracts_commitment',
    },
    inverseJoinColumn: {
      name: 'contract_id',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'FK_budget_commitment_contracts_contract',
    },
  })
  contracts: Contract[];

  @ManyToOne(() => BudgetChapter, { nullable: false })
  @JoinColumn({
    name: 'budget_chapter_id_fk',
    foreignKeyConstraintName: 'FK_budget_commitments_chapter',
  })
  budgetChapter: BudgetChapter;

  @ManyToOne(() => ThirdParty)
  @JoinColumn({ name: 'supplier_id_fk', foreignKeyConstraintName: 'FK_budget_commitments_supplier' })
  supplier: ThirdParty | null;

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

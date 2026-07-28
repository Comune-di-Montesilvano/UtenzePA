import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Utility } from '../../utility/entity/utility.entity';
import { SystemUser } from '../../system-users/entity/system-user.entity';
import { Supplier } from '../../shared/entities/supplier.entity';
import { BudgetChapter } from '../../budget-chapters/entity/budgetChapter.entity';
import { InvoiceBudgetChapter } from '@apis/invoices/entity/invoice_budget_chapter.entity';

@Entity('invoices')
export class Invoice {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ length: 255 })
  invoice_id: string;

  @Column({ type: 'date' })
  invoice_date: Date;

  @Column({ length: 100, nullable: true })
  protocol_number: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  net_amount_excl_vat: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  last_invoice_arrears: number;

  @Column({ type: 'text', nullable: true })
  notes_on_invoices: string;

  @Column({ type: 'int', nullable: true })
  utility_id_fk: number;

  @CreateDateColumn({ type: 'timestamp' })
  create_date: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  update_date: Date;

  @Column({ name: 'created_by_user_id' })
  @Index()
  created_by_user_id: number;

  @Column({ name: 'updated_by_user_id' })
  updated_by_user_id: number;

  @Column({ type: 'boolean', default: false })
  deleted: boolean;

  @Column({ type: 'int', nullable: true })
  supplier_id_fk: number;

  @ManyToMany(() => BudgetChapter, (chapter) => chapter.invoices)
  @JoinTable({
    name: 'invoice_budget_chapter',
    joinColumns: [{ name: 'invoice_id' }],
    inverseJoinColumns: [{ name: 'budget_chapter_id' }],
  })
  budget_chapters: BudgetChapter[];

  @ManyToOne(() => Supplier)
  @JoinColumn({ name: 'supplier_id_fk' })
  supplier: Supplier;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'created_by_user_id' })
  created_by: SystemUser;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'updated_by_user_id' })
  updated_by: SystemUser;

  @ManyToOne(() => Utility, (utility) => utility.invoices)
  @JoinColumn({ name: 'utility_id_fk', referencedColumnName: 'id' })
  utility: Utility;

  @OneToMany(() => InvoiceBudgetChapter, (utp) => utp.invoice)
  invoiceBudgetChapters: InvoiceBudgetChapter[];

  @ManyToMany(() => BudgetChapter)
  @JoinTable({
    name: 'invoice_budget_chapter',
    joinColumn: { name: 'invoice_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'budget_chapter_id', referencedColumnName: 'id' },
  })
  budgetChapters: BudgetChapter[];
}

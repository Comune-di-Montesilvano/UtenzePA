import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Exclude } from 'class-transformer';
import { Invoice } from '@apis/invoices/entity/invoice.entity';
import { BudgetChapter } from '@apis/budget-chapters/entity/budgetChapter.entity';

@Entity('invoice_budget_chapter')
export class InvoiceBudgetChapter {
  @Exclude()
  @PrimaryColumn({ name: 'invoice_id' })
  invoice_id: number;

  @Exclude()
  @PrimaryColumn({ name: 'budget_chapter_id' })
  budget_chapter_id: number;

  @ManyToOne(() => Invoice, (ut) => ut.invoiceBudgetChapters, {
    onDelete: 'CASCADE',
    eager: false,
  })
  @JoinColumn({ name: 'invoice_id' })
  invoice: Invoice;

  @ManyToOne(() => BudgetChapter, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'budget_chapter_id' })
  budgetChapter: BudgetChapter;
}

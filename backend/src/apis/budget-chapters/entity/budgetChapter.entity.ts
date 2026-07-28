import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Utility } from '../../utility/entity/utility.entity';
import { SystemUser } from '../../system-users/entity/system-user.entity';
import { Invoice } from '../../invoices/entity/invoice.entity';
import { SupplyTypeEnum } from '@apis/budget-chapters/enum/supply-type.enum';

@Entity('budget_chapters')
export class BudgetChapter {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ length: 50 })
  chapter_code: string;

  @Column({ type: 'int', default: 0 })
  article: number;

  @Column({ length: 255, nullable: true })
  description: string;

  @Column({ length: 100, nullable: true })
  pdc: string;

  @Column({
    type: 'enum',
    enum: SupplyTypeEnum,
  })
  supply_type: SupplyTypeEnum;

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

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'created_by_user_id' })
  created_by: SystemUser;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'updated_by_user_id' })
  updated_by: SystemUser;

  @OneToMany(() => Utility, (utility) => utility.budget_chapter_code_fk)
  utilities: Utility[];

  @ManyToMany(() => Invoice, (invoice) => invoice.budget_chapters)
  invoices: Invoice[];
}

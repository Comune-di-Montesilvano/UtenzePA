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
import { UtilityType } from '../../utility-types/entity/utility_type.entity';

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

  // Tipi utenza a cui il capitolo si applica; nessuno = tutti (es. SPRAR).
  @ManyToMany(() => UtilityType)
  @JoinTable({
    name: 'budget_chapter_utility_types',
    joinColumn: { name: 'budget_chapter_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'utility_type_id', referencedColumnName: 'id' },
  })
  utilityTypes: UtilityType[];

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

}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
} from 'typeorm';

import { Utility } from '../../utility/entity/utility.entity';
import { SystemUser } from '../../system-users/entity/system-user.entity';

@Entity('aca_keys')
export class AcaKey {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ length: 100, nullable: false })
  username: string;

  @Column({ type: 'varchar', length: 255, nullable: false, select: false })
  password: string;

  @Column({ type: 'int', nullable: true })
  @Index()
  utility_id: number; // FK -> utilities.id

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

  // --- RELATIONS ---

  @OneToOne(() => Utility, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'utility_id', referencedColumnName: 'id' })
  account: Utility;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'created_by_user_id' })
  created_by: SystemUser;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'updated_by_user_id' })
  updated_by: SystemUser;
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  ManyToMany,
  JoinTable,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { Utility } from '../../utility/entity/utility.entity';
import { SystemUser } from '../../system-users/entity/system-user.entity';
import { HardTypeEnum } from '@apis/utility-types/enum/hard-type.enum';
import { UtilityTypePurpose } from '@apis/utility-types/entity/utility_type_purpose.entity';
import { Purpose } from '@apis/purpose/entity/purpose.entity';

@Entity('utility_types')
export class UtilityType {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ length: 50, unique: true })
  name: string;

  @Column({ length: 300, unique: false, nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: HardTypeEnum,
  })
  hard_type: HardTypeEnum;

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

  @OneToMany(() => Utility, (utility) => utility.utilityType)
  utilities: Utility[];

  @OneToMany(() => UtilityTypePurpose, (utp) => utp.utilityType)
  utilityTypePurposes: UtilityTypePurpose[];

  @ManyToMany(() => Purpose)
  @JoinTable({
    name: 'utility_type_purpose',
    joinColumn: { name: 'utility_type_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'purpose_id', referencedColumnName: 'id' },
  })
  purposes: Purpose[];
}

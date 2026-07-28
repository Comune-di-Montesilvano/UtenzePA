import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

import { Asset } from '../../asset/entity/asset.entity';
import { SystemUser } from '../../system-users/entity/system-user.entity';
import { Utilizer } from '@apis/utilizer/entity/utilizer.entity';

@Entity('utilizer_grant')
export class UtilizerGrant {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ length: 255, nullable: true })
  concession_act: string;

  @Column({ type: 'boolean', default: false })
  utilities_to_be_taken_over: boolean;

  @Column({ length: 100, nullable: true })
  usage_type: string;

  @CreateDateColumn({ type: 'timestamp', nullable: true, default: null })
  grant_date: Date | null;

  @CreateDateColumn({ type: 'timestamp', nullable: true, default: null })
  expire_date: Date | null;

  @Column({ type: 'int' })
  asset_id_fk: number;

  @Column({ type: 'int' })
  utilizer_id_fk: number;

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
  @JoinColumn({ name: 'updated_by_user_id' })
  updated_by: SystemUser;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'created_by_user_id' })
  created_by: SystemUser;

  @ManyToOne(() => Asset, (asset) => asset.utilizerGrants)
  @JoinColumn({ name: 'asset_id_fk', referencedColumnName: 'id' })
  asset: Asset;

  @ManyToOne(() => Utilizer, (utilizer) => utilizer.utilizerGrants)
  @JoinColumn({ name: 'utilizer_id_fk', referencedColumnName: 'id' })
  utilizer: Utilizer;
}

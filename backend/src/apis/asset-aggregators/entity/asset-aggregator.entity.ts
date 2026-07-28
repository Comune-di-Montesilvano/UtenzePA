import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

import { Asset } from '../../asset/entity/asset.entity';
import { SystemUser } from '../../system-users/entity/system-user.entity';

@Entity('asset_aggregators')
export class AssetAggregator {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ length: 255, nullable: true })
  description: string;

  @Column({ length: 255, nullable: false, unique: true })
  code: string;

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

  @OneToMany(() => Asset, (asset) => asset.assetAggregator)
  assets: Asset[];
}

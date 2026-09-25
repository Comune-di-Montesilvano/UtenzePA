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
import { UtilizerGrant } from '@apis/utilizer-grant/entity/utilizer-grant.entity';
import { AssetAggregator } from '../../asset-aggregators/entity/asset-aggregator.entity';
import { SystemUser } from '../../system-users/entity/system-user.entity';
import { AssetNature } from '@apis/asset-natures/entity/asset-nature.entity';
import { AssetFunction } from '@apis/asset-functions/entity/asset-function.entity';
import { AssetStatusEnum } from '@apis/asset/enum/asset-status.enum';

@Entity('assets')
export class Asset {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ length: 255 })
  asset_name: string;

  @Column({ length: 255, nullable: true })
  associated_building: string;

  @Column({ length: 255, nullable: true })
  toponym: string;

  @Column({ length: 255, nullable: true })
  address: string;

  @Column({ length: 50, nullable: true })
  civic_number: string;

  @Column({ length: 10, nullable: true })
  zip_code: string;

  @Column({ length: 100, nullable: true })
  municipality: string;

  @Column()
  ownership: number;

  @Column({ length: 1000, nullable: true })
  specific_details: string;

  @Column({ length: 1000, nullable: true })
  memo: string;

  @Column({ type: 'text', nullable: true })
  services_and_artifacts: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  latitude: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  longitude: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  geocoded_latitude: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  geocoded_longitude: string;

  @Column({ type: 'timestamp', nullable: true })
  geocoded_at: Date;

  @Column({ length: 50, nullable: true })
  sheet: string;

  @Column({ length: 50, nullable: true })
  parcel: string;

  @Column({ length: 50, nullable: true })
  subordinate: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  area_sqm: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  cadastral_value: number;

  @Column({ length: 100, nullable: true })
  category: string;

  // Legacy (AssetAggregator): in sola lettura, azzerato quando l'immobile
  // riceve natura + funzione (AssetsService.update). Colonna e tabella
  // aggregatori vanno droppate quando nessun immobile lo valorizza più.
  @Column({ type: 'int', nullable: true })
  asset_type_id: number | null;

  @Column({ type: 'int', nullable: true })
  nature_id: number | null;

  @Column({ type: 'int', nullable: true })
  function_id: number | null;

  @Column({ type: 'enum', enum: AssetStatusEnum, default: AssetStatusEnum.ATTIVO })
  status: AssetStatusEnum;

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

  @ManyToMany(() => Utility, (utility) => utility.assets)
  utilities: Utility[];

  @OneToMany(() => UtilizerGrant, (utilizerGrant) => utilizerGrant.asset)
  utilizerGrants: UtilizerGrant[];

  @ManyToOne(() => AssetAggregator, (aggregator) => aggregator.assets)
  @JoinColumn({ name: 'asset_type_id' })
  assetAggregator: AssetAggregator;

  @ManyToOne(() => AssetNature)
  @JoinColumn({ name: 'nature_id' })
  assetNature: AssetNature;

  @ManyToOne(() => AssetFunction)
  @JoinColumn({ name: 'function_id' })
  assetFunction: AssetFunction;
}

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
import { SystemUser } from '../../system-users/entity/system-user.entity';
import { AssetNature } from '@apis/asset-natures/entity/asset-nature.entity';
import { AssetFunction } from '@apis/asset-functions/entity/asset-function.entity';
import { AssetStatusEnum } from '@apis/asset/enum/asset-status.enum';
import { Complex } from '@apis/complexes/entity/complex.entity';
import {
  ConstructionPeriod,
  HeritageConstraint,
  LegalNature,
} from '@apis/asset/enum/mef-domains.enum';
import { AssetCadastralUnit } from './asset-cadastral-unit.entity';

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

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  area_sqm: number;

  // Dati del censimento MEF "Patrimonio della PA" (domini in mef-domains.enum.ts).
  // mef_id = Id bene assegnato dal MEF: lo scrive solo l'import, sola lettura in UI.
  @Column({ type: 'int', nullable: true, unique: true })
  mef_id: number | null;

  @Column({ type: 'enum', enum: LegalNature, nullable: true })
  legal_nature: LegalNature | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  reference_area_sqm: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  appurtenance_area_sqm: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  volume_m3: number | null;

  @Column({ type: 'enum', enum: ConstructionPeriod, nullable: true })
  construction_period: ConstructionPeriod | null;

  @Column({ type: 'enum', enum: HeritageConstraint, nullable: true })
  heritage_constraint: HeritageConstraint | null;

  // null = non noto.
  @Column({ type: 'boolean', nullable: true })
  federal_transfer: boolean | null;

  @Column({ type: 'boolean', nullable: true })
  confiscated: boolean | null;

  @Column({ type: 'int', nullable: true })
  nature_id: number | null;

  @Column({ type: 'int', nullable: true })
  function_id: number | null;

  @Column({ type: 'int', nullable: true })
  complex_id: number | null;

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

  @ManyToMany(() => UtilizerGrant, (utilizerGrant) => utilizerGrant.assets)
  utilizerGrants: UtilizerGrant[];

  @ManyToOne(() => AssetNature)
  @JoinColumn({ name: 'nature_id' })
  assetNature: AssetNature;

  @ManyToOne(() => AssetFunction)
  @JoinColumn({ name: 'function_id' })
  assetFunction: AssetFunction;

  @OneToMany(() => AssetCadastralUnit, (unit) => unit.asset, { cascade: true })
  cadastralUnits: AssetCadastralUnit[];

  @ManyToOne(() => Complex, (complex) => complex.assets, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'complex_id' })
  complex: Complex | null;
}

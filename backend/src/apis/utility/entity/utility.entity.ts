import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Contract } from '@apis/contracts/entity/contract.entity';
import { Asset } from '../../asset/entity/asset.entity';
import { UtilityAggregator } from '../../utility-aggregators/entity/utility-aggregator.entity';
import { BudgetChapter } from '../../budget-chapters/entity/budgetChapter.entity';
import { UtilityType } from '../../utility-types/entity/utility_type.entity';
import { CostsBorneBy } from '../../shared/entities/utility_cost_borne_by.entity';
import { SystemUser } from '../../system-users/entity/system-user.entity';
import { Phase } from '../../shared/enum/user.enums';
import { MaintenanceManager } from '../../shared/entities/maintenanceManagers.entity';

@Entity('utilities')
export class Utility {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int' })
  utility_type_id_fk: number;

  @Column({ length: 20 })
  utility_id: string;

  @Column({ length: 255, nullable: true })
  utility_code: string;

  @Column({ length: 255, nullable: true })
  meter_number: string;

  @Column({ length: 255, nullable: true })
  supplier_address: string;

  @Column()
  costs_borne_by_id_fk: number;

  @Column({ type: 'boolean', default: false, nullable: true })
  supply_active: boolean;

  @Column({ type: 'boolean', default: false, nullable: true })
  meter_removed: boolean;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  reported_consumption_year: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  actual_consumption: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  estimated_annual_consumption: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  power_kw_electric: number;

  @Column({ length: 100, nullable: true })
  voltage_kw_electric: string;

  @Column({
    type: 'enum',
    enum: Phase,
    default: null,
  })
  phase_type_electric: Phase;

  @Column({ type: 'varchar', length: 20, nullable: true })
  latitude: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  longitude: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'text', nullable: true })
  additional_notes: string;

  @Column({ length: 255, nullable: true })
  wbs_gas_element: string;

  @Column({ type: 'date', nullable: true })
  water_concession: string;

  @Column({ type: 'boolean', default: false, nullable: true })
  meter_verified: boolean;

  @Column({ length: 255, nullable: true })
  disconnection_ability: string;

  @Column({ type: 'text', nullable: true })
  specifications: string;

  @CreateDateColumn({ type: 'timestamp' })
  create_date: string;

  @UpdateDateColumn({ type: 'timestamp' })
  update_date: string;

  @Column({ name: 'created_by_user_id' })
  @Index()
  created_by_user_id: number;

  @Column({ name: 'updated_by_user_id' })
  updated_by_user_id: number;

  @Column({ type: 'boolean', default: false, nullable: true })
  deleted: boolean;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'created_by_user_id' })
  created_by: SystemUser;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'updated_by_user_id' })
  updated_by: SystemUser;

  @ManyToOne(() => CostsBorneBy, { nullable: false })
  @JoinColumn({ name: 'costs_borne_by_id_fk' })
  costsBorneBy: CostsBorneBy;

  @Column({ type: 'int' })
  asset_id_fk: number;

  @Column({ type: 'int', nullable: true })
  maintenance_management_id_fk: number;

  @Column({ type: 'int', nullable: true })
  aggregator_id_fk: number;

  @Column({ type: 'int' })
  budget_chapter_code_fk: number;

  @ManyToOne(() => UtilityType, (type) => type.utilities)
  @JoinColumn({ name: 'utility_type_id_fk', referencedColumnName: 'id' })
  utilityType: UtilityType;

  @ManyToOne(() => Asset, (asset) => asset.utilities)
  @JoinColumn({ name: 'asset_id_fk', referencedColumnName: 'id' })
  asset: Asset;

  @ManyToOne(() => UtilityAggregator, (aggregator) => aggregator.utilities)
  @JoinColumn({ name: 'aggregator_id_fk', referencedColumnName: 'id' })
  utilityAggregator: UtilityAggregator;

  @ManyToOne(() => MaintenanceManager, (maintenance) => maintenance.id)
  @JoinColumn({ name: 'maintenance_management_id_fk', referencedColumnName: 'id' })
  maintenanceManager: MaintenanceManager;

  @ManyToOne(() => BudgetChapter, (chapter) => chapter.utilities)
  @JoinColumn({ name: 'budget_chapter_code_fk', referencedColumnName: 'id' })
  budgetChapter: BudgetChapter;

  @ManyToMany(() => Contract, (contract) => contract.utilities)
  contratti: Contract[];
}

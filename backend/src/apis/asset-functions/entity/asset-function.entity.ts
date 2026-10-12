import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SystemUser } from '@apis/system-users/entity/system-user.entity';
import { MefBuildingType, MefPurpose } from '@apis/asset/enum/mef-domains.enum';

// Funzione di un immobile (a cosa serve: Istruzione, Sport, Illuminazione…).
// Le combinazioni ammesse con la Natura stanno in asset_nature_functions
// (vedi AssetNature.functions).
@Entity('asset_functions')
export class AssetFunction {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ length: 255, unique: true })
  name: string;

  // Ligature Material Icons per i marker mappa e l'header della scheda.
  @Column({ type: 'varchar', length: 50, nullable: true })
  icon: string | null;

  // Tipologia e finalità del censimento MEF degli immobili con questa funzione
  // (la finalità vale solo per gli immobili utilizzati direttamente).
  @Column({ type: 'enum', enum: MefBuildingType, nullable: true })
  mef_building_type: MefBuildingType | null;

  @Column({ type: 'enum', enum: MefPurpose, nullable: true })
  mef_purpose: MefPurpose | null;

  @CreateDateColumn({ type: 'timestamp' })
  create_date: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  update_date: Date;

  @Column({ name: 'created_by_user_id' })
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
}

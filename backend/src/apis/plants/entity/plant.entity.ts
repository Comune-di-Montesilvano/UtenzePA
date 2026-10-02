import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Asset } from '@apis/asset/entity/asset.entity';
import { Utility } from '@apis/utility/entity/utility.entity';
import { SystemUser } from '@apis/system-users/entity/system-user.entity';
import { PlantStatus, PlantType } from '../enum/plant.enum';
import { PlantThermal } from './plant-thermal.entity';
import { PlantElevator } from './plant-elevator.entity';
import { PlantFireEquipment } from './plant-fire-equipment.entity';
import { PlantInspection } from './plant-inspection.entity';

// Impianto: oggetto tecnico con posizione propria, collegato a zero o più
// immobili (plant_assets: es. centrale termica che serve più edifici) e
// servito da zero o più utenze (tabella ponte utility_plants).
// Dati specifici solo per i tipi che li hanno (termico, ascensore,
// antincendio); scadenzario verifiche comune a tutti.
@Entity('plants')
export class Plant {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'enum', enum: PlantType })
  type: PlantType;

  @Column({ length: 100 })
  code: string;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  toponym: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  civic_number: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  latitude: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  longitude: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  geocoded_latitude: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  geocoded_longitude: string | null;

  @Column({ type: 'timestamp', nullable: true })
  geocoded_at: Date | null;

  @Column({ type: 'enum', enum: PlantStatus, default: PlantStatus.ACTIVE })
  status: PlantStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

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

  @ManyToMany(() => Asset)
  @JoinTable({
    name: 'plant_assets',
    joinColumn: { name: 'plant_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'asset_id', referencedColumnName: 'id' },
  })
  assets: Asset[];

  @ManyToMany(() => Utility, (utility) => utility.plants)
  utilities: Utility[];

  @OneToOne(() => PlantThermal, (thermal) => thermal.plant)
  thermal: PlantThermal | null;

  @OneToOne(() => PlantElevator, (elevator) => elevator.plant)
  elevator: PlantElevator | null;

  @OneToMany(() => PlantFireEquipment, (equipment) => equipment.plant)
  fireEquipment: PlantFireEquipment[];

  @OneToMany(() => PlantInspection, (inspection) => inspection.plant)
  inspections: PlantInspection[];

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'created_by_user_id' })
  created_by: SystemUser;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'updated_by_user_id' })
  updated_by: SystemUser;
}

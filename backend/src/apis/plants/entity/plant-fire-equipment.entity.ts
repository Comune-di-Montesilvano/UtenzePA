import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { FireEquipmentType } from '../enum/plant.enum';
import { Plant } from './plant.entity';

// Presidio antincendio (estintore, idrante, naspo, attacco VVF) di un
// impianto antincendio.
@Entity('plant_fire_equipment')
@Index(['plant_id', 'deleted'])
export class PlantFireEquipment {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int' })
  plant_id: number;

  @ManyToOne(() => Plant, (plant) => plant.fireEquipment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plant_id' })
  plant: Plant;

  @Column({ type: 'enum', enum: FireEquipmentType })
  equipment_type: FireEquipmentType;

  @Column({ type: 'varchar', length: 100, nullable: true })
  serial_number: string | null;

  // Agente estinguente (polvere, CO2, schiuma…).
  @Column({ type: 'varchar', length: 100, nullable: true })
  agent: string | null;

  // Capacità in kg o litri, testo breve (es. "6 kg").
  @Column({ type: 'varchar', length: 50, nullable: true })
  capacity: string | null;

  // Piano / locale.
  @Column({ type: 'varchar', length: 255, nullable: true })
  location: string | null;

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
}

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
import { Plant } from './plant.entity';

// Scadenzario: una verifica periodica (o manutenzione) di un impianto.
// next_date calcolata da last_date + period_months se non indicata.
@Entity('plant_inspections')
@Index(['plant_id', 'deleted'])
export class PlantInspection {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int' })
  plant_id: number;

  @ManyToOne(() => Plant, (plant) => plant.inspections, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plant_id' })
  plant: Plant;

  @Column({ length: 150 })
  kind: string;

  @Column({ type: 'int', nullable: true })
  period_months: number | null;

  @Column({ type: 'date', nullable: true })
  last_date: string | null;

  @Column({ type: 'date', nullable: true })
  next_date: string | null;

  // Ente o ditta.
  @Column({ type: 'varchar', length: 255, nullable: true })
  provider: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  outcome: string | null;

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

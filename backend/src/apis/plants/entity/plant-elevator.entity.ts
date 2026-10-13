import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { Plant } from './plant.entity';

// Dati specifici degli ascensori (registro ascensori comunali).
@Entity('plant_elevator')
export class PlantElevator {
  @PrimaryColumn({ type: 'int' })
  plant_id: number;

  @OneToOne(() => Plant, (plant) => plant.elevator, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plant_id' })
  plant: Plant;

  // Matricola comunale.
  @Column({ type: 'varchar', length: 100, nullable: true })
  serial_number: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  plant_number: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  manufacturer: string | null;

  @Column({ type: 'int', nullable: true })
  year: number | null;

  // Data di collaudo / messa in esercizio.
  @Column({ type: 'date', nullable: true })
  test_date: string | null;

  // Ascensore, montacarichi, piattaforma elevatrice.
  @Column({ type: 'varchar', length: 100, nullable: true })
  elevator_type: string | null;

  // Elettrico, oleodinamico.
  @Column({ type: 'varchar', length: 100, nullable: true })
  drive: string | null;

  @Column({ type: 'int', nullable: true })
  capacity_kg: number | null;

  @Column({ type: 'int', nullable: true })
  stops: number | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  speed: string | null;

  // Dalle schede dell'anagrafe comunale ascensori.
  @Column({ type: 'int', nullable: true })
  capacity_persons: number | null;

  // Numero di accessi (lati di sbarco) della cabina.
  @Column({ type: 'int', nullable: true })
  entrances: number | null;

  // Corsa in metri.
  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true })
  travel_m: number | null;

  // Norma tecnica applicabile (es. "DPR 162/99", "UNI 81-20/50:2014").
  @Column({ type: 'varchar', length: 100, nullable: true })
  technical_standard: string | null;

  // SIM del combinatore telefonico di emergenza (null = non noto).
  @Column({ type: 'boolean', nullable: true })
  emergency_sim: boolean | null;
}

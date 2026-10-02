import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { Plant } from './plant.entity';

// Dati specifici degli impianti termici/di climatizzazione (ex thermal_plants
// v1.6.0). Obblighi VVF/INAIL/efficienza derivati dalla potenza.
@Entity('plant_thermal')
export class PlantThermal {
  @PrimaryColumn({ type: 'int' })
  plant_id: number;

  @OneToOne(() => Plant, (plant) => plant.thermal, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plant_id' })
  plant: Plant;

  // Potenza termica complessiva (somma dei generatori).
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  power_kw: number | null;

  // Dettaglio generatori così come censito, es. "160+80".
  @Column({ type: 'varchar', length: 255, nullable: true })
  generators_description: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  vvf_certification: string | null;

  @Column({ type: 'boolean', default: false })
  vvf_exempt: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  inail_certification: string | null;

  @Column({ type: 'boolean', default: false })
  inail_exempt: boolean;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  served_area_sqm: number | null;

  @Column({ type: 'boolean', nullable: true })
  water_room: boolean | null;

  @Column({ type: 'int', nullable: true })
  outdoor_units: number | null;

  @Column({ type: 'int', nullable: true })
  indoor_units: number | null;

  @Column({ type: 'int', nullable: true })
  fan_coils: number | null;

  @Column({ type: 'int', nullable: true })
  air_handling_units: number | null;

  @Column({ type: 'int', nullable: true })
  chillers_heat_pumps: number | null;
}

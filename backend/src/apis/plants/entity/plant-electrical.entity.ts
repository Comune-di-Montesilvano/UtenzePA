import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { Plant } from './plant.entity';
import { ConformityType, ElectricalSupply, GroundingClass } from '../enum/plant.enum';

// Impianto elettrico dell'edificio: dati richiesti da DM 37/08 (conformità)
// e DPR 462/01 (denuncia INAIL, classificazione per la verifica di terra).
@Entity('plant_electrical')
export class PlantElectrical {
  @PrimaryColumn({ type: 'int' })
  plant_id: number;

  @OneToOne(() => Plant, (plant) => plant.electrical, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plant_id' })
  plant: Plant;

  @Column({ type: 'enum', enum: ElectricalSupply, nullable: true })
  supply: ElectricalSupply | null;

  @Column({ type: 'enum', enum: GroundingClass, nullable: true })
  grounding_class: GroundingClass | null;

  // null = non nota.
  @Column({ type: 'enum', enum: ConformityType, nullable: true })
  conformity_type: ConformityType | null;

  @Column({ type: 'date', nullable: true })
  conformity_date: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  conformity_number: string | null;

  // Denuncia di messa in esercizio all'INAIL (la DiCo vale come omologazione).
  @Column({ type: 'date', nullable: true })
  inail_date: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  inail_number: string | null;

  // Impianto di protezione dalle scariche atmosferiche; null = non nota.
  @Column({ type: 'boolean', nullable: true })
  lightning_protection: boolean | null;
}

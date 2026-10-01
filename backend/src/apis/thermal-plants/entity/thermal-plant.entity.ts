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
import { Asset } from '@apis/asset/entity/asset.entity';
import { Utility } from '@apis/utility/entity/utility.entity';
import { SystemUser } from '@apis/system-users/entity/system-user.entity';

// Impianto termico/di climatizzazione di un immobile. Distinto dall'utenza:
// resta all'edificio anche se cambia il contatore; l'utenza (PDR gas) che lo
// alimenta è facoltativa (es. pompa di calore elettrica).
@Entity('thermal_plants')
@Index(['asset_id_fk', 'deleted'])
@Index(['utility_id_fk', 'deleted'])
export class ThermalPlant {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int' })
  asset_id_fk: number;

  @Column({ type: 'int', nullable: true })
  utility_id_fk: number | null;

  @Column({ length: 255 })
  name: string;

  // Potenza termica complessiva (somma dei generatori).
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  power_kw: number | null;

  // Dettaglio generatori così come censito, es. "160+80".
  @Column({ length: 255, nullable: true })
  generators_description: string | null;

  @Column({ length: 255, nullable: true })
  vvf_certification: string | null;

  @Column({ type: 'boolean', default: false })
  vvf_exempt: boolean;

  @Column({ length: 255, nullable: true })
  inail_certification: string | null;

  @Column({ type: 'boolean', default: false })
  inail_exempt: boolean;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  served_area_sqm: number | null;

  @Column({ type: 'boolean', nullable: true })
  water_room: boolean | null;

  // Climatizzazione: conteggi semplici, senza le fasce di potenza del
  // capitolato di manutenzione (cambiano da un appalto all'altro).
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

  @ManyToOne(() => Asset, { nullable: false })
  @JoinColumn({ name: 'asset_id_fk' })
  asset: Asset;

  @ManyToOne(() => Utility, { nullable: true })
  @JoinColumn({ name: 'utility_id_fk' })
  utility: Utility | null;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'created_by_user_id' })
  created_by: SystemUser;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'updated_by_user_id' })
  updated_by: SystemUser;
}

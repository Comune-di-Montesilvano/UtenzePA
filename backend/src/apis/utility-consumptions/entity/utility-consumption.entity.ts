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
import { Utility } from '@apis/utility/entity/utility.entity';
import { SystemUser } from '@apis/system-users/entity/system-user.entity';
import { ConsumptionKind, ConsumptionSource } from '../enum/consumption-kind.enum';

// Rilevazione consumo di un'utenza: lettura contatore (valore cumulativo a
// una data, con matricola) oppure consumo di un periodo. I campi dell'altro
// tipo restano null.
@Entity('utility_consumptions')
@Index(['utility_id_fk', 'deleted'])
export class UtilityConsumption {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int' })
  utility_id_fk: number;

  @Column({ type: 'enum', enum: ConsumptionKind })
  kind: ConsumptionKind;

  @Column({ type: 'date', nullable: true })
  reading_date: string | null;

  @Column({ type: 'decimal', precision: 14, scale: 3, nullable: true })
  reading_value: number | null;

  @Column({ length: 255, nullable: true })
  meter_number: string | null;

  @Column({ type: 'date', nullable: true })
  period_start: string | null;

  @Column({ type: 'date', nullable: true })
  period_end: string | null;

  @Column({ type: 'decimal', precision: 14, scale: 3, nullable: true })
  consumption: number | null;

  @Column({ type: 'enum', enum: ConsumptionSource, default: ConsumptionSource.MANUAL })
  source: ConsumptionSource;

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

  @ManyToOne(() => Utility, { nullable: false })
  @JoinColumn({ name: 'utility_id_fk' })
  utility: Utility;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'created_by_user_id' })
  created_by: SystemUser;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'updated_by_user_id' })
  updated_by: SystemUser;
}

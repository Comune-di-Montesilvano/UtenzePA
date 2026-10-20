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
import { Invoice } from '@apis/invoices/entity/invoice.entity';
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

  // Consumi per fascia (solo periodi di utenze elettriche): F0 = monoraria.
  // Se valorizzate, la somma coincide col consumo entro 1 kWh.
  @Column({ type: 'decimal', precision: 14, scale: 3, nullable: true })
  consumption_f0: number | null;

  @Column({ type: 'decimal', precision: 14, scale: 3, nullable: true })
  consumption_f1: number | null;

  @Column({ type: 'decimal', precision: 14, scale: 3, nullable: true })
  consumption_f2: number | null;

  @Column({ type: 'decimal', precision: 14, scale: 3, nullable: true })
  consumption_f3: number | null;

  // Penale per energia reattiva addebitata nel periodo; null = non noto.
  @Column({ type: 'boolean', nullable: true })
  reactive_penalty: boolean | null;

  // Valore stimato dal fornitore: conta finché non arriva il dato reale.
  @Column({ type: 'boolean', default: false })
  is_estimated: boolean;

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

  // Lettura importata da una fattura (le rilevazioni di periodo si collegano alle righe).
  @Column({ type: 'int', nullable: true })
  invoice_id_fk: number | null;

  @ManyToOne(() => Invoice, { onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'invoice_id_fk',
    foreignKeyConstraintName: 'FK_utility_consumptions_invoice',
  })
  invoice: Invoice;

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

import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { ConsipAgreement } from '@apis/consip-agreement/entity/consip-agreement.entity';

// Costo unitario tutto incluso inserito a mano per convenzione e tipo di
// utenza: sostituisce quello proposto finché la riga esiste.
@Entity('consip_agreement_prices')
@Unique('UQ_agreement_prices_agreement_type', ['consip_agreement_id_fk', 'hard_type'])
export class ConsipAgreementPrice {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  consip_agreement_id_fk: number;

  @Column({ type: 'varchar', length: 30 })
  hard_type: string;

  @Column({ type: 'decimal', precision: 12, scale: 6 })
  unit_price: number;

  @Column({ type: 'int', nullable: true })
  updated_by_user_id: number | null;

  @UpdateDateColumn({ type: 'timestamp' })
  update_date: Date;

  @ManyToOne(() => ConsipAgreement, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'consip_agreement_id_fk',
    foreignKeyConstraintName: 'FK_agreement_prices_agreement',
  })
  agreement: ConsipAgreement;
}

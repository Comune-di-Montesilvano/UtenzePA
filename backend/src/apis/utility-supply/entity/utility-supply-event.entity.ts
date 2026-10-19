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
import { ThirdParty } from '@apis/third-parties/entity/third-party.entity';
import { UtilizerGrant } from '@apis/utilizer-grant/entity/utilizer-grant.entity';
import { SystemUser } from '@apis/system-users/entity/system-user.entity';
import { SupplyEventType } from '../enum/supply-event-type.enum';

// Un cambiamento nella vita di un'utenza: attivazione, cessazione, voltura o
// reintestazione. Senza data effettiva = in sospeso.
@Entity('utility_supply_events')
@Index('IDX_supply_events_utility', ['utility_id_fk', 'deleted'])
export class UtilitySupplyEvent {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int' })
  utility_id_fk: number;

  @Column({ type: 'varchar', length: 20 })
  type: SupplyEventType;

  // Solo TRANSFER: soggetto terzo a cui va l'utenza.
  @Column({ type: 'int', nullable: true })
  third_party_id_fk: number | null;

  @Column({ type: 'date', nullable: true })
  requested_on: string | null;

  @Column({ type: 'date', nullable: true })
  effective_on: string | null;

  // ACTIVATION/CESSATION avvenuta senza data conosciuta.
  @Column({ type: 'boolean', default: false })
  date_unknown: boolean;

  @Column({ type: 'date', nullable: true })
  cancelled_on: string | null;

  // Contratto immobiliare che ha generato il cambiamento.
  @Column({ type: 'int', nullable: true })
  utilizer_grant_id_fk: number | null;

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
  @JoinColumn({ name: 'utility_id_fk', foreignKeyConstraintName: 'FK_supply_events_utility' })
  utility: Utility;

  @ManyToOne(() => ThirdParty, { nullable: true })
  @JoinColumn({
    name: 'third_party_id_fk',
    foreignKeyConstraintName: 'FK_supply_events_third_party',
  })
  thirdParty: ThirdParty | null;

  @ManyToOne(() => UtilizerGrant, { nullable: true })
  @JoinColumn({ name: 'utilizer_grant_id_fk', foreignKeyConstraintName: 'FK_supply_events_grant' })
  grant: UtilizerGrant | null;

  @ManyToOne(() => SystemUser)
  @JoinColumn({
    name: 'created_by_user_id',
    foreignKeyConstraintName: 'FK_supply_events_created_by',
  })
  created_by: SystemUser;

  @ManyToOne(() => SystemUser)
  @JoinColumn({
    name: 'updated_by_user_id',
    foreignKeyConstraintName: 'FK_supply_events_updated_by',
  })
  updated_by: SystemUser;
}

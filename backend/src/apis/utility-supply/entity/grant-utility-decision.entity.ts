import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Utility } from '@apis/utility/entity/utility.entity';
import { ThirdParty } from '@apis/third-parties/entity/third-party.entity';
import { UtilizerGrant } from '@apis/utilizer-grant/entity/utilizer-grant.entity';
import { SystemUser } from '@apis/system-users/entity/system-user.entity';
import { GrantUtilityDecisionValue } from '../enum/supply-event-type.enum';

// Decisione contratto immobiliare x utenza. decision null = da decidere.
@Entity('utilizer_grant_utility_decisions')
@Unique('UQ_grant_decisions_grant_utility', ['utilizer_grant_id_fk', 'utility_id_fk'])
export class GrantUtilityDecision {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int' })
  utilizer_grant_id_fk: number;

  @Column({ type: 'int' })
  utility_id_fk: number;

  @Column({ type: 'varchar', length: 20, nullable: true })
  decision: GrantUtilityDecisionValue | null;

  // Parte scelta se la decisione è FOLLOWS.
  @Column({ type: 'int', nullable: true })
  third_party_id_fk: number | null;

  @CreateDateColumn({ type: 'timestamp' })
  create_date: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  update_date: Date;

  @Column({ name: 'updated_by_user_id', type: 'int', nullable: true })
  updated_by_user_id: number | null;

  @ManyToOne(() => UtilizerGrant, { nullable: false })
  @JoinColumn({
    name: 'utilizer_grant_id_fk',
    foreignKeyConstraintName: 'FK_grant_decisions_grant',
  })
  grant: UtilizerGrant;

  @ManyToOne(() => Utility, { nullable: false })
  @JoinColumn({ name: 'utility_id_fk', foreignKeyConstraintName: 'FK_grant_decisions_utility' })
  utility: Utility;

  @ManyToOne(() => ThirdParty, { nullable: true })
  @JoinColumn({
    name: 'third_party_id_fk',
    foreignKeyConstraintName: 'FK_grant_decisions_third_party',
  })
  thirdParty: ThirdParty | null;

  @ManyToOne(() => SystemUser, { nullable: true })
  @JoinColumn({
    name: 'updated_by_user_id',
    foreignKeyConstraintName: 'FK_grant_decisions_updated_by',
  })
  updated_by: SystemUser | null;
}

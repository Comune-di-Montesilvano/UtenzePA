import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SystemUser } from '@apis/system-users/entity/system-user.entity';
import { ActType } from '@apis/act-types/entity/act-type.entity';
import { Asset } from '@apis/asset/entity/asset.entity';
import { Plant } from '@apis/plants/entity/plant.entity';
import { UtilizerGrant } from '@apis/utilizer-grant/entity/utilizer-grant.entity';
import { Contract } from '@apis/contracts/entity/contract.entity';

// Atto ufficiale (delibera, determina, atto notarile…): estremi, file
// facoltativi (allegati con entity_type 'act'), collegato N-N alle entità.
@Entity('acts')
export class Act {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int' })
  act_type_id: number;

  @ManyToOne(() => ActType)
  @JoinColumn({ name: 'act_type_id' })
  actType: ActType;

  @Column({ type: 'varchar', length: 100, nullable: true })
  number: string | null;

  @Column({ type: 'date', nullable: true })
  act_date: string | null;

  @Column({ length: 500 })
  subject: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  issuer: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  protocol_number: string | null;

  @Column({ type: 'date', nullable: true })
  protocol_date: string | null;

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

  @ManyToMany(() => Asset)
  @JoinTable({
    name: 'act_assets',
    joinColumn: { name: 'act_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'asset_id', referencedColumnName: 'id' },
  })
  assets: Asset[];

  @ManyToMany(() => Plant)
  @JoinTable({
    name: 'act_plants',
    joinColumn: { name: 'act_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'plant_id', referencedColumnName: 'id' },
  })
  plants: Plant[];

  @ManyToMany(() => UtilizerGrant)
  @JoinTable({
    name: 'act_utilizer_grants',
    joinColumn: { name: 'act_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'utilizer_grant_id', referencedColumnName: 'id' },
  })
  utilizerGrants: UtilizerGrant[];

  @ManyToMany(() => Contract)
  @JoinTable({
    name: 'act_contracts',
    joinColumn: { name: 'act_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'contract_id', referencedColumnName: 'id' },
  })
  contracts: Contract[];

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'created_by_user_id' })
  created_by: SystemUser;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'updated_by_user_id' })
  updated_by: SystemUser;
}

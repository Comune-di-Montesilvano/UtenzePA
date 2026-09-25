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
import { AssetFunction } from '@apis/asset-functions/entity/asset-function.entity';

// Natura fisica di un immobile (Fabbricato, Area, Impianto…). `functions` =
// funzioni ammesse per questa natura: un immobile può avere la coppia
// (nature_id, function_id) solo se presente qui.
@Entity('asset_natures')
export class AssetNature {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ length: 255, unique: true })
  name: string;

  // Ligature Material Icons (stesso uso di AssetFunction.icon).
  @Column({ type: 'varchar', length: 50, nullable: true })
  icon: string | null;

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

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'created_by_user_id' })
  created_by: SystemUser;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'updated_by_user_id' })
  updated_by: SystemUser;

  @ManyToMany(() => AssetFunction)
  @JoinTable({
    name: 'asset_nature_functions',
    joinColumn: { name: 'nature_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'function_id', referencedColumnName: 'id' },
  })
  functions: AssetFunction[];
}

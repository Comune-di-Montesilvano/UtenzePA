import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SystemUser } from '@apis/system-users/entity/system-user.entity';

// Funzione di un immobile (a cosa serve: Istruzione, Sport, Illuminazione…).
// Le combinazioni ammesse con la Natura stanno in asset_nature_functions
// (vedi AssetNature.functions). Sostituisce progressivamente AssetAggregator.
@Entity('asset_functions')
export class AssetFunction {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ length: 255, unique: true })
  name: string;

  // Ligature Material Icons per i marker mappa (stesso uso di
  // AssetAggregator.icon, che resta come fallback in transizione).
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
}

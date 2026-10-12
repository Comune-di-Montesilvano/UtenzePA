import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Asset } from '@apis/asset/entity/asset.entity';
import { SystemUser } from '@apis/system-users/entity/system-user.entity';
import { ComplexType } from '../enum/complex-type.enum';
import { ComplexKind } from '../enum/complex-kind.enum';

// Complesso: immobili gestiti o censiti come un insieme (palazzina di
// alloggi, plesso scolastico, impianto sportivo). Livello "compendio" del
// censimento MEF. Un immobile sta in al massimo un complesso (assets.complex_id).
@Entity('complexes')
export class Complex {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'enum', enum: ComplexType, nullable: true })
  complex_type: ComplexType | null;

  // Fisico o amministrativo: il secondo non ha un pin in mappa.
  @Column({ type: 'enum', enum: ComplexKind, default: ComplexKind.PHYSICAL })
  kind: ComplexKind;

  @Column({ type: 'varchar', length: 255, nullable: true })
  toponym: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  civic_number: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  latitude: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  longitude: string | null;

  @Column({ type: 'int', nullable: true, unique: true })
  mef_compendium_id: number | null;

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

  @OneToMany(() => Asset, (asset) => asset.complex)
  assets: Asset[];

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'created_by_user_id' })
  created_by: SystemUser;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'updated_by_user_id' })
  updated_by: SystemUser;
}

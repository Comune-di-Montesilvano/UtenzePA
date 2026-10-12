import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Asset } from './asset.entity';

// Unità catastale di un immobile (un immobile può averne più d'una: piani,
// subalterni). Sostituita in blocco a ogni salvataggio dell'immobile.
@Entity('asset_cadastral_units')
@Index(['sheet', 'parcel'])
export class AssetCadastralUnit {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column()
  asset_id: number;

  @Column({ type: 'varchar', length: 5, nullable: true })
  section: string | null;

  @Column({ length: 50 })
  sheet: string;

  @Column({ length: 50 })
  parcel: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  subordinate: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  category: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  cadastral_income: number | null;

  @ManyToOne(() => Asset, (asset) => asset.cadastralUnits, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'asset_id' })
  asset: Asset;
}

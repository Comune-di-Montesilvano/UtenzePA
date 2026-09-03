import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PhotoEntityType } from '../enum/photo-entity-type.enum';

@Entity('photos')
@Index(['entity_type', 'entity_id'])
export class Photo {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'enum', enum: PhotoEntityType })
  entity_type: PhotoEntityType;

  @Column({ type: 'int' })
  entity_id: number;

  @Column({ length: 500 })
  file_path: string;

  @Column({ length: 50 })
  mime_type: string;

  @Column({ length: 255, nullable: true })
  original_filename: string;

  @Column({ type: 'int' })
  file_size: number;

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
}

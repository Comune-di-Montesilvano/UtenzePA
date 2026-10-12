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
import { SystemUser } from '@apis/system-users/entity/system-user.entity';
import { AttachmentEntityType } from '../enum/attachment-entity-type.enum';

// File allegato a un'entità (polimorfico, come le foto). Su disco in
// <ATTACHMENTS_DIR>/<entity_type>/<entity_id>/<stored_name>; stored_name è
// generato (uuid + estensione): nessun input dell'utente nel path.
@Entity('attachments')
@Index(['entity_type', 'entity_id', 'deleted'])
export class Attachment {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'enum', enum: AttachmentEntityType })
  entity_type: AttachmentEntityType;

  @Column({ type: 'int' })
  entity_id: number;

  @Column({ length: 255 })
  original_name: string;

  @Column({ length: 255 })
  stored_name: string;

  @Column({ length: 150 })
  mime_type: string;

  @Column({ type: 'int' })
  size_bytes: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

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
}

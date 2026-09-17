import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SystemUser } from '@apis/system-users/entity/system-user.entity';

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
}

@Entity('audit_logs')
@Index(['entity_name', 'entity_id'])
@Index(['entity_name', 'user_id'])
export class AuditLog {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ length: 100 })
  entity_name: string;

  @Column({ type: 'int' })
  entity_id: number;

  @Column({ type: 'enum', enum: AuditAction })
  action: AuditAction;

  @Column({ length: 100, nullable: true })
  field_name: string | null;

  @Column({ type: 'text', nullable: true })
  old_value: string | null;

  @Column({ type: 'text', nullable: true })
  new_value: string | null;

  @Column({ type: 'text', nullable: true })
  old_label: string | null;

  @Column({ type: 'text', nullable: true })
  new_label: string | null;

  @Column({ type: 'int' })
  user_id: number;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'user_id' })
  user: SystemUser;
}

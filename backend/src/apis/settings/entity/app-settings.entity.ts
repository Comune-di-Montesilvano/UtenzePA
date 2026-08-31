import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

// Singleton: una sola riga, id sempre 1. Nessun CRUD multi-riga, nessun
// soft-delete — a differenza delle altre entity di dominio del progetto.
@Entity({ name: 'app_settings' })
export class AppSettings {
  @PrimaryColumn({ default: 1 })
  id: number;

  @Column({ length: 255, default: 'Comune di Montesilvano' })
  entity_name: string;

  @Column({ length: 100, default: 'Comune' })
  entity_type: string;

  @Column({ length: 20, default: '42.5083' })
  default_latitude: string;

  @Column({ length: 20, default: '14.15' })
  default_longitude: string;

  @Column({ type: 'longtext', nullable: true })
  logo: string | null;

  @Column({ length: 50, nullable: true })
  logo_mime: string | null;

  @Column({ type: 'longtext', nullable: true })
  favicon: string | null;

  @Column({ length: 50, nullable: true })
  favicon_mime: string | null;

  @UpdateDateColumn({ type: 'timestamp' })
  update_date: Date;

  @Column({ name: 'updated_by_user_id', nullable: true })
  updated_by_user_id: number | null;
}

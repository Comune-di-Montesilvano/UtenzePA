import { Column, Entity, PrimaryColumn } from 'typeorm';

// Singleton (id 1) come app_settings: interruttore del motore e punto di
// ripresa sulla casella PEC. Sta nel DB: un DB importato porta il suo stato.
@Entity('invoice_import_state')
export class InvoiceImportState {
  @PrimaryColumn({ default: 1 })
  id: number;

  @Column({ type: 'boolean', default: false })
  enabled: boolean;

  @Column({ type: 'bigint', nullable: true })
  uid_validity: string | null;

  @Column({ type: 'bigint', nullable: true })
  last_uid: string | null;

  @Column({ type: 'datetime', nullable: true })
  last_run_at: Date | null;

  @Column({ type: 'datetime', nullable: true })
  last_success_at: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  last_error: string | null;
}

import { Column, Entity, PrimaryColumn } from 'typeorm';

// Singleton (id 1) come invoice_import_state: interruttore dell'import
// contabilità, anno di partenza ed esito dell'ultimo giro. Sta nel DB: un DB
// importato porta il suo stato.
@Entity('accounting_import_state')
export class AccountingImportState {
  @PrimaryColumn({ default: 1 })
  id: number;

  @Column({ type: 'boolean', default: false })
  enabled: boolean;

  @Column({ type: 'int', nullable: true })
  from_year: number | null;

  @Column({ type: 'datetime', nullable: true })
  last_run_at: Date | null;

  @Column({ type: 'json', nullable: true })
  last_summary: unknown;

  @Column({ type: 'varchar', length: 500, nullable: true })
  last_error: string | null;

  // Ultimo caricamento riuscito (anche manuale), o conferma che il backup del
  // container è quello già caricato: lo legge la segnalazione accounting_import_stale.
  @Column({ type: 'datetime', nullable: true })
  last_success_at: Date | null;

  // SHA-256 dell'ultimo backup Tinn caricato: il container salta il ripristino se
  // è uguale (settings.loaded_sha256). Nel DB perché sopravviva a un ripristino.
  @Column({ type: 'varchar', length: 64, nullable: true })
  last_loaded_sha256: string | null;
}

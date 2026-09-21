export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE';

export interface AuditLogEntry {
  id: number;
  entity_name: string;
  entity_id: number;
  // Nome/codice leggibile del record (es. asset_name per immobili, utility_id
  // per utenze) — risolto lato backend, null per le entità senza resolver.
  entity_label: string | null;
  action: AuditAction;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  old_label: string | null;
  new_label: string | null;
  user_id: number;
  user: { id: number; firstName: string; lastName: string } | null;
  created_at: string;
}

export interface AuditLogPage {
  items: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

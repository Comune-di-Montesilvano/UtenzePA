export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE';

export interface AuditLogEntry {
  id: number;
  entity_name: string;
  entity_id: number;
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

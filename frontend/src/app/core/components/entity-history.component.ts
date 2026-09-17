import {
  Component,
  Input,
  OnChanges,
  OnInit,
  SimpleChanges,
  ChangeDetectionStrategy,
  inject,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatExpansionModule } from '@angular/material/expansion';
import { AuditLogService } from '../../services/audit-log.service';
import { AuditAction, AuditLogEntry } from '../entities/audit-log-entry.entity';

const HISTORY_PAGE_SIZE = 10;

export interface AuditHistoryGroup {
  id: string; // chiave sintetica per il tracking Angular (@for track)
  action: AuditAction;
  createdAt: string;
  user: AuditLogEntry['user'];
  userId: number;
  fields: AuditLogEntry[]; // vuoto per CREATE/DELETE
}

@Component({
  selector: 'app-entity-history',
  standalone: true,
  imports: [CommonModule, DatePipe, MatIconModule, MatExpansionModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './entity-history.component.html',
  styleUrls: ['./entity-history.component.scss'],
})
export class EntityHistoryComponent implements OnInit, OnChanges {
  @Input({ required: true }) entity!: string;
  @Input({ required: true }) entityId!: number;
  @Input() lastModifiedBy: string | null = null;
  @Input() lastModifiedAt: string | null = null;

  private auditLogService = inject(AuditLogService);

  entries: AuditLogEntry[] = [];
  groups: AuditHistoryGroup[] = [];
  loading = false;

  ngOnInit(): void {
    this.load();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['entityId'] && !changes['entityId'].firstChange) {
      this.load();
    }
  }

  actionLabel(group: AuditHistoryGroup): string {
    if (group.action === 'CREATE') return 'Creato';
    if (group.action === 'DELETE') return 'Eliminato';
    const count = group.fields.length;
    return count === 1 ? `Modificato — ${group.fields[0].field_name}` : `Modificato — ${count} campi`;
  }

  displayValue(value: string | null, label: string | null): string {
    if (label) return label;
    if (value === null || value === '') return '—';
    return value;
  }

  private load(): void {
    if (!this.entityId) return;
    this.loading = true;
    this.auditLogService
      .search({ entity: this.entity, entityId: this.entityId, pageSize: HISTORY_PAGE_SIZE })
      .subscribe({
        next: (page) => {
          this.entries = page.items;
          this.groups = this.groupEntries(page.items);
          this.loading = false;
        },
        error: () => {
          this.entries = [];
          this.groups = [];
          this.loading = false;
        },
      });
  }

  private groupEntries(items: AuditLogEntry[]): AuditHistoryGroup[] {
    const map = new Map<string, AuditHistoryGroup>();
    for (const item of items) {
      const key = `${item.action}|${item.created_at}|${item.user_id}`;
      let group = map.get(key);
      if (!group) {
        group = {
          id: key,
          action: item.action,
          createdAt: item.created_at,
          user: item.user,
          userId: item.user_id,
          fields: [],
        };
        map.set(key, group);
      }
      if (item.action === 'UPDATE') {
        group.fields.push(item);
      }
    }
    return Array.from(map.values());
  }
}

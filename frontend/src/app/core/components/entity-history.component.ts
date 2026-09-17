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
import { AuditLogEntry } from '../entities/audit-log-entry.entity';

const HISTORY_PAGE_SIZE = 10;

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
  loading = false;

  ngOnInit(): void {
    this.load();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['entityId'] && !changes['entityId'].firstChange) {
      this.load();
    }
  }

  actionLabel(entry: AuditLogEntry): string {
    if (entry.action === 'CREATE') return 'Creato';
    if (entry.action === 'DELETE') return 'Eliminato';
    return `Modificato — ${entry.field_name}`;
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
          this.loading = false;
        },
        error: () => {
          this.entries = [];
          this.loading = false;
        },
      });
  }
}

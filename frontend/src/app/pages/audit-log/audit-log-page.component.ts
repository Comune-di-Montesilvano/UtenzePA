import { Component, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { AuditLogService } from '../../services/audit-log.service';
import { AuditLogEntry } from '../../core/entities/audit-log-entry.entity';
import { TOption } from '../../core/types/option.interface';

// Valori coerenti con `protected readonly entityName` dichiarato in ciascun
// service backend (verificato in `backend/src/apis/*/*.service.ts`, non con
// la bozza di piano originale, che aveva 3 valori errati):
// - assets.service.ts        -> 'assets'
// - utility.service.ts       -> 'utilities' (plurale, non 'utility')
// - contracts.service.ts     -> 'contract'  (singolare, non 'contracts')
// - invoice.service.ts       -> 'Invoice'   (maiuscola, non 'invoices')
// - suppliers.service.ts     -> 'suppliers'
// - system-users.service.ts  -> 'user'
const ENTITY_OPTIONS: TOption[] = [
  { label: 'Immobili', value: 'assets' },
  { label: 'Utenze', value: 'utilities' },
  { label: 'Contratti', value: 'contract' },
  { label: 'Fatture', value: 'Invoice' },
  { label: 'Fornitori', value: 'suppliers' },
  { label: 'Utenti', value: 'user' },
];

@Component({
  selector: 'app-audit-log-page',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatTableModule,
    MatPaginatorModule,
    MatButtonModule,
    DatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './audit-log-page.component.html',
})
export class AuditLogPageComponent implements OnInit {
  private fb = inject(FormBuilder);
  private auditLogService = inject(AuditLogService);

  entityOptions = ENTITY_OPTIONS;
  displayedColumns = ['created_at', 'entity_name', 'entity_id', 'user', 'action', 'summary'];

  entries: AuditLogEntry[] = [];
  total = 0;
  page = 1;
  pageSize = 20;
  forbidden = false;

  filterForm = this.fb.group({
    entity: [ENTITY_OPTIONS[0].value as string],
    userId: [null as number | null],
  });

  ngOnInit(): void {
    this.load();
  }

  onFilterChange(): void {
    this.page = 1;
    this.load();
  }

  onPage(event: PageEvent): void {
    this.page = event.pageIndex + 1;
    this.pageSize = event.pageSize;
    this.load();
  }

  summary(entry: AuditLogEntry): string {
    if (entry.action === 'CREATE') return 'Elemento creato';
    if (entry.action === 'DELETE') return 'Elemento eliminato';
    const oldVal = entry.old_label ?? entry.old_value ?? '—';
    const newVal = entry.new_label ?? entry.new_value ?? '—';
    return `${entry.field_name}: ${oldVal} → ${newVal}`;
  }

  private load(): void {
    const { entity, userId } = this.filterForm.value;
    if (!entity) return;
    this.auditLogService
      .search({ entity, userId: userId ?? undefined, page: this.page, pageSize: this.pageSize })
      .subscribe({
        next: (result) => {
          this.entries = result.items;
          this.total = result.total;
          this.forbidden = false;
        },
        error: (err) => {
          this.entries = [];
          this.total = 0;
          this.forbidden = err?.status === 403;
        },
      });
  }
}

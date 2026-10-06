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
import { EntityNavigatorService } from '../../core/services/entity-navigator.service';
import { AuditLogEntry } from '../../core/entities/audit-log-entry.entity';
import { TOption } from '../../core/types/option.interface';
import { Observable } from 'rxjs';


// Valori = `protected readonly entityName` di ciascun service backend
// (`grep -rn "readonly entityName" backend/src/apis`): nomi storici non
// uniformi ('contract', 'Invoice', 'user'). I fornitori sono 'third_parties'
// dalla v1.8.0 (prima 'suppliers': questo elenco era rimasto indietro e il
// registro dei fornitori risultava sempre vuoto).
const ENTITY_OPTIONS: TOption[] = [
  { label: 'Immobili', value: 'assets' },
  { label: 'Utenze', value: 'utilities' },
  { label: 'Impianti', value: 'plants' },
  { label: 'Contratti di fornitura', value: 'contract' },
  { label: 'Contratti immobiliari', value: 'utilizer_grant' },
  { label: 'Fatture', value: 'Invoice' },
  { label: 'Soggetti terzi (fornitori, controparti)', value: 'third_parties' },
  { label: 'Capitoli di spesa', value: 'budget_chapters' },
  { label: 'Impegni di spesa', value: 'budget_commitments' },
  { label: 'Spesa storica dei capitoli', value: 'budget_chapter_spending' },
  { label: 'Convenzioni CONSIP', value: 'consip_agreement' },
  { label: 'Letture e consumi', value: 'utility_consumptions' },
  { label: 'Tipi utenza', value: 'utility_types' },
  { label: 'Tipologie immobile', value: 'asset_natures' },
  { label: 'Funzioni immobile', value: 'asset_functions' },
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
  private navigator = inject(EntityNavigatorService);

  entityOptions = ENTITY_OPTIONS;
  displayedColumns = ['created_at', 'entity_name', 'entity_id', 'user', 'action', 'summary'];

  entries: AuditLogEntry[] = [];
  total = 0;
  page = 1;
  pageSize = 25;
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

  entityLabel(entry: AuditLogEntry): string {
    return this.entityOptions.find((opt) => opt.value === entry.entity_name)?.label ?? entry.entity_name;
  }

  // Schede apribili dal navigatore; per le altre entità l'id resta testo.
  private readonly openers: Record<string, (id: number) => Observable<unknown>> = {
    assets: id => this.navigator.openAsset(id),
    utilities: id => this.navigator.openUtility(id),
    plants: id => this.navigator.openPlant(id),
    contract: id => this.navigator.openSupplyContract(id),
    utilizer_grant: id => this.navigator.openGrant(id),
    Invoice: id => this.navigator.openInvoice(id),
    third_parties: id => this.navigator.openThirdParty(id),
    budget_chapters: id => this.navigator.openBudgetChapter(id),
  };

  hasDetailLink(entry: AuditLogEntry): boolean {
    return !!this.openers[entry.entity_name];
  }

  // Apre la scheda del record (stesso dialog di modifica usato altrove) e
  // ricarica il registro se l'utente salva qualcosa.
  openRecordDetail(entry: AuditLogEntry): void {
    const opened = this.openers[entry.entity_name]?.(entry.entity_id) ?? null;
    opened?.subscribe((saved) => {
      if (saved) this.load();
    });
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

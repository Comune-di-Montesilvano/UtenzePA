import {ChangeDetectionStrategy, Component, inject, Input, OnInit} from '@angular/core';
import {plainToInstance} from 'class-transformer';
import {DataTableUtilitiesComponent} from '../utilities/data-table-utilities.component';
import {UtilityService} from '../utilities/utility.service';
import {Utility} from '../utilities/entity/utility.entity';
import {UtilityConsumptionService} from '../utilities/consumptions/utility-consumption.service';
import {ChapterConsumptionSummaryRow, formatQty} from '../utilities/consumptions/consumption.model';
import {HardTypeDescription} from '../utility-types/enum/hard-type.enum';
import {AuthService} from '../../services/auth.service';
import {ToastService} from '../../core/services/toast.service';

// Utenze del capitolo: stessa tabella (colonne configurabili, dettaglio,
// export) della pagina Utenze, filtrata per capitolo. Il salvataggio dal
// dialog utenza va fatto qui: la tabella emette onSave e basta.
@Component({
  selector: 'app-budget-chapter-utilities-tab',
  standalone: true,
  imports: [DataTableUtilitiesComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div style="display: flex; flex-direction: column; gap: 1rem; padding: 1rem 0;">
      <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
        @for (row of summary; track row.hard_type) {
          <div style="flex: 1 1 260px; border: 1px solid var(--app-border); border-radius: 6px; padding: 0.75rem 1rem;">
            <div style="font-weight: 600;">{{ hardTypeLabel[row.hard_type] }} · {{ row.utilities_count }} utenze</div>
            <div style="font-size: 0.9rem;">Presunto: <strong>{{ formatQty(row.estimated_sum, row.unit) }}</strong></div>
            <div style="font-size: 0.9rem;">Effettivo 12 mesi: <strong>{{ formatQty(row.actual_sum, row.unit) }}</strong></div>
          </div>
        } @empty {
          <p style="color: var(--app-muted); margin: 0;">Nessun consumo per le utenze di questo capitolo.</p>
        }
      </div>
      <app-data-table-utilities
        [data]="utilities"
        [loading]="loading"
        (onSave)="save($event)"
        (onCreate)="create($event)"
        (onDelete)="remove($event)"
        (onRestore)="reload()">
      </app-data-table-utilities>
    </div>
  `,
})
export class BudgetChapterUtilitiesTabComponent implements OnInit {
  private utilityService = inject(UtilityService);
  private consumptionService = inject(UtilityConsumptionService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);

  @Input({required: true}) chapterId!: number;

  readonly formatQty = formatQty;
  readonly hardTypeLabel = HardTypeDescription;

  utilities: Utility[] = [];
  summary: ChapterConsumptionSummaryRow[] = [];
  loading = false;

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading = true;
    this.utilityService.search({budget_chapter_code_fk: this.chapterId, deleted: false}).subscribe({
      next: data => {
        this.utilities = plainToInstance(Utility, data);
        this.loading = false;
      },
      error: err => {
        this.loading = false;
        console.error('Errore caricamento utenze del capitolo:', err);
      },
    });
    this.consumptionService.chapterSummary(this.chapterId).subscribe({
      next: summary => this.summary = summary,
      error: err => console.error('Errore caricamento riepilogo consumi capitolo:', err),
    });
  }

  save(utility: Utility): void {
    this.utilityService.update(utility.id, utility).subscribe({
      next: () => {
        this.toast.add({key: 'global', severity: 'success', summary: 'Anagrafica aggiornata', detail: utility.utility_id});
        this.reload();
      },
      error: err => this.fail("Errore nel salvataggio dell'utenza", err),
    });
  }

  create(utility: Utility): void {
    const userId = this.authService.getCurrentUser()?.id;
    this.utilityService.create({...utility, created_by_user_id: userId, updated_by_user_id: userId}).subscribe({
      next: () => {
        this.toast.add({key: 'global', severity: 'success', summary: 'Utenza creata', detail: utility.utility_id});
        this.reload();
      },
      error: err => this.fail("Errore nella creazione dell'utenza", err),
    });
  }

  remove(utility: Utility): void {
    this.utilityService.delete(utility.id).subscribe({
      next: () => {
        this.toast.add({key: 'global', severity: 'success', summary: 'Elemento cancellato', detail: utility.utility_id});
        this.reload();
      },
      error: err => this.fail("Errore nell'eliminazione dell'utenza", err),
    });
  }

  private fail(summary: string, err: {error?: {message?: string | string[]}}): void {
    const message = err?.error?.message;
    this.toast.add({key: 'global', severity: 'error', summary, detail: Array.isArray(message) ? message.join(' ') : (message ?? '')});
  }
}

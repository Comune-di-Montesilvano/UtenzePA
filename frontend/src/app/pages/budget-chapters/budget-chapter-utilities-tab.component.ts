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
import {keepOpen, SheetGroup, SheetGroupsComponent} from '../../core/components/entity-sheet/sheet-groups.component';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatSelectModule} from '@angular/material/select';
import {MatTooltipModule} from '@angular/material/tooltip';
import {EntityNavigatorService} from '../../core/services/entity-navigator.service';
import {DateHelper} from '../../core/helpers/date.helper';
import {ChapterBudgetService} from './chapter-budget.service';
import {ChapterTypeStats, ChapterUtilityStats, ChapterUtilityStatsRow} from './chapter-budget.model';
import {formatEuro} from './spending/budget-chapter-spending.service';

const NOT_COMPARABLE = "Non confrontabile: fatture con righe per meno dell'80% dei giorni in uno dei due periodi, o utenza cessata";

// Utenze del capitolo: statistiche del periodo (spesa, consumo, costo
// unitario, variazione, fuori norma) e, nella vista Anagrafica, la stessa
// tabella (colonne configurabili, dettaglio, export) della pagina Utenze,
// filtrata per capitolo. Il salvataggio dal dialog utenza va fatto qui: la
// tabella emette onSave e basta.
@Component({
  selector: 'app-budget-chapter-utilities-tab',
  standalone: true,
  imports: [
    DataTableUtilitiesComponent, SheetGroupsComponent, MatButtonToggleModule, MatFormFieldModule,
    MatIconModule, MatSelectModule, MatTooltipModule,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="cu">
      <div class="cu-bar">
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="cu-period">
          <mat-label>Periodo</mat-label>
          <mat-select [value]="period" (selectionChange)="setPeriod($event.value)">
            <mat-option value="last12">Ultimi 12 mesi</mat-option>
            @for (y of years; track y) {
              <mat-option [value]="'' + y">{{ y }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        @if (stats) {
          <span class="cu-muted">dal {{ dateIt(stats.period.start) }} al {{ dateIt(stats.period.end) }}</span>
        }
        <span class="cu-spacer"></span>
        @if (view === 'stats' && outlierCount) {
          <button type="button" class="cu-chip" [class.cu-chip--on]="onlyOutliers" [attr.aria-pressed]="onlyOutliers"
                  (click)="toggleOutliers()">
            <mat-icon>warning</mat-icon> Solo fuori norma ({{ outlierCount }})
          </button>
        }
        <mat-button-toggle-group [value]="view" (change)="view = $event.value" aria-label="Vista dell'elenco">
          <mat-button-toggle value="stats">Statistiche</mat-button-toggle>
          <mat-button-toggle value="registry">Anagrafica</mat-button-toggle>
        </mat-button-toggle-group>
      </div>

      @if (stats) {
        <div class="cu-cards">
          <div class="cu-card">
            <div class="cu-title">Spesa nel periodo</div>
            <div class="cu-big">{{ eur(stats.summary.spend) }}</div>
            <div class="cu-small" [matTooltip]="changeTooltip()">
              {{ changeText(stats.summary.change) }}
              @if (stats.summary.change !== null && stats.summary.compared_utilities < stats.utilities.length) {
                (su {{ stats.summary.compared_utilities }} utenze confrontabili)
              }
            </div>
            <div class="cu-small">
              Media per utenza attiva: <strong>{{ eur(stats.summary.average_per_active) }}</strong>
              ({{ stats.summary.active_utilities }} attive)
            </div>
          </div>
          @for (t of stats.summary.types; track t.hard_type) {
            <div class="cu-card">
              <div class="cu-title">{{ typeLabel(t) }} · {{ t.utilities }} utenze</div>
              <div class="cu-small">Spesa: <strong>{{ eur(t.spend) }}</strong></div>
              @if (t.unit) {
                <div class="cu-small">Consumo: <strong>{{ formatQty(t.consumption, t.unit) }}</strong></div>
                <div class="cu-small">Costo unitario: <strong>{{ unitCost(t.unit_cost, t.unit) }}</strong></div>
                @if (estimatedFor(t) !== null) {
                  <div class="cu-small cu-muted">Presunto annuo: {{ formatQty(estimatedFor(t), t.unit) }}</div>
                }
              }
            </div>
          }
        </div>
      } @else if (!statsLoading) {
        <p class="cu-muted">Statistiche non disponibili.</p>
      }

      @if (view === 'stats') {
        <app-sheet-groups [groups]="statGroups">
          <ng-template let-rows>
            <table class="sheet-table">
              <thead>
                <tr>
                  <th>Utenza</th><th>Tipo</th><th class="num">Spesa</th><th class="num">Precedente</th>
                  <th class="num">Variazione</th><th class="num">Consumo</th><th class="num">Costo unitario</th><th></th>
                </tr>
              </thead>
              <tbody>
                @for (u of rows; track u.id) {
                  <tr class="row-clickable" [class.cu-out]="u.outliers.length" (click)="openUtility(u.id)">
                    <td>{{ u.utility_code }}</td>
                    <td>{{ u.type_name }}</td>
                    <td class="num">{{ eur(u.spend) }}</td>
                    <td class="num">{{ eur(u.previous_spend) }}</td>
                    <td class="num" [class.cu-flag]="u.outliers.includes('change')"
                        [matTooltip]="u.change === null ? notComparable : ''">
                      {{ u.change === null ? '—' : percent(u.change) }}
                    </td>
                    <td class="num">{{ u.unit ? formatQty(u.consumption, u.unit) : '—' }}</td>
                    <td class="num" [class.cu-flag]="u.outliers.includes('unit_cost')">{{ unitCost(u.unit_cost, u.unit) }}</td>
                    <td>
                      @if (u.outliers.length) {
                        <mat-icon class="cu-warn" [matTooltip]="outlierText(u)" aria-label="Fuori norma">warning</mat-icon>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </ng-template>
        </app-sheet-groups>
      } @else {
        <app-sheet-groups [groups]="groups">
          <ng-template let-rows>
            <app-data-table-utilities
              [data]="rows"
              [loading]="loading"
              (onSave)="save($event)"
              (onCreate)="create($event)"
              (onDelete)="remove($event)"
              (onRestore)="reload()"
              (onRefresh)="reload()">
            </app-data-table-utilities>
          </ng-template>
        </app-sheet-groups>
      }
    </div>
  `,
  styles: [`
    .cu { display: flex; flex-direction: column; gap: 1rem; padding: 1rem 0; }
    .cu-bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .cu-period { width: 180px; }
    .cu-spacer { flex: 1; }
    .cu-muted { color: var(--app-muted); margin: 0; font-size: 0.875rem; }
    .cu-cards { display: flex; gap: 1rem; flex-wrap: wrap; }
    .cu-card { flex: 1 1 240px; border: 1px solid var(--app-border); border-radius: 6px; padding: 0.75rem 1rem; }
    .cu-title { font-weight: 600; margin-bottom: 4px; }
    .cu-big { font-size: 1.4rem; font-weight: 600; }
    .cu-small { font-size: 0.875rem; }
    .num { text-align: right; white-space: nowrap; }
    .sheet-table th.num { text-align: right; }
    .cu-flag { color: var(--tone-warn-fg); font-weight: 600; }
    .cu-out td:first-child { box-shadow: inset 3px 0 0 var(--tone-warn-fg); }
    .cu-warn { color: var(--tone-warn-fg); font-size: 20px; width: 20px; height: 20px; vertical-align: middle; }
    .cu-chip {
      display: inline-flex; align-items: center; gap: 4px; padding: 4px 12px; border-radius: 16px;
      border: 1px solid var(--app-border); background: none; color: inherit; font: inherit; cursor: pointer;
    }
    .cu-chip mat-icon { font-size: 18px; width: 18px; height: 18px; color: var(--tone-warn-fg); }
    .cu-chip--on { background: var(--tone-warn-bg); color: var(--tone-warn-fg); border-color: transparent; }
  `],
})
export class BudgetChapterUtilitiesTabComponent implements OnInit {
  private utilityService = inject(UtilityService);
  private consumptionService = inject(UtilityConsumptionService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  private budget = inject(ChapterBudgetService);
  private navigator = inject(EntityNavigatorService);

  @Input({required: true}) chapterId!: number;

  readonly formatQty = formatQty;
  readonly hardTypeLabel = HardTypeDescription;
  readonly notComparable = NOT_COMPARABLE;

  utilities: Utility[] = [];
  // Attive aperte, cessate (fornitura non attiva) chiuse.
  groups: SheetGroup<Utility>[] = [];
  summary: ChapterConsumptionSummaryRow[] = [];
  loading = false;

  view: 'stats' | 'registry' = 'stats';
  // 'last12' o un anno.
  period = 'last12';
  years: number[] = [new Date().getFullYear()];
  stats: ChapterUtilityStats | null = null;
  statsLoading = false;
  statGroups: SheetGroup<ChapterUtilityStatsRow>[] = [];
  onlyOutliers = false;
  outlierCount = 0;

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading = true;
    this.utilityService.search({budget_chapter_code_fk: this.chapterId, deleted: false}).subscribe({
      next: data => {
        this.utilities = plainToInstance(Utility, data);
        const active = this.utilities.filter(u => u.supply_active !== false);
        const ceased = this.utilities.filter(u => u.supply_active === false);
        this.groups = keepOpen([
          {key: 'active', label: 'Attive', rows: active, open: true},
          {key: 'ceased', label: 'Cessate', rows: ceased, open: false},
        ].filter(g => g.rows.length), this.groups);
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
    this.loadStats();
  }

  setPeriod(period: string): void {
    this.period = period;
    this.loadStats();
  }

  private loadStats(): void {
    this.statsLoading = true;
    this.budget.utilityStats(this.chapterId, this.period).subscribe({
      next: stats => {
        this.stats = stats;
        this.years = stats.years;
        this.outlierCount = stats.utilities.filter(u => u.outliers.length).length;
        if (!this.outlierCount) this.onlyOutliers = false;
        this.statsLoading = false;
        this.buildStatGroups();
      },
      error: err => {
        this.stats = null;
        this.statsLoading = false;
        console.error('Errore caricamento statistiche utenze del capitolo:', err);
      },
    });
  }

  toggleOutliers(): void {
    this.onlyOutliers = !this.onlyOutliers;
    this.buildStatGroups();
  }

  private buildStatGroups(): void {
    const rows = (this.stats?.utilities ?? []).filter(u => !this.onlyOutliers || u.outliers.length);
    const total = (list: ChapterUtilityStatsRow[]) => formatEuro(Math.round(list.reduce((s, u) => s + u.spend, 0) * 100) / 100);
    const active = rows.filter(u => u.active);
    const ceased = rows.filter(u => !u.active);
    this.statGroups = keepOpen([
      {key: 'active', label: 'Attive', rows: active, summary: total(active), open: true},
      {key: 'ceased', label: 'Cessate', rows: ceased, summary: total(ceased), open: false},
    ].filter(g => g.rows.length), this.statGroups);
  }

  openUtility(id: number): void {
    this.navigator.openUtility(id).subscribe(saved => {
      if (saved) this.reload();
    });
  }

  eur(value: number | null | undefined): string {
    return formatEuro(value);
  }

  dateIt(iso: string): string {
    return DateHelper.isoToLocalDate(iso)?.toLocaleDateString('it-IT') ?? '';
  }

  percent(change: number): string {
    const text = Math.abs(change * 100).toLocaleString('it-IT', {maximumFractionDigits: 1});
    return `${change > 0 ? '+' : change < 0 ? '−' : ''}${text}%`;
  }

  changeText(change: number | null): string {
    return change === null ? 'Variazione non calcolabile' : `${this.percent(change)} sul periodo precedente`;
  }

  changeTooltip(): string {
    const p = this.stats?.period;
    return p ? `Periodo precedente: dal ${this.dateIt(p.previous_start)} al ${this.dateIt(p.previous_end)}` : '';
  }

  unitCost(value: number | null, unit: string | null): string {
    if (value === null || !unit) return '—';
    return `${value.toLocaleString('it-IT', {minimumFractionDigits: 2, maximumFractionDigits: 3})} €/${unit}`;
  }

  typeLabel(t: ChapterTypeStats): string {
    return t.hard_type ? this.hardTypeLabel[t.hard_type] : 'Senza tipo';
  }

  estimatedFor(t: ChapterTypeStats): number | null {
    return this.summary.find(s => s.hard_type === t.hard_type)?.estimated_sum ?? null;
  }

  outlierText(u: ChapterUtilityStatsRow): string {
    return u.outliers.map(o => (o === 'unit_cost'
      ? 'Costo unitario oltre il doppio della mediana delle utenze dello stesso tipo nel capitolo'
      : 'Spesa cambiata di oltre il 50% sul periodo precedente')).join(' · ');
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

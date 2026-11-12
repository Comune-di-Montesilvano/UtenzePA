import {ChangeDetectionStrategy, Component, EventEmitter, inject, Input, OnChanges, Output} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatTooltipModule} from '@angular/material/tooltip';
import {keepOpen, SheetGroup, SheetGroupsComponent} from '../../core/components/entity-sheet/sheet-groups.component';
import {EntityNavigatorService} from '../../core/services/entity-navigator.service';
import {ToastService} from '../../core/services/toast.service';
import {formatEuro} from '../budget-chapters/spending/budget-chapter-spending.service';
import {HardType, HardTypeDescription} from '../utility-types/enum/hard-type.enum';
import {
  differenceTone, forecastNotices, ForecastUtilityYear, SOURCE_LABEL, unitLabel, utilitiesOf, yearGroups,
} from './agreement-forecast.helpers';
import type {AgreementForecast, ForecastPrice, ForecastRow} from './agreement-forecast.model';
import {ConsipAgreementService} from './consip-agreement.service';

const CONSUMPTION_UNIT: Record<string, string> = {LIGHT: 'kWh', GAS: 'Smc'};

// Tab «Fabbisogno» della convenzione: quanto resta da fatturare per capitolo
// ed esercizio contro la rimanenza degli impegni. Il calcolo è del backend
// (GET /consip-agreement/:id/forecast); qui si mostra, si ricalcola e si
// imposta il costo unitario a mano. La scheda carica il dato (le serve per il
// badge) e lo passa qui.
@Component({
  selector: 'app-agreement-forecast-tab',
  standalone: true,
  imports: [
    SheetGroupsComponent, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatTooltipModule,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="fc">
      @if (!forecast) {
        <div class="fc-bar">
          <p class="fc-muted">{{ loading || busy ? 'Calcolo in corso…' : 'Fabbisogno non disponibile.' }}</p>
          @if (!loading && !busy) {
            <button mat-stroked-button type="button" (click)="recompute()">
              <mat-icon>refresh</mat-icon> Ricalcola
            </button>
          }
        </div>
      } @else {
        <div class="fc-bar">
          <span class="fc-muted">Ultimo calcolo: {{ computedAt }}</span>
          @if (horizon) {
            <span class="fc-muted">Periodo degli ordini: {{ horizon }}</span>
          }
          <span class="fc-spacer"></span>
          @if (forecast.rows.length) {
            <button mat-stroked-button type="button" (click)="exportCsv()">
              <mat-icon>download</mat-icon> Esporta
            </button>
          }
          <button mat-stroked-button type="button" [disabled]="busy" (click)="recompute()">
            <mat-icon>refresh</mat-icon> Ricalcola
          </button>
        </div>

        @if (forecast.prices.length) {
          <div class="fc-cards">
            @for (p of forecast.prices; track p.hard_type) {
              <div class="fc-card">
                <div class="fc-title">Costo unitario · {{ typeLabel(p.hard_type) }}</div>
                <div class="fc-small">Proposto: <strong>{{ price(p.proposed, p.hard_type) }}</strong></div>
                @if (canEdit) {
                  <div class="fc-price">
                    <mat-form-field appearance="outline" subscriptSizing="dynamic" class="fc-price-field">
                      <mat-label>A mano</mat-label>
                      <input matInput type="number" min="0" step="0.0001" [value]="p.manual ?? ''" [disabled]="busy"
                             [attr.aria-label]="'Costo unitario a mano ' + typeLabel(p.hard_type)"
                             (change)="setPrice(p, $any($event.target))">
                      <span matTextSuffix>{{ unit(p.hard_type) }}</span>
                    </mat-form-field>
                    @if (p.manual !== null) {
                      <button mat-button type="button" [disabled]="busy" (click)="resetPrice(p)">Torna al proposto</button>
                    }
                  </div>
                } @else if (p.manual !== null) {
                  <div class="fc-small">A mano: <strong>{{ price(p.manual, p.hard_type) }}</strong></div>
                }
                <div class="fc-small fc-muted">Andamento dei consumi sull'anno prima: {{ trend(p.trend) }}</div>
              </div>
            }
          </div>
        }

        @if (notices.length) {
          <div class="fc-notices" role="note">
            <mat-icon>info</mat-icon>
            <ul>
              @for (n of notices; track n) {
                <li>{{ n }}</li>
              }
            </ul>
          </div>
        }

        @if (!forecast.rows.length) {
          <p class="fc-muted">Nessuna utenza di luce o gas sugli ordini di questa convenzione.</p>
        }

        <app-sheet-groups [groups]="groups">
          <ng-template let-rows let-group="group">
            <table class="sheet-table">
              <thead>
                <tr>
                  <th>Capitolo</th><th class="num">Utenze</th><th class="num">Fatturato</th>
                  <th class="num">Previsto da fatturare</th><th class="num">Totale previsto</th>
                  <th class="num">Impegnato</th><th class="num" matTooltip="Impegnato meno le quote già spese">Rimanenza</th>
                  <th class="num">Differenza</th><th class="num">Copertura</th>
                </tr>
              </thead>
              <tbody>
                @for (r of rows; track r.chapter_id) {
                  <tr class="row-clickable" tabindex="0" [attr.aria-expanded]="isOpen(r)"
                      (click)="toggle(r)" (keydown.enter)="toggle(r)" (keydown.space)="$event.preventDefault(); toggle(r)">
                    <td>
                      <mat-icon class="fc-caret">{{ isOpen(r) ? 'expand_more' : 'chevron_right' }}</mat-icon>
                      {{ chapterLabel(r.chapter_id) }}
                    </td>
                    <td class="num">{{ r.utilities }}</td>
                    <td class="num">{{ eur(r.invoiced) }}</td>
                    <td class="num">{{ eur(r.to_invoice) }}</td>
                    <td class="num">{{ eur(r.total) }}</td>
                    <td class="num">{{ eur(r.committed) }}</td>
                    <td class="num">{{ eur(r.remaining) }}</td>
                    <td class="num" [class.fc-danger]="tone(r) === 'danger'" [class.fc-warning]="tone(r) === 'warning'"
                        [matTooltip]="differenceTooltip(r)">
                      {{ eur(r.difference) }}
                    </td>
                    <td class="num">{{ percent(r.coverage) }}</td>
                  </tr>
                  @if (isOpen(r)) {
                    <tr class="fc-detail">
                      <td colspan="9">
                        <table class="sheet-table fc-inner">
                          <thead>
                            <tr>
                              <th>Codice</th><th class="num">Consumo atteso</th><th class="num">Fatturato</th>
                              <th class="num">Costo previsto</th><th>Origine della stima</th><th></th>
                            </tr>
                          </thead>
                          <tbody>
                            @for (u of detail(r); track u.id) {
                              <tr class="row-clickable" tabindex="0" (click)="openUtility(u.id)" (keydown.enter)="openUtility(u.id)"
                                  (keydown.space)="$event.preventDefault(); openUtility(u.id)">
                                <td>{{ u.utility_code || 'Utenza id ' + u.id }}</td>
                                <td class="num">{{ consumption(u) }}</td>
                                <td class="num">{{ eur(u.invoiced) }}</td>
                                <td class="num">{{ eur(u.to_invoice) }}</td>
                                <td>{{ sourceLabel[u.source] }}</td>
                                <td>
                                  @if (u.from_draft) {
                                    <span class="fc-draft">Bozza</span>
                                  }
                                </td>
                              </tr>
                            }
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  }
                }
              </tbody>
              @if (totalsOf(group.key); as t) {
                <tfoot>
                  <tr class="fc-totals">
                    <td>Totale {{ t.year }}</td>
                    <td class="num">{{ t.utilities }}</td>
                    <td class="num">{{ eur(t.invoiced) }}</td>
                    <td class="num">{{ eur(t.to_invoice) }}</td>
                    <td class="num">{{ eur(t.total) }}</td>
                    <td class="num">{{ eur(t.committed) }}</td>
                    <td class="num">{{ eur(t.remaining) }}</td>
                    <td class="num">{{ eur(t.difference) }}</td>
                    <td class="num">{{ percent(t.coverage) }}</td>
                  </tr>
                </tfoot>
              }
            </table>
          </ng-template>
        </app-sheet-groups>
      }
    </div>
  `,
  styles: [`
    .fc { display: flex; flex-direction: column; gap: 1rem; padding: 1rem 0; }
    .fc-bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .fc-spacer { flex: 1; }
    .fc-muted { color: var(--app-muted); margin: 0; font-size: 0.875rem; }
    .fc-cards { display: flex; gap: 1rem; flex-wrap: wrap; }
    .fc-card { flex: 1 1 280px; border: 1px solid var(--app-border); border-radius: 6px; padding: 0.75rem 1rem; display: flex; flex-direction: column; gap: 6px; }
    .fc-title { font-weight: 600; }
    .fc-small { font-size: 0.875rem; }
    .fc-price { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .fc-price-field { width: 190px; }
    .fc-notices { display: flex; gap: 8px; padding: 8px 12px; border-radius: 6px; background: var(--tone-warn-bg); color: var(--tone-warn-fg); font-size: 0.875rem; }
    .fc-notices ul { margin: 0; padding-left: 18px; }
    .num { text-align: right; white-space: nowrap; }
    .sheet-table th.num { text-align: right; }
    .fc-caret { font-size: 18px; width: 18px; height: 18px; vertical-align: text-bottom; }
    .fc-danger { color: var(--tone-danger-fg); font-weight: 600; }
    .fc-warning { color: var(--tone-warn-fg); font-weight: 600; }
    .fc-detail > td { padding: 0 0 8px 28px; background: var(--app-surface-2); }
    .fc-inner { font-size: 0.8125rem; }
    .fc-totals td { font-weight: 600; border-bottom: 0; }
    .fc-draft { font-size: 0.75rem; padding: 1px 8px; border-radius: 10px; background: var(--tone-warn-bg); color: var(--tone-warn-fg); }
  `],
})
export class AgreementForecastTabComponent implements OnChanges {
  private service = inject(ConsipAgreementService);
  private navigator = inject(EntityNavigatorService);
  private toast = inject(ToastService);

  @Input({required: true}) agreementId!: number;
  @Input() forecast: AgreementForecast | null = null;
  @Input() loading = false;
  @Input() canEdit = false;
  // Fabbisogno ricalcolato da qui: la scheda aggiorna il badge.
  @Output() forecastChange = new EventEmitter<AgreementForecast>();

  readonly sourceLabel = SOURCE_LABEL;
  readonly eur = formatEuro;
  readonly tone = differenceTone;

  busy = false;
  // Campi cache, ricostruiti a ogni nuovo fabbisogno.
  groups: SheetGroup<ForecastRow>[] = [];
  notices: string[] = [];
  computedAt = '';
  horizon = '';
  private totals = new Map<string, ForecastRow>();
  private chapters = new Map<number, string>();
  private open = new Map<string, ForecastUtilityYear[]>();
  // Fabbisogno già disegnato: la scheda ripassa quello appena ricalcolato
  // da qui, che non va ricostruito una seconda volta.
  private built: AgreementForecast | null | undefined;

  ngOnChanges(): void {
    if (this.forecast !== this.built) this.rebuild();
  }

  private rebuild(): void {
    const f = this.forecast;
    this.built = f;
    this.totals.clear();
    if (!f) {
      this.open.clear();
      this.groups = [];
      this.notices = [];
      return;
    }
    // I dettagli aperti restano aperti, con le utenze del nuovo calcolo.
    for (const key of [...this.open.keys()]) {
      const [year, chapter] = key.split(':');
      const chapterId = chapter === 'null' ? null : Number(chapter);
      if (f.rows.some(r => r.year === Number(year) && r.chapter_id === chapterId)) {
        this.open.set(key, utilitiesOf(f.utilities, chapterId, Number(year)));
      } else {
        this.open.delete(key);
      }
    }
    this.chapters = new Map(f.chapters.map(c => [c.id, c.label]));
    this.computedAt = new Date(f.computed_at).toLocaleString('it-IT', {dateStyle: 'short', timeStyle: 'short'});
    this.horizon = f.horizon ? `${this.dateIt(f.horizon.start)} – ${this.dateIt(f.horizon.end)}` : '';
    const years = yearGroups(f.rows, new Date().getFullYear());
    years.forEach(y => this.totals.set(String(y.year), y.totals));
    this.groups = keepOpen(years.map(y => ({
      key: String(y.year),
      label: String(y.year),
      rows: y.rows,
      summary: y.totals.shortfall !== null ? `Mancano ${formatEuro(y.totals.shortfall)}` : undefined,
      open: y.open,
    })), this.groups);
    this.notices = forecastNotices(f);
  }

  private dateIt(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('it-IT');
  }

  private key(r: ForecastRow): string {
    return `${r.year}:${r.chapter_id}`;
  }

  isOpen(r: ForecastRow): boolean {
    return this.open.has(this.key(r));
  }

  detail(r: ForecastRow): ForecastUtilityYear[] {
    return this.open.get(this.key(r)) ?? [];
  }

  toggle(r: ForecastRow): void {
    const key = this.key(r);
    if (this.open.has(key)) this.open.delete(key);
    else this.open.set(key, utilitiesOf(this.forecast?.utilities ?? [], r.chapter_id, r.year));
  }

  totalsOf(key: string): ForecastRow | null {
    return this.totals.get(key) ?? null;
  }

  chapterLabel(id: number | null): string {
    return id === null ? 'Senza capitolo' : this.chapters.get(id) ?? `Capitolo id ${id}`;
  }

  typeLabel(hardType: string): string {
    return HardTypeDescription[hardType as HardType] ?? hardType;
  }

  unit(hardType: string): string {
    return unitLabel(hardType);
  }

  price(value: number | null, hardType: string): string {
    if (value === null) return 'non calcolabile';
    return `${value.toLocaleString('it-IT', {minimumFractionDigits: 4, maximumFractionDigits: 4})} ${unitLabel(hardType)}`;
  }

  trend(value: number): string {
    const pct = Math.round((value - 1) * 100);
    return `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct)} %`;
  }

  percent(value: number): string {
    return `${Math.round(value * 100)} %`;
  }

  consumption(u: ForecastUtilityYear): string {
    if (u.expected_consumption === null) return '—';
    const unit = CONSUMPTION_UNIT[u.hard_type ?? ''] ?? '';
    return `${u.expected_consumption.toLocaleString('it-IT', {maximumFractionDigits: 0})} ${unit}`.trim();
  }

  differenceTooltip(r: ForecastRow): string {
    if (r.alert === 'short') return `Impegni insufficienti: mancano ${formatEuro(r.shortfall)}`;
    if (r.alert === 'insufficient_data') return "Dati insufficienti per l'avviso: copertura sotto il 60 %";
    return 'Rimanenza meno previsto da fatturare';
  }

  recompute(): void {
    this.run(this.service.forecast(this.agreementId), 'Fabbisogno non calcolato');
  }

  setPrice(p: ForecastPrice, input: HTMLInputElement): void {
    const raw = input.value;
    const value = raw === '' ? null : Number(raw);
    if (value !== null && (!Number.isFinite(value) || value <= 0 || value > 999999)) {
      this.toast.add({severity: 'warn', summary: 'Costo unitario non valido', detail: 'Inserisci un numero maggiore di zero e fino a 999999.'});
      input.value = p.manual === null ? '' : String(p.manual);
      return;
    }
    if (value === p.manual) return;
    this.run(this.service.setForecastPrice(this.agreementId, p.hard_type, value), 'Costo unitario non salvato');
  }

  resetPrice(p: ForecastPrice): void {
    this.run(this.service.setForecastPrice(this.agreementId, p.hard_type, null), 'Costo unitario non salvato');
  }

  private run(call: ReturnType<ConsipAgreementService['forecast']>, failure: string): void {
    this.busy = true;
    call.subscribe({
      next: f => {
        this.busy = false;
        this.forecast = f;
        this.rebuild();
        this.forecastChange.emit(f);
      },
      error: err => {
        this.busy = false;
        const message = err?.error?.message;
        this.toast.add({severity: 'error', summary: failure, detail: Array.isArray(message) ? message.join(' ') : (message ?? '')});
      },
    });
  }

  openUtility(id: number): void {
    this.navigator.openUtility(id).subscribe(saved => {
      if (saved) this.recompute();
    });
  }

  exportCsv(): void {
    const f = this.forecast;
    if (!f) return;
    const n = (v: number): string => v.toLocaleString('it-IT', {minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false});
    const header = ['Esercizio', 'Capitolo', 'Utenze', 'Fatturato', 'Previsto da fatturare', 'Totale previsto', 'Impegnato', 'Rimanenza', 'Differenza', 'Copertura'];
    const rows = [...f.rows].sort((a, b) => b.year - a.year).map(r => [
      r.year, this.chapterLabel(r.chapter_id), r.utilities, n(r.invoiced), n(r.to_invoice), n(r.total), n(r.committed),
      n(r.remaining), n(r.difference), this.percent(r.coverage),
    ]);
    const csv = '﻿' + [header, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8;'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = `fabbisogno_convenzione_${this.agreementId}_${new Date().toLocaleDateString('sv-SE')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
}

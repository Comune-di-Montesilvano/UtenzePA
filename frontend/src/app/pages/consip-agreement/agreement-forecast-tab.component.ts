import {ChangeDetectionStrategy, Component, EventEmitter, inject, Input, OnChanges, Output} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatTooltipModule} from '@angular/material/tooltip';
import {toIsoDate} from '../../core/helpers/date.helper';
import {downloadXlsx, XlsxCell} from '../../core/helpers/xlsx.helper';
import {EntityNavigatorService} from '../../core/services/entity-navigator.service';
import {ToastService} from '../../core/services/toast.service';
import {formatEuro} from '../budget-chapters/spending/budget-chapter-spending.service';
import {HardType, HardTypeDescription} from '../utility-types/enum/hard-type.enum';
import {
  chapterLabelOf, forecastNotices, MovePlan, RequestPlan, RequestRow, RequestUtility, requestPlan, requestUtilities,
  simulateMoves, SOURCE_LABEL, unitLabel,
} from './agreement-forecast.helpers';
import type {AgreementForecast, ForecastPrice, ForecastRow} from './agreement-forecast.model';
import {ConsipAgreementService} from './consip-agreement.service';

// Tab «Fabbisogno» della convenzione: quanti soldi chiedere alla ragioneria
// per un esercizio, capitolo per capitolo. Per ogni capitolo la spesa
// dell'anno prima (fatture arrivate + stima fino a fine anno), quanto servirà
// nell'esercizio (stima dell'anno intero, come se la fornitura continuasse
// anche dopo la scadenza degli ordini) e la differenza con lo stanziamento;
// sotto, la simulazione degli spostamenti tra capitoli e il fabbisogno extra.
// Il calcolo è del backend (GET /consip-agreement/:id/forecast); qui si
// mostra, si ricalcola, si imposta il costo unitario a mano e si esporta in
// Excel. La scheda carica il dato (le serve per il badge) e lo passa qui.
@Component({
  selector: 'app-agreement-forecast-tab',
  standalone: true,
  imports: [
    MatButtonModule, MatButtonToggleModule, MatCheckboxModule, MatFormFieldModule, MatIconModule, MatInputModule,
    MatTooltipModule,
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
          @if (billedUntil) {
            <span class="fc-muted">Fatture arrivate fino al {{ billedUntil }}</span>
          }
          @if (horizon) {
            <span class="fc-muted">Periodo degli ordini: {{ horizon }}</span>
          }
          <span class="fc-spacer"></span>
          @if (plan) {
            <button mat-stroked-button type="button" (click)="exportXlsx()">
              <mat-icon>download</mat-icon> Esporta Excel
            </button>
          }
          <button mat-stroked-button type="button" [disabled]="busy" (click)="recompute()">
            <mat-icon>refresh</mat-icon> Ricalcola
          </button>
        </div>

        @if (!plan) {
          <div class="fc-empty">
            <mat-icon>event_available</mat-icon>
            <div>
              <strong>Nessuna fornitura da pagare dall'esercizio in corso in poi.</strong>
              @if (ordersRunning) {
                <div class="fc-muted">
                  Gli ordini sono in corso, ma le loro fatture non hanno righe per utenza (canoni o servizi): il fabbisogno
                  non si può stimare dalle utenze.
                </div>
              } @else {
                <div class="fc-muted">Gli ordini della convenzione sono chiusi o scaduti: non serve chiedere altro.</div>
              }
            </div>
          </div>
        } @else {
          <div class="fc-bar">
            <mat-button-toggle-group [value]="year" (change)="setYear($event.value)" aria-label="Esercizio della richiesta"
                                     hideSingleSelectionIndicator>
              @for (y of years; track y) {
                <mat-button-toggle [value]="y">Richiesta per il {{ y }}</mat-button-toggle>
              }
            </mat-button-toggle-group>
          </div>

          <p class="fc-intro">
            Lo stanziamento è del capitolo: il fabbisogno comprende le utenze di tutte le convenzioni in corso sul capitolo,
            ognuna una volta sola. Per ogni capitolo: quanto si spende nel {{ plan.year - 1 }} (fatture arrivate più la stima fino al 31 dicembre),
            quanto servirà nel {{ plan.year }} (stima dell'anno intero, anche dopo la scadenza degli ordini, come se la
            fornitura continuasse) e la <strong>differenza con lo stanziamento</strong>: quanto aggiungere o quanto avanza.
          </p>

          <div class="fc-outcome" [class.fc-outcome--short]="plan.totals.increase > 0">
            <mat-icon>{{ plan.totals.increase > 0 ? 'warning' : 'check_circle' }}</mat-icon>
            <div>
              <strong>
                Per il {{ plan.year }} servono {{ eur(plan.totals.need) }}, stanziati {{ eur(plan.totals.budget) }}
              </strong>
              <div class="fc-sub">
                @if (plan.totals.increase > 0) {
                  Da aggiungere {{ eur(plan.totals.increase) }} su {{ chapters(plan.totals.increase_chapters) }}.
                }
                @if (plan.totals.decrease > 0) {
                  Avanzano {{ eur(plan.totals.decrease) }} su {{ chapters(plan.totals.decrease_chapters) }}.
                }
                @if (plan.totals.increase > 0) {
                  Dopo gli spostamenti: fabbisogno extra {{ eur(moves.extra) }}.
                }
                @if (plan.totals.without_budget) {
                  {{ chapters(plan.totals.without_budget) }} senza stanziamento {{ plan.year }} caricato: caricalo nella scheda del capitolo.
                }
              </div>
            </div>
          </div>

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

          <table class="sheet-table">
            <thead>
              <tr>
                <th>Capitolo</th>
                <th class="num" matTooltip="Assestato, altrimenti iniziale">Stanziato {{ plan.year - 1 }}</th>
                <th class="num" matTooltip="Fatture arrivate più la stima dei giorni non ancora fatturati">Spesa {{ plan.year - 1 }}</th>
                <th class="num" matTooltip="Assestato, altrimenti iniziale">Stanziato {{ plan.year }}</th>
                <th class="num" matTooltip="Stima dell'anno intero">Serve nel {{ plan.year }}</th>
                <th class="num" matTooltip="Serve meno stanziato: + da aggiungere, − avanza">Differenza</th>
              </tr>
            </thead>
            <tbody>
              @for (r of plan.rows; track r.chapter_id) {
                <tr class="row-clickable" tabindex="0" [attr.aria-expanded]="isOpen(r)"
                    (click)="toggle(r)" (keydown.enter)="toggle(r)" (keydown.space)="$event.preventDefault(); toggle(r)">
                  <td>
                    <mat-icon class="fc-caret">{{ isOpen(r) ? 'expand_more' : 'chevron_right' }}</mat-icon>
                    {{ chapterLabel(r.chapter_id) }}
                    @if (r.uncertain) {
                      <span class="fc-chip" matTooltip="Meno del 60 % della stima viene da fatture, consumi o presunto annuo">stima incerta</span>
                    }
                    @if (r.agreements.length) {
                      <span class="fc-chip fc-chip--info" [matTooltip]="'Comprende anche: ' + r.agreements.join('; ')">
                        + {{ r.agreements.length === 1 ? '1 altra convenzione' : r.agreements.length + ' altre convenzioni' }}
                      </span>
                    }
                    @if (r.other_utilities) {
                      <span class="fc-chip" [matTooltip]="'Il capitolo paga anche ' + r.other_utilities + ' utenze attive fuori da questa convenzione: non sono nel calcolo'">
                        + {{ r.other_utilities }} utenze fuori convenzione
                      </span>
                    }
                  </td>
                  <td class="num">{{ r.base_budget === null ? '—' : eur(r.base_budget) }}</td>
                  <td class="num">{{ eur(r.base_total) }}</td>
                  <td class="num">
                    @if (r.budget === null) { <span class="fc-chip">non caricato</span> } @else { {{ eur(r.budget) }} }
                  </td>
                  <td class="num"><strong>{{ eur(r.need) }}</strong></td>
                  <td class="num">
                    @if (r.request === null) {
                      <span class="fc-muted">—</span>
                    } @else if (r.request > 0) {
                      <strong class="fc-danger">+{{ eur(r.request) }}</strong>
                    } @else if (r.request < 0) {
                      <span class="fc-ok">−{{ eur(-r.request) }}</span>
                    } @else {
                      <span class="fc-muted">—</span>
                    }
                  </td>
                </tr>
                @if (isOpen(r)) {
                  <tr class="fc-detail">
                    <td colspan="6">
                      <div class="fc-facts">
                        <span>Spesa {{ plan.year - 1 }}: fatture arrivate <strong>{{ eur(r.base_billed) }}</strong></span>
                        <span>stima del non ancora fatturato <strong>{{ eur(r.base_expected) }}</strong></span>
                        <span>Utenze del capitolo <strong>{{ r.utilities }}</strong></span>
                        @if (r.agreements.length) {
                          <span>di cui questa convenzione <strong>{{ eur(r.own) }}</strong> ({{ r.own_utilities }} utenze),
                            altre convenzioni <strong>{{ eur(r.need - r.own) }}</strong>: {{ r.agreements.join('; ') }}</span>
                        }
                      </div>
                      @if (commitments.get(r.chapter_id); as c) {
                        <div class="fc-facts">
                          <span>Impegni di questa convenzione nel {{ plan.year }}: impegnato <strong>{{ eur(c.committed) }}</strong></span>
                          <span>rimanenza <strong>{{ eur(c.remaining) }}</strong></span>
                          <span>da fatturare fino alla fine degli ordini <strong>{{ eur(c.to_invoice) }}</strong></span>
                          @if (c.difference < 0) {
                            <span class="fc-danger">da impegnare <strong>{{ eur(-c.difference) }}</strong></span>
                          }
                        </div>
                      }
                      @if (r.agreements.length) {
                        <div class="fc-title fc-small">Utenze di questa convenzione</div>
                      }
                      @if (detail(r).length) {
                        <table class="sheet-table fc-inner">
                          <thead>
                            <tr>
                              <th>Codice</th><th class="num">Fatture {{ plan.year - 1 }}</th><th class="num">Stima {{ plan.year - 1 }}</th>
                              <th class="num">Serve nel {{ plan.year }}</th><th>Origine della stima</th><th></th>
                            </tr>
                          </thead>
                          <tbody>
                            @for (u of detail(r); track u.id) {
                              <tr class="row-clickable" tabindex="0" (click)="openUtility(u.id)" (keydown.enter)="openUtility(u.id)"
                                  (keydown.space)="$event.preventDefault(); openUtility(u.id)">
                                <td>{{ u.utility_code || 'Utenza id ' + u.id }}</td>
                                <td class="num">{{ eur(u.base_billed) }}</td>
                                <td class="num">{{ eur(u.base_expected) }}</td>
                                <td class="num">{{ eur(u.need) }}</td>
                                <td>{{ sourceLabel[u.source] }}</td>
                                <td>
                                  @if (u.from_draft) {
                                    <span class="fc-chip">Bozza</span>
                                  }
                                </td>
                              </tr>
                            }
                          </tbody>
                        </table>
                      } @else {
                        <p class="fc-muted">Nessuna utenza della convenzione su questo capitolo.</p>
                      }
                    </td>
                  </tr>
                }
              }
            </tbody>
            <tfoot>
              <tr class="fc-totals">
                <td>Totale</td>
                <td class="num">{{ eur(plan.totals.base_budget) }}</td>
                <td class="num">{{ eur(plan.totals.base_total) }}</td>
                <td class="num">{{ eur(plan.totals.budget) }}</td>
                <td class="num">{{ eur(plan.totals.need) }}</td>
                <td class="num">{{ signed(plan.totals.need - plan.totals.budget) }}</td>
              </tr>
            </tfoot>
          </table>

          <section class="fc-sim" aria-label="Simulazione degli spostamenti">
            <h3>Simulazione degli spostamenti tra capitoli</h3>
            @if (!plan.totals.increase) {
              <p class="fc-muted">Nessun capitolo da integrare: non serve spostare nulla.</p>
            } @else {
              <p class="fc-muted">
                L'avanzo dei capitoli selezionati copre i capitoli da integrare, dal più grande. Togli la spunta ai capitoli
                il cui avanzo serve ad altro (per esempio a utenze fuori convenzione).
              </p>
              <div class="fc-sim-grid">
                <div>
                  <div class="fc-title">Da dove togliere</div>
                  @if (!donors.length) {
                    <p class="fc-muted">Nessun capitolo con avanzo.</p>
                  }
                  @for (r of donors; track r.chapter_id) {
                    <div class="fc-sim-row">
                      <mat-checkbox [checked]="!excluded.has(r.chapter_id)" (change)="setDonor(r.chapter_id, $event.checked)">
                        {{ chapterLabel(r.chapter_id) }}
                      </mat-checkbox>
                      <span class="num">avanza {{ eur(-(r.request ?? 0)) }} · tolti <strong>{{ eur(moves.taken.get(r.chapter_id) ?? 0) }}</strong></span>
                    </div>
                  }
                </div>
                <div>
                  <div class="fc-title">Dove mettere</div>
                  @for (r of takers; track r.chapter_id) {
                    <div class="fc-sim-row">
                      <span>{{ chapterLabel(r.chapter_id) }}</span>
                      <span class="num">
                        servono {{ eur(r.request ?? 0) }} · coperti <strong>{{ eur(moves.given.get(r.chapter_id) ?? 0) }}</strong>
                        @if ((r.request ?? 0) - (moves.given.get(r.chapter_id) ?? 0) > 0.004) {
                          · <span class="fc-danger">extra {{ eur((r.request ?? 0) - (moves.given.get(r.chapter_id) ?? 0)) }}</span>
                        }
                      </span>
                    </div>
                  }
                </div>
              </div>
              @if (moves.moves.length) {
                <table class="sheet-table fc-inner">
                  <thead><tr><th>Da</th><th>A</th><th class="num">Importo</th></tr></thead>
                  <tbody>
                    @for (m of moves.moves; track $index) {
                      <tr><td>{{ chapterLabel(m.from) }}</td><td>{{ chapterLabel(m.to) }}</td><td class="num">{{ eur(m.amount) }}</td></tr>
                    }
                  </tbody>
                </table>
              }
              <div class="fc-sim-total" [class.fc-outcome--short]="moves.extra > 0">
                <span>Da aggiungere <strong>{{ eur(plan.totals.increase) }}</strong></span>
                <span>coperti con spostamenti <strong>{{ eur(plan.totals.increase - moves.extra) }}</strong></span>
                <span>fabbisogno extra da finanziare <strong>{{ eur(moves.extra) }}</strong></span>
                <span>avanzo che resta <strong>{{ eur(moves.leftover) }}</strong></span>
              </div>
            }
          </section>

          @if (forecast.prices.length) {
            <div class="fc-cards">
              @for (p of forecast.prices; track p.hard_type) {
                <div class="fc-card">
                  <div class="fc-title">Costo unitario usato per la stima · {{ typeLabel(p.hard_type) }}</div>
                  <div class="fc-small">Proposto dalle fatture degli ultimi tre mesi: <strong>{{ price(p.proposed, p.hard_type) }}</strong></div>
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
        }
      }
    </div>
  `,
  styles: [`
    .fc { display: flex; flex-direction: column; gap: 1rem; padding: 1rem 0; }
    .fc-bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .fc-spacer { flex: 1; }
    .fc-muted { color: var(--app-muted); margin: 0; font-size: 0.875rem; }
    .fc-intro { margin: 0; font-size: 0.875rem; }
    .fc-empty { display: flex; gap: 10px; align-items: flex-start; padding: 12px; border: 1px solid var(--app-border); border-radius: 6px; }
    .fc-outcome { display: flex; align-items: flex-start; gap: 8px; padding: 8px 12px; border-radius: 6px;
      background: var(--tone-ok-bg); color: var(--tone-ok-fg); }
    .fc-outcome--short { background: var(--tone-danger-bg); color: var(--tone-danger-fg); }
    .fc-sub { font-size: 0.875rem; opacity: 0.9; margin-top: 2px; }
    .fc-cards { display: flex; gap: 1rem; flex-wrap: wrap; }
    .fc-card { flex: 1 1 280px; border: 1px solid var(--app-border); border-radius: 6px; padding: 0.75rem 1rem; display: flex; flex-direction: column; gap: 6px; }
    .fc-title { font-weight: 600; margin-bottom: 4px; }
    .fc-small { font-size: 0.875rem; }
    .fc-price { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .fc-price-field { width: 190px; }
    .fc-notices { display: flex; gap: 8px; padding: 8px 12px; border-radius: 6px; background: var(--tone-warn-bg); color: var(--tone-warn-fg); font-size: 0.875rem; }
    .fc-notices ul { margin: 0; padding-left: 18px; }
    .num { text-align: right; white-space: nowrap; }
    .sheet-table th.num { text-align: right; }
    .fc-caret { font-size: 18px; width: 18px; height: 18px; vertical-align: text-bottom; }
    .fc-danger { color: var(--tone-danger-fg); }
    .fc-ok { color: var(--tone-ok-fg); }
    .fc-chip--info { background: var(--tone-info-bg); color: var(--tone-info-fg); }
    .fc-chip { font-size: 0.75rem; padding: 1px 8px; border-radius: 10px; background: var(--tone-warn-bg); color: var(--tone-warn-fg); margin-left: 6px; white-space: nowrap; }
    .fc-detail > td { padding: 8px 0 8px 28px; background: var(--app-surface-2); }
    .fc-facts { display: flex; gap: 1.25rem; flex-wrap: wrap; font-size: 0.8125rem; margin-bottom: 8px; }
    .fc-inner { font-size: 0.8125rem; }
    .fc-totals td { font-weight: 600; border-bottom: 0; }
    .fc-sim { display: flex; flex-direction: column; gap: 10px; border: 1px solid var(--app-border); border-radius: 6px; padding: 12px; }
    .fc-sim h3 { margin: 0; font-size: 1rem; }
    .fc-sim-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 16px; }
    .fc-sim-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: 0.875rem; padding: 2px 0; }
    .fc-sim-total { display: flex; gap: 1.25rem; flex-wrap: wrap; padding: 8px 12px; border-radius: 6px; font-size: 0.875rem;
      background: var(--tone-ok-bg); color: var(--tone-ok-fg); }
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

  busy = false;
  // Esercizi per cui si può fare la richiesta: in corso e successivo (di
  // partenza il successivo, quello da chiedere alla ragioneria).
  years: number[] = [];
  year = new Date().getFullYear() + 1;
  // Capitoli con avanzo da non usare negli spostamenti.
  excluded = new Set<number | null>();
  // Campi cache, ricostruiti a ogni nuovo fabbisogno, esercizio o spunta.
  plan: RequestPlan | null = null;
  moves: MovePlan = {moves: [], taken: new Map(), given: new Map(), extra: 0, leftover: 0};
  donors: RequestRow[] = [];
  takers: RequestRow[] = [];
  notices: string[] = [];
  computedAt = '';
  horizon = '';
  billedUntil = '';
  // Ordini con date che arrivano almeno a oggi.
  ordersRunning = false;
  // Impegni della convenzione sull'esercizio scelto, per capitolo.
  commitments = new Map<number | null, ForecastRow>();
  private open = new Map<number | null, RequestUtility[]>();
  // Fabbisogno già disegnato: la scheda ripassa quello appena ricalcolato
  // da qui, che non va ricostruito una seconda volta.
  private built: AgreementForecast | null | undefined;

  ngOnChanges(): void {
    if (this.forecast !== this.built) this.rebuild();
  }

  setYear(year: number): void {
    this.year = year;
    this.excluded.clear();
    this.rebuild();
  }

  setDonor(chapterId: number | null, use: boolean): void {
    if (use) this.excluded.delete(chapterId);
    else this.excluded.add(chapterId);
    this.simulate();
  }

  private rebuild(): void {
    const f = this.forecast;
    this.built = f;
    if (!f) {
      this.open.clear();
      this.plan = null;
      this.notices = [];
      return;
    }
    const currentYear = new Date().getFullYear();
    this.years = [currentYear, currentYear + 1].filter(y => f.annual.some(a => a.year === y));
    if (!this.years.includes(this.year)) this.year = this.years[this.years.length - 1] ?? currentYear + 1;
    this.computedAt = new Date(f.computed_at).toLocaleString('it-IT', {dateStyle: 'short', timeStyle: 'short'});
    this.horizon = f.horizon ? `${this.dateIt(f.horizon.start)} – ${this.dateIt(f.horizon.end)}` : '';
    this.billedUntil = f.billed_until ? this.dateIt(f.billed_until) : '';
    this.ordersRunning = !!f.horizon && f.horizon.end >= toIsoDate(new Date());
    this.plan = this.years.length ? requestPlan(f, this.year) : null;
    this.commitments = new Map(f.rows.filter(r => r.year === this.year).map(r => [r.chapter_id, r]));
    // I dettagli aperti restano aperti, con le utenze del nuovo calcolo.
    for (const chapter of [...this.open.keys()]) {
      if (this.plan?.rows.some(r => r.chapter_id === chapter)) this.open.set(chapter, requestUtilities(f.utilities, chapter, this.year));
      else this.open.delete(chapter);
    }
    this.notices = forecastNotices(f, currentYear);
    this.simulate();
  }

  private simulate(): void {
    const rows = this.plan?.rows ?? [];
    this.donors = rows.filter(r => (r.request ?? 0) < 0);
    this.takers = rows.filter(r => (r.request ?? 0) > 0);
    this.moves = simulateMoves(rows, this.excluded);
  }

  private dateIt(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('it-IT');
  }

  chapters(n: number): string {
    return n === 1 ? '1 capitolo' : `${n} capitoli`;
  }

  signed(value: number): string {
    const v = Math.round(value * 100) / 100;
    if (v === 0) return formatEuro(0);
    return `${v > 0 ? '+' : '−'}${formatEuro(Math.abs(v))}`;
  }

  isOpen(r: RequestRow): boolean {
    return this.open.has(r.chapter_id);
  }

  detail(r: RequestRow): RequestUtility[] {
    return this.open.get(r.chapter_id) ?? [];
  }

  toggle(r: RequestRow): void {
    if (this.open.has(r.chapter_id)) this.open.delete(r.chapter_id);
    else this.open.set(r.chapter_id, requestUtilities(this.forecast?.utilities ?? [], r.chapter_id, this.year));
  }

  chapterLabel(id: number | null): string {
    return this.forecast ? chapterLabelOf(this.forecast, id) : '';
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

  // Excel con tre fogli: richiesta per capitolo, spostamenti simulati (con le
  // spunte attuali) e utenze.
  exportXlsx(): void {
    const f = this.forecast;
    const plan = this.plan;
    if (!f || !plan) return;
    const y = plan.year;
    const c = (v: number | null): XlsxCell => (v === null ? null : Math.round(v * 100) / 100);
    const request: XlsxCell[][] = [
      ['Capitolo', 'Utenze del capitolo', `Stanziato ${y - 1}`, `Fatture ${y - 1}`, `Stima non fatturato ${y - 1}`,
        `Spesa ${y - 1}`, `Stanziato ${y}`, `Serve nel ${y}`, 'Differenza (+ da aggiungere, − avanza)',
        `Di cui questa convenzione ${y}`, 'Altre convenzioni', 'Stima incerta', 'Utenze attive fuori convenzione'],
      ...plan.rows.map(r => [
        this.chapterLabel(r.chapter_id), r.utilities, c(r.base_budget), c(r.base_billed), c(r.base_expected), c(r.base_total),
        c(r.budget), c(r.need), c(r.request), c(r.own), r.agreements.join('; '), r.uncertain ? 'sì' : '',
        r.other_utilities || null,
      ]),
      ['Totale', null, c(plan.totals.base_budget), null, null, c(plan.totals.base_total), c(plan.totals.budget),
        c(plan.totals.need), c(plan.totals.need - plan.totals.budget), null, null, null, null],
    ];
    const moves: XlsxCell[][] = [
      ['Da capitolo', 'A capitolo', 'Importo'],
      ...this.moves.moves.map(m => [this.chapterLabel(m.from), this.chapterLabel(m.to), c(m.amount)]),
      [],
      ['Da aggiungere', null, c(plan.totals.increase)],
      ['Coperti con spostamenti', null, c(plan.totals.increase - this.moves.extra)],
      ['Fabbisogno extra da finanziare', null, c(this.moves.extra)],
      ['Avanzo che resta', null, c(this.moves.leftover)],
      ...[...this.excluded].map(id => [`Avanzo non usato: ${this.chapterLabel(id)}`, null, null]),
    ];
    const utilities: XlsxCell[][] = [
      ['Capitolo', 'Codice', `Fatture ${y - 1}`, `Stima non fatturato ${y - 1}`, `Serve nel ${y}`, 'Origine della stima'],
      ...plan.rows.flatMap(r => requestUtilities(f.utilities, r.chapter_id, y).map(u => [
        this.chapterLabel(r.chapter_id), u.utility_code ?? `id ${u.id}`, c(u.base_billed), c(u.base_expected), c(u.need),
        SOURCE_LABEL[u.source],
      ])),
    ];
    downloadXlsx(`fabbisogno_${y}_convenzione_${this.agreementId}_${new Date().toLocaleDateString('sv-SE')}.xlsx`, [
      {name: `Richiesta ${y}`, rows: request, widths: [60, 12, 16, 16, 16, 16, 16, 16, 20, 18, 40, 10, 14]},
      {name: 'Spostamenti', rows: moves, widths: [60, 60, 16]},
      {name: 'Utenze', rows: utilities, widths: [60, 20, 16, 16, 16, 24]},
    ]);
  }
}

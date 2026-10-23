import {ChangeDetectionStrategy, Component, Input, OnChanges} from '@angular/core';
import {MatTooltipModule} from '@angular/material/tooltip';
import {formatEuro} from './spending/budget-chapter-spending.service';

type Segment = {key: string; label: string; value: number; width: number; cls: string; hint: string};

// Esercizio del capitolo in una barra sola, in scala su assestato (o impegnato,
// se maggiore) più il fatturato senza impegno: fatturato → rimanenza degli impegni →
// da impegnare. Impegnato oltre l'assestato e fatturato senza impegno
// escono dalla barra in rosso; la tacca segna l'assestato.
@Component({
  selector: 'app-chapter-budget-bar',
  standalone: true,
  imports: [MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="cbb" role="img" [attr.aria-label]="ariaLabel">
      <div class="cbb-track">
        @for (s of segments; track s.key) {
          <div [class]="'cbb-seg ' + s.cls" [style.width.%]="s.width" [matTooltip]="s.label + ': ' + eur(s.value) + ' — ' + s.hint"></div>
        }
        @if (markerAt !== null) {
          <div class="cbb-marker" [style.left.%]="markerAt" matTooltip="Assestato {{ eur(adjusted) }}"></div>
        }
      </div>
      <div class="cbb-legend">
        @for (s of segments; track s.key) {
          <span class="cbb-item" [matTooltip]="s.hint">
            <span [class]="'cbb-swatch ' + s.cls"></span>{{ s.label }} <strong>{{ eur(s.value) }}</strong>
          </span>
        }
      </div>
      <div class="cbb-foot">
        Assestato <strong>{{ adjusted === null ? '—' : eur(adjusted) }}</strong>
        @if (initial !== null && initial !== adjusted) { <span>(iniziale {{ eur(initial) }})</span> }
        · Impegnato <strong>{{ eur(committed) }}</strong>
        @if (withoutAmount) { <span class="cbb-warn">· {{ withoutAmount }} impegni senza importo</span> }
      </div>
    </div>
  `,
  styles: [`
    .cbb { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
    .cbb-track { position: relative; display: flex; gap: 2px; height: 14px; border-radius: 4px; background: var(--app-border); }
    .cbb-seg { height: 100%; min-width: 0; }
    .cbb-seg:first-child { border-radius: 4px 0 0 4px; }
    .cbb-seg:last-child { border-radius: 0 4px 4px 0; }
    .cbb-seg:only-child { border-radius: 4px; }
    .cbb-spent { background: var(--chart-series); }
    .cbb-left { background: color-mix(in srgb, var(--chart-series) 40%, var(--app-surface)); }
    .cbb-free { background: var(--app-border); }
    .cbb-over { background: var(--tone-danger-fg); }
    .cbb-marker { position: absolute; top: -3px; bottom: -3px; width: 2px; background: var(--app-text); transform: translateX(-1px); }
    .cbb-legend { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 0.8125rem; color: var(--app-muted); }
    .cbb-legend strong { color: var(--app-text); font-weight: 600; }
    .cbb-item { display: inline-flex; align-items: center; gap: 6px; }
    .cbb-swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; }
    .cbb-foot { font-size: 0.75rem; color: var(--app-muted); }
    .cbb-foot strong { color: var(--app-text); font-weight: 500; }
    .cbb-warn { color: var(--tone-warn-fg); }
  `],
})
export class ChapterBudgetBarComponent implements OnChanges {
  @Input() initial: number | null = null;
  @Input() adjusted: number | null = null;
  @Input() committed = 0;
  @Input() invoiced = 0;
  // Rimanenza degli impegni dal backend (null = non calcolabile).
  @Input() remaining: number | null = null;
  @Input() withoutAmount = 0;

  readonly eur = formatEuro;
  // Campi cache, ricalcolati solo al cambio degli input.
  segments: Segment[] = [];
  markerAt: number | null = null;
  ariaLabel = '';

  ngOnChanges(): void {
    const adjusted = this.adjusted ?? 0;
    const committed = Math.max(this.committed ?? 0, 0);
    const invoiced = Math.max(this.invoiced ?? 0, 0);
    // Impegnato entro l'assestato; la parte oltre va in rosso.
    const committedIn = this.adjusted === null ? committed : Math.min(committed, adjusted);
    // Fatturato che consuma gli impegni; il resto del fatturato non ha impegno.
    const left = Math.min(Math.max(this.remaining ?? committed - invoiced, 0), committedIn);
    const covered = Math.max(committedIn - left, 0);
    const scale = (Math.max(adjusted, committed) + Math.max(invoiced - covered, 0)) || 1;
    const raw: Omit<Segment, 'width'>[] = [
      {key: 'spent', label: 'Fatturato sugli impegni', value: covered, cls: 'cbb-spent', hint: 'righe di fattura che consumano gli impegni'},
      {key: 'left', label: 'Rimanenza impegni', value: left, cls: 'cbb-left', hint: 'impegnato non ancora fatturato'},
      {key: 'free', label: 'Da impegnare', value: this.adjusted === null ? 0 : Math.max(adjusted - committed, 0), cls: 'cbb-free', hint: 'assestato non ancora impegnato'},
      {key: 'over', label: 'Impegnato oltre l’assestato', value: this.adjusted === null ? 0 : Math.max(committed - adjusted, 0), cls: 'cbb-over', hint: 'impegni oltre lo stanziamento assestato'},
      {key: 'uncovered', label: 'Fatturato senza impegno', value: Math.max(invoiced - covered, 0), cls: 'cbb-over', hint: 'righe di fattura che non consumano impegni del capitolo'},
    ];
    this.segments = raw
      .filter(s => s.value > 0 || s.key === 'spent' || s.key === 'left' || (s.key === 'free' && this.adjusted !== null))
      .map(s => ({...s, width: (s.value / scale) * 100}));
    this.markerAt = this.adjusted !== null && scale > adjusted ? (adjusted / scale) * 100 : null;
    this.ariaLabel = this.segments.map(s => `${s.label} ${formatEuro(s.value)}`).join(', ');
  }
}

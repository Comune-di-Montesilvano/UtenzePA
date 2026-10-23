import {ChangeDetectionStrategy, Component, Input, OnChanges} from '@angular/core';
import {MatTooltipModule} from '@angular/material/tooltip';

export type BarTone = 'spent' | 'left' | 'free' | 'over';
export interface BarSegment {
  key: string;
  label: string;
  value: number;
  tone: BarTone;
  hint: string;
  // Mostrato in legenda anche a zero (es. «Da impegnare 0,00 €»).
  keepEmpty?: boolean;
}

// Barra orizzontale a segmenti in euro (capitolo, impegno), legenda sotto e
// righe aggiuntive via <ng-content>. Scala = somma dei segmenti, salvo `scale`;
// `markerAt` (stesso metro dei valori) disegna una tacca, es. l'assestato.
@Component({
  selector: 'app-stacked-bar',
  standalone: true,
  imports: [MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="sb" role="img" [attr.aria-label]="ariaLabel">
      <div class="sb-track">
        @for (s of visible; track s.key) {
          <div [class]="'sb-seg sb-' + s.tone" [style.width.%]="s.width" [matTooltip]="s.label + ': ' + eur(s.value) + ' — ' + s.hint"></div>
        }
        @if (markerPct !== null) {
          <div class="sb-marker" [style.left.%]="markerPct" [matTooltip]="markerLabel"></div>
        }
      </div>
      <div class="sb-legend">
        @for (s of visible; track s.key) {
          <span class="sb-item" [matTooltip]="s.hint">
            <span [class]="'sb-swatch sb-' + s.tone"></span>{{ s.label }} <strong>{{ eur(s.value) }}</strong>
          </span>
        }
      </div>
      <div class="sb-foot"><ng-content></ng-content></div>
    </div>
  `,
  styles: [`
    .sb { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
    .sb-track { position: relative; display: flex; gap: 2px; height: 14px; border-radius: 4px; background: var(--app-border); }
    .sb-seg { height: 100%; min-width: 0; }
    .sb-seg:first-child { border-radius: 4px 0 0 4px; }
    .sb-seg:last-child { border-radius: 0 4px 4px 0; }
    .sb-seg:only-child { border-radius: 4px; }
    .sb-spent { background: var(--chart-series); }
    .sb-left { background: color-mix(in srgb, var(--chart-series) 40%, var(--app-surface)); }
    .sb-free { background: var(--app-border); }
    .sb-over { background: var(--tone-danger-fg); }
    .sb-marker { position: absolute; top: -3px; bottom: -3px; width: 2px; background: var(--app-text); transform: translateX(-1px); }
    .sb-legend { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 0.8125rem; color: var(--app-muted); }
    .sb-legend strong { color: var(--app-text); font-weight: 600; }
    .sb-item { display: inline-flex; align-items: center; gap: 6px; }
    .sb-swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; }
    .sb-foot { font-size: 0.75rem; color: var(--app-muted); }
    .sb-foot:empty { display: none; }
  `],
})
export class StackedBarComponent implements OnChanges {
  @Input() segments: BarSegment[] = [];
  @Input() markerAt: number | null = null;
  @Input() markerLabel = '';

  // Campi cache, ricalcolati solo al cambio degli input.
  visible: (BarSegment & {width: number})[] = [];
  markerPct: number | null = null;
  ariaLabel = '';

  eur(v: number): string {
    return Number(v ?? 0).toLocaleString('it-IT', {style: 'currency', currency: 'EUR'});
  }

  ngOnChanges(): void {
    const shown = this.segments.filter(s => s.value > 0 || s.keepEmpty);
    const scale = shown.reduce((sum, s) => sum + Math.max(s.value, 0), 0) || 1;
    this.visible = shown.map(s => ({...s, width: (Math.max(s.value, 0) / scale) * 100}));
    this.markerPct = this.markerAt !== null && this.markerAt < scale ? (this.markerAt / scale) * 100 : null;
    this.ariaLabel = shown.map(s => `${s.label} ${this.eur(s.value)}`).join(', ');
  }
}

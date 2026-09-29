import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {formatQty, MonthlyPoint} from './consumption.model';

const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const BAR_STEP = 20;
const CHART_HEIGHT = 160;
const BASELINE = 175;

interface Bar {
  x: number;
  actualY: number;
  actualH: number;
  estimatedY: number;
  estimatedH: number;
  partial: boolean;
  label: string | null;
  title: string;
}

// Barre mensili: reale piena (più chiara se il mese è coperto solo in
// parte), stimata tratteggiata sopra. SVG inline, nessuna libreria grafici.
@Component({
  selector: 'app-consumption-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @if (hasData) {
      <svg [attr.viewBox]="'0 0 ' + width + ' 200'" style="width: 100%; height: 220px;" role="img" aria-label="Consumi mensili">
        <line x1="0" [attr.x2]="width" y1="175" y2="175" stroke="#d1d5db" />
        @for (bar of bars; track $index) {
          <g>
            <title>{{ bar.title }}</title>
            @if (bar.actualH > 0) {
              <rect [attr.x]="bar.x" [attr.y]="bar.actualY" width="14" [attr.height]="bar.actualH"
                    fill="#1976d2" [attr.fill-opacity]="bar.partial ? 0.45 : 1" />
            }
            @if (bar.estimatedH > 0) {
              <rect [attr.x]="bar.x" [attr.y]="bar.estimatedY" width="14" [attr.height]="bar.estimatedH"
                    fill="rgba(25,118,210,0.12)" stroke="#1976d2" stroke-dasharray="3 2" />
            }
            <rect [attr.x]="bar.x - 3" y="0" width="20" height="176" fill="transparent" />
            @if (bar.label) {
              <text [attr.x]="bar.x + 7" y="192" text-anchor="middle" font-size="10" fill="#6b7280">{{ bar.label }}</text>
            }
          </g>
        }
      </svg>
      <div style="display: flex; gap: 1.5rem; font-size: 0.8rem; color: #6b7280;">
        <span><span style="display:inline-block; width:10px; height:10px; background:#1976d2;"></span> Reale</span>
        <span><span style="display:inline-block; width:10px; height:10px; background:#1976d2; opacity:0.45;"></span> Reale, mese coperto in parte</span>
        <span><span style="display:inline-block; width:10px; height:10px; border:1px dashed #1976d2;"></span> Stimato</span>
      </div>
    } @else {
      <p style="color: #6b7280;">Nessun consumo da mostrare.</p>
    }
  `,
})
export class ConsumptionChartComponent {
  @Input() unit: string | null = null;

  bars: Bar[] = [];
  hasData = false;
  width = 0;

  @Input()
  set points(value: MonthlyPoint[]) {
    const points = value ?? [];
    this.width = points.length * BAR_STEP;
    const max = Math.max(0, ...points.map(p => p.actual + p.estimated));
    this.hasData = max > 0;
    const scale = (v: number) => (max > 0 ? (v / max) * CHART_HEIGHT : 0);
    this.bars = points.map((p, i) => {
      const actualH = scale(p.actual);
      const estimatedH = scale(p.estimated);
      const [year, month] = p.month.split('-').map(Number);
      const monthName = MONTHS[month - 1];
      return {
        x: i * BAR_STEP + 3,
        actualY: BASELINE - actualH,
        actualH,
        estimatedY: BASELINE - actualH - estimatedH,
        estimatedH,
        partial: p.estimated === 0 && p.covered_days > 0 && p.covered_days < p.days,
        label: month === 1 || i === 0 ? `${monthName} ${String(year).slice(2)}` : (i % 3 === 0 ? monthName : null),
        title: `${monthName} ${year} — reale ${formatQty(p.actual, this.unit)} (${p.covered_days}/${p.days} gg)` +
          (p.estimated > 0 ? `, stimato ${formatQty(p.estimated, this.unit)}` : ''),
      };
    });
  }
}

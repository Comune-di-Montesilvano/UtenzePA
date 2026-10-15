import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {BandKey, formatQty, MonthlyPoint} from './consumption.model';

const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const BAR_STEP = 20;
const CHART_HEIGHT = 160;
const BASELINE = 175;

// Segmenti impilati dal basso: fasce in ordine, poi la parte non ripartita.
const BAND_ORDER: BandKey[] = ['F1', 'F2', 'F3', 'F0'];
const BAND_COLOR: Record<BandKey | 'none', string> = {
  F0: 'var(--chart-band-f0)', F1: 'var(--chart-band-f1)', F2: 'var(--chart-band-f2)',
  F3: 'var(--chart-band-f3)', none: 'var(--chart-band-none)',
};
const BAND_LABEL: Record<BandKey | 'none', string> = {
  F0: 'F0 (monoraria)', F1: 'F1', F2: 'F2', F3: 'F3', none: 'Non ripartito',
};

interface Segment {
  y: number;
  h: number;
  color: string;
  estimated: boolean;
}

interface Bar {
  x: number;
  segments: Segment[];
  partial: boolean;
  label: string | null;
  title: string;
}

// Barre mensili: reale piena (più chiara se il mese è coperto solo in
// parte), stimata tratteggiata sopra. Con dati per fascia ogni parte è divisa
// in segmenti colorati (F1, F2, F3, F0 e non ripartito) che sommano al
// totale. SVG inline, nessuna libreria grafici.
@Component({
  selector: 'app-consumption-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @if (hasData) {
      <svg [attr.viewBox]="'0 0 ' + width + ' 200'" style="width: 100%; height: 220px;" role="img" aria-label="Consumi mensili">
        <line x1="0" [attr.x2]="width" y1="175" y2="175" style="stroke: light-dark(#d1d5db, #3f3f46)" />
        @for (bar of bars; track $index) {
          <g>
            <title>{{ bar.title }}</title>
            @for (s of bar.segments; track $index) {
              @if (s.estimated) {
                <rect [attr.x]="bar.x" [attr.y]="s.y" width="14" [attr.height]="s.h"
                      [style.fill]="'color-mix(in srgb, ' + s.color + ' 12%, transparent)'" [style.stroke]="s.color" stroke-dasharray="3 2" />
              } @else {
                <rect [attr.x]="bar.x" [attr.y]="s.y" width="14" [attr.height]="s.h"
                      [style.fill]="s.color" [attr.fill-opacity]="bar.partial ? 0.45 : 1" />
              }
            }
            <rect [attr.x]="bar.x - 3" y="0" width="20" height="176" fill="transparent" />
            @if (bar.label) {
              <text [attr.x]="bar.x + 7" y="192" text-anchor="middle" font-size="10" style="fill: var(--app-muted)">{{ bar.label }}</text>
            }
          </g>
        }
      </svg>
      <div style="display: flex; flex-wrap: wrap; gap: 0.5rem 1.5rem; font-size: 0.8rem; color: var(--app-muted);">
        @for (l of legend; track l.label) {
          <span><span style="display:inline-block; width:10px; height:10px;" [style.background]="l.color"></span> {{ l.label }}</span>
        }
        @if (!legend.length) {
          <span><span style="display:inline-block; width:10px; height:10px; background: var(--chart-series);"></span> Reale</span>
        }
        <span><span style="display:inline-block; width:10px; height:10px; opacity:0.45;" [style.background]="legend.length ? 'var(--chart-band-none)' : 'var(--chart-series)'"></span> Reale, mese coperto in parte</span>
        <span><span style="display:inline-block; width:10px; height:10px; border:1px dashed;" [style.border-color]="legend.length ? 'var(--chart-band-none)' : 'var(--chart-series)'"></span> Stimato</span>
      </div>
    } @else {
      <p style="color: var(--app-muted);">Nessun consumo da mostrare.</p>
    }
  `,
})
export class ConsumptionChartComponent {
  @Input() unit: string | null = null;

  bars: Bar[] = [];
  legend: {label: string; color: string}[] = [];
  hasData = false;
  width = 0;

  @Input()
  set points(value: MonthlyPoint[]) {
    const points = value ?? [];
    this.width = points.length * BAR_STEP;
    const max = Math.max(0, ...points.map(p => p.actual + p.estimated));
    this.hasData = max > 0;
    const scale = (v: number) => (max > 0 ? (v / max) * CHART_HEIGHT : 0);
    const withBands = points.some(p => p.bands !== undefined);
    const used = new Set<BandKey | 'none'>();
    // Parti di un totale: fasce presenti, poi il resto come «non ripartito».
    const split = (total: number, bands: Partial<Record<BandKey, number>> | undefined) => {
      if (!withBands) return [{key: 'none' as const, value: total, color: 'var(--chart-series)'}];
      const parts: {key: BandKey | 'none'; value: number; color: string}[] = [];
      let rest = total;
      for (const k of BAND_ORDER) {
        const v = Math.min(bands?.[k] ?? 0, rest);
        if (v > 0) {
          parts.push({key: k, value: v, color: BAND_COLOR[k]});
          rest -= v;
        }
      }
      if (rest > 0.005) parts.push({key: 'none', value: rest, color: BAND_COLOR.none});
      return parts;
    };
    const describe = (parts: {key: BandKey | 'none'; value: number}[]) =>
      withBands && parts.length ? ' (' + parts.map(x => `${BAND_LABEL[x.key]} ${formatQty(x.value)}`).join(', ') + ')' : '';
    this.bars = points.map((p, i) => {
      const [year, month] = p.month.split('-').map(Number);
      const monthName = MONTHS[month - 1];
      const actualParts = split(p.actual, p.bands);
      const estimatedParts = split(p.estimated, p.estimated_bands);
      const segments: Segment[] = [];
      let top = BASELINE;
      for (const [parts, estimated] of [[actualParts, false], [estimatedParts, true]] as const) {
        for (const part of parts) {
          const h = scale(part.value);
          if (h <= 0) continue;
          top -= h;
          segments.push({y: top, h, color: part.color, estimated});
          used.add(part.key);
        }
      }
      return {
        x: i * BAR_STEP + 3,
        segments,
        partial: p.estimated === 0 && p.covered_days > 0 && p.covered_days < p.days,
        label: month === 1 || i === 0 ? `${monthName} ${String(year).slice(2)}` : (i % 3 === 0 ? monthName : null),
        title: `${monthName} ${year} — reale ${formatQty(p.actual, this.unit)} (${p.covered_days}/${p.days} gg)` +
          describe(actualParts) +
          (p.estimated > 0 ? `, stimato ${formatQty(p.estimated, this.unit)}` + describe(estimatedParts) : ''),
      };
    });
    this.legend = withBands
      ? [...BAND_ORDER, 'none' as const].filter(k => used.has(k)).map(k => ({label: BAND_LABEL[k], color: BAND_COLOR[k]}))
      : [];
  }
}

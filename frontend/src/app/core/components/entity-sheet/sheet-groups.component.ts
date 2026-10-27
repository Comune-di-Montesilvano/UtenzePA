import {ChangeDetectionStrategy, Component, ContentChild, Input, TemplateRef} from '@angular/core';
import {NgTemplateOutlet} from '@angular/common';
import {MatIconModule} from '@angular/material/icon';

export interface SheetGroup<R> {
  key: string;
  label: string;
  rows: R[];
  // Testo a destra dell'intestazione (es. il totale dell'anno).
  summary?: string;
  open: boolean;
}

// Righe raggruppate per anno, dal più recente; aperto solo l'anno in corso o,
// se non ha righe, l'ultimo con righe. Righe senza anno in fondo.
export function groupByYear<R>(rows: R[], yearOf: (r: R) => number | null, summaryOf?: (rows: R[]) => string): SheetGroup<R>[] {
  const byYear = new Map<number | null, R[]>();
  for (const r of rows) {
    const y = yearOf(r);
    byYear.set(y, [...(byYear.get(y) ?? []), r]);
  }
  const years = [...byYear.keys()].sort((a, b) => (b ?? -Infinity) - (a ?? -Infinity));
  const current = new Date().getFullYear();
  const openYear = byYear.has(current) ? current : years[0];
  return years.map(y => ({
    key: String(y),
    label: y === null ? 'Senza data' : String(y),
    rows: byYear.get(y)!,
    summary: summaryOf?.(byYear.get(y)!),
    open: y === openYear,
  }));
}

// Dopo un ricaricamento i gruppi già visti restano aperti o chiusi come prima.
export function keepOpen<R>(next: SheetGroup<R>[], previous: SheetGroup<R>[]): SheetGroup<R>[] {
  const was = new Map(previous.map(g => [g.key, g.open]));
  return next.map(g => (was.has(g.key) ? {...g, open: was.get(g.key)!} : g));
}

// Elenco di una scheda diviso in gruppi apribili: i gruppi chiusi non si
// disegnano, così una lista di migliaia di righe resta leggera. Il contenuto
// di un gruppo è il template figlio, con le righe come $implicit.
@Component({
  selector: 'app-sheet-groups',
  standalone: true,
  imports: [NgTemplateOutlet, MatIconModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @for (g of groups; track g.key) {
      <section class="sg">
        <button type="button" class="sg-head" [attr.aria-expanded]="g.open" (click)="g.open = !g.open">
          <mat-icon>{{ g.open ? 'expand_more' : 'chevron_right' }}</mat-icon>
          <span class="sg-label">{{ g.label }}</span>
          <span class="sg-count">{{ g.rows.length }}</span>
          @if (g.summary) {
            <span class="sg-summary">{{ g.summary }}</span>
          }
        </button>
        @if (g.open && body) {
          <div class="sg-body">
            <ng-container [ngTemplateOutlet]="body" [ngTemplateOutletContext]="{$implicit: g.rows, group: g}"></ng-container>
          </div>
        }
      </section>
    }
  `,
  styles: [`
    .sg { border-bottom: 1px solid var(--sheet-border, var(--app-border)); }
    .sg-head {
      display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 4px;
      background: none; border: 0; cursor: pointer; font: inherit; color: inherit; text-align: left;
    }
    .sg-head:hover { background: var(--app-surface-2); }
    .sg-label { font-weight: 600; }
    .sg-count {
      font-size: 0.75rem; padding: 0 8px; border-radius: 10px;
      background: var(--app-surface-2); color: var(--app-muted);
    }
    .sg-summary { margin-left: auto; font-weight: 600; }
    .sg-body { padding: 4px 0 12px; }
  `],
})
export class SheetGroupsComponent<R> {
  @Input({required: true}) groups: SheetGroup<R>[] = [];
  @ContentChild(TemplateRef) body?: TemplateRef<{$implicit: R[]; group: SheetGroup<R>}>;
}

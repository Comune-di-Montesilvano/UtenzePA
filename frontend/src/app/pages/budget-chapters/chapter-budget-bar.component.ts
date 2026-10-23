import {ChangeDetectionStrategy, Component, Input, OnChanges} from '@angular/core';
import {BarSegment, StackedBarComponent} from '../../core/components/stacked-bar.component';
import {formatEuro} from './spending/budget-chapter-spending.service';

// Esercizio del capitolo in una barra: fatturato sugli impegni → rimanenza
// degli impegni → da impegnare. Impegnato oltre l'assestato e fatturato senza
// impegno escono dalla barra in rosso; la tacca segna l'assestato.
@Component({
  selector: 'app-chapter-budget-bar',
  standalone: true,
  imports: [StackedBarComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <app-stacked-bar [segments]="segments" [markerAt]="adjusted" [markerLabel]="'Assestato ' + eur(adjusted ?? 0)">
      Assestato <strong>{{ adjusted === null ? '—' : eur(adjusted) }}</strong>
      @if (initial !== null && initial !== adjusted) { <span>(iniziale {{ eur(initial) }})</span> }
      · Impegnato <strong>{{ eur(committed) }}</strong>
      @if (withoutAmount) { <span class="cbb-warn">· {{ withoutAmount }} impegni senza importo</span> }
    </app-stacked-bar>
  `,
  styles: [`
    strong { color: var(--app-text); font-weight: 500; }
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
  segments: BarSegment[] = [];

  ngOnChanges(): void {
    const hasBudget = this.adjusted !== null;
    const adjusted = this.adjusted ?? 0;
    const committed = Math.max(this.committed ?? 0, 0);
    const invoiced = Math.max(this.invoiced ?? 0, 0);
    // Impegnato entro l'assestato; la parte oltre va in rosso.
    const committedIn = hasBudget ? Math.min(committed, adjusted) : committed;
    // Fatturato che consuma gli impegni; il resto del fatturato non ha impegno.
    const left = Math.min(Math.max(this.remaining ?? committed - invoiced, 0), committedIn);
    const covered = Math.max(committedIn - left, 0);
    this.segments = [
      {key: 'spent', label: 'Fatturato sugli impegni', value: covered, tone: 'spent', hint: 'righe di fattura che consumano gli impegni', keepEmpty: true},
      {key: 'left', label: 'Rimanenza impegni', value: left, tone: 'left', hint: 'impegnato non ancora fatturato', keepEmpty: true},
      {key: 'free', label: 'Da impegnare', value: hasBudget ? Math.max(adjusted - committed, 0) : 0, tone: 'free', hint: 'assestato non ancora impegnato', keepEmpty: hasBudget},
      {key: 'over', label: 'Impegnato oltre l’assestato', value: hasBudget ? Math.max(committed - adjusted, 0) : 0, tone: 'over', hint: 'impegni oltre lo stanziamento assestato'},
      {key: 'uncovered', label: 'Fatturato senza impegno', value: Math.max(invoiced - covered, 0), tone: 'over', hint: 'righe di fattura che non consumano impegni del capitolo'},
    ];
  }
}

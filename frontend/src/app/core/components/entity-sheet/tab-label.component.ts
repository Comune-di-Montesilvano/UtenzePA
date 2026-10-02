import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {MatIconModule} from '@angular/material/icon';
import type {Tone} from '../../helpers/entity-status';

// Etichetta di un mat-tab: icona, testo e un indicatore. Priorità:
// errore (pallino rosso) > conteggio > pallino "contiene dati".
@Component({
  selector: 'app-tab-label',
  standalone: true,
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <mat-icon class="tl-icon">{{ icon }}</mat-icon>
    <span>{{ label }}</span>
    @if (error) {
      <span class="tl-dot tone-danger" title="Campi da correggere"></span>
    } @else if (count !== null && count !== undefined) {
      <span [class]="'tl-count tone-' + (count === 0 ? 'off' : tone)">{{ count }}</span>
    } @else if (dot) {
      <span [class]="'tl-dot tone-' + tone"></span>
    }
  `,
  styles: [`
    :host { display: inline-flex; align-items: center; gap: 6px; }
    .tl-icon { font-size: 20px; width: 20px; height: 20px; }
    .tl-count { border-radius: 999px; padding: 0 7px; font-size: 0.72rem; font-weight: 600; line-height: 18px; min-width: 8px; text-align: center; }
    .tl-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
    .tl-dot.tone-danger { background: var(--tone-danger-fg); }
    .tl-dot.tone-info { background: var(--tone-info-fg); }
    .tl-dot.tone-warn { background: var(--tone-warn-fg); }
    .tl-dot.tone-ok { background: var(--tone-ok-fg); }
  `],
})
export class TabLabelComponent {
  @Input({required: true}) icon!: string;
  @Input({required: true}) label!: string;
  @Input() count: number | null | undefined = null;
  @Input() tone: Tone = 'info';
  @Input() dot = false;
  @Input() error = false;
}

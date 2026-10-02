import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import type {Tone} from '../../helpers/entity-status';
import {dateIt, validityProgress, ValidityProgress} from './sheet-utils';

// Barra decorrenza → scadenza con la posizione di oggi.
@Component({
  selector: 'app-validity-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @let p = progress();
    <div class="vb">
      <div class="vb-dates">
        <span>{{ dateIt(start) || 'senza decorrenza' }}</span>
        <span [class]="'vb-state tone-' + tone(p)">{{ stateLabel(p) }}</span>
        <span>{{ dateIt(end) || 'senza scadenza' }}</span>
      </div>
      <div class="vb-track">
        <div class="vb-fill" [style.background]="'var(--tone-' + tone(p) + '-fg)'"
             [style.width.%]="p.percent ?? (p.state === 'open' || p.state === 'running' ? 100 : 0)"></div>
      </div>
    </div>
  `,
  styles: [`
    .vb { display: flex; flex-direction: column; gap: 6px; }
    .vb-dates { display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: var(--sheet-muted); }
    .vb-state { border-radius: 999px; padding: 1px 8px; font-weight: 600; }
    .vb-track { height: 8px; border-radius: 4px; background: #e5e7eb; overflow: hidden; }
    .vb-fill { height: 100%; border-radius: 4px; opacity: 0.7; }
  `],
})
export class ValidityBarComponent {
  @Input() start: Date | string | null | undefined = null;
  @Input() end: Date | string | null | undefined = null;
  readonly dateIt = dateIt;

  progress(): ValidityProgress {
    return validityProgress(this.start, this.end);
  }

  tone(p: ValidityProgress): Tone {
    switch (p.state) {
      case 'expired': return 'danger';
      case 'future': return 'info';
      case 'none': return 'off';
      default: return 'ok';
    }
  }

  stateLabel(p: ValidityProgress): string {
    switch (p.state) {
      case 'none': return 'Date non indicate';
      case 'open': return 'In corso, senza scadenza';
      case 'future': return 'Non ancora iniziato';
      case 'expired': return 'Scaduto';
      default: return p.percent === null ? 'In corso' : `In corso · ${p.percent}%`;
    }
  }
}

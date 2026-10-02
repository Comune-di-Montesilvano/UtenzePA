import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import type {StatusInfo} from '../../helpers/entity-status';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  imports: [MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <span [class]="'badge tone-' + info.tone + (size === 'sm' ? ' sm' : '')" [matTooltip]="info.tooltip ?? ''">
      @if (info.icon) {
        <mat-icon>{{ info.icon }}</mat-icon>
      }
      {{ info.label }}
    </span>
  `,
  styles: [`
    .badge {
      display: inline-flex; align-items: center; gap: 4px;
      border-radius: 999px; padding: 3px 12px;
      font-size: 0.8rem; font-weight: 600; line-height: 1.3; white-space: nowrap;
    }
    .badge .mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .badge.sm { padding: 1px 8px; font-size: 0.72rem; font-weight: 500; }
    .badge.sm .mat-icon { font-size: 14px; width: 14px; height: 14px; }
  `],
})
export class StatusBadgeComponent {
  @Input({required: true}) info!: StatusInfo;
  @Input() size: 'md' | 'sm' = 'md';
}

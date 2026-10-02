import {ChangeDetectionStrategy, Component, EventEmitter, Input, Output} from '@angular/core';
import {MatIconModule} from '@angular/material/icon';
import type {StatusInfo} from '../../helpers/entity-status';
import {StatusBadgeComponent} from './status-badge.component';

export interface PreviewItem {
  id: number;
  label: string;
  sublabel?: string;
  icon?: string;
  color?: string;
  status?: StatusInfo | null;
}

// Riquadro del Riepilogo: prime righe di un collegamento + link al tab.
@Component({
  selector: 'app-preview-card',
  standalone: true,
  imports: [MatIconModule, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="pc">
      <div class="pc-head">
        <mat-icon [style.color]="color">{{ icon }}</mat-icon>
        <span class="pc-title">{{ title }}</span>
        <span [class]="'pc-count tone-' + (items.length ? 'info' : 'off')">{{ items.length }}</span>
      </div>
      @if (items.length === 0) {
        <div class="pc-empty">{{ emptyText }}</div>
      } @else {
        <ul class="pc-list">
          @for (it of items.slice(0, max); track it.id) {
            <li>
              <button type="button" class="pc-item" (click)="open.emit(it)">
                @if (it.icon) {
                  <mat-icon [style.color]="it.color ?? null">{{ it.icon }}</mat-icon>
                }
                <span class="pc-text">
                  <span class="pc-label">{{ it.label }}</span>
                  @if (it.sublabel) {
                    <span class="pc-sub">{{ it.sublabel }}</span>
                  }
                </span>
                @if (it.status) {
                  <app-status-badge [info]="it.status" size="sm"></app-status-badge>
                }
              </button>
            </li>
          }
        </ul>
      }
      <button type="button" class="pc-all" (click)="seeAll.emit()">
        {{ items.length > max ? 'Vedi tutti (' + items.length + ')' : 'Apri sezione' }}
        <mat-icon>arrow_forward</mat-icon>
      </button>
    </div>
  `,
  styles: [`
    .pc { border: 1px solid var(--sheet-border); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px; height: 100%; box-sizing: border-box; }
    .pc-head { display: flex; align-items: center; gap: 8px; font-weight: 600; }
    .pc-title { flex: 1 1 auto; }
    .pc-count { border-radius: 999px; padding: 0 8px; font-size: 0.75rem; font-weight: 600; }
    .pc-empty { color: var(--sheet-muted); font-size: 0.85rem; }
    .pc-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
    .pc-item {
      width: 100%; display: flex; align-items: center; gap: 8px; text-align: left;
      border: 0; background: transparent; padding: 6px; border-radius: 6px; cursor: pointer; font: inherit;
    }
    .pc-item:hover { background: #f3f4f6; }
    .pc-item .mat-icon { font-size: 20px; width: 20px; height: 20px; flex: 0 0 auto; }
    .pc-text { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
    .pc-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pc-sub { color: var(--sheet-muted); font-size: 0.75rem; }
    .pc-all {
      margin-top: auto; align-self: flex-end; display: inline-flex; align-items: center; gap: 4px;
      border: 0; background: transparent; color: var(--entity-asset); cursor: pointer; font: inherit; font-size: 0.85rem;
    }
    .pc-all .mat-icon { font-size: 16px; width: 16px; height: 16px; }
  `],
})
export class PreviewCardComponent {
  @Input({required: true}) title!: string;
  @Input({required: true}) icon!: string;
  @Input() color = 'var(--entity-asset)';
  @Input() items: PreviewItem[] = [];
  @Input() emptyText = 'Nessuno';
  @Input() max = 3;
  @Output() seeAll = new EventEmitter<void>();
  @Output() open = new EventEmitter<PreviewItem>();
}

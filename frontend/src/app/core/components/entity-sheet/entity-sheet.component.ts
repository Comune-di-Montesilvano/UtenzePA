import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {MatIconModule} from '@angular/material/icon';

// Shell dei dialog scheda: header fisso (icona, titolo, badge, ultima
// modifica), corpo che riempie l'altezza (il mat-tab-group del dialog, che
// scorre solo nel corpo del tab) e footer fisso con le azioni. I mat-tab
// restano nel template del dialog: mat-tab-group non vede tab proiettati
// tramite ng-content di un altro componente.
@Component({
  selector: 'app-entity-sheet',
  standalone: true,
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <header class="sheet-header">
      <div class="sheet-icon" [style.background]="color"><mat-icon>{{ icon }}</mat-icon></div>
      <div class="sheet-titles">
        <div class="sheet-title-row">
          <h2 class="sheet-title">{{ title }}</h2>
          <ng-content select="[sheetBadges]"></ng-content>
        </div>
        @if (subtitle) {
          <div class="sheet-subtitle">{{ subtitle }}</div>
        }
      </div>
      @if (lastModified) {
        <div class="sheet-meta">{{ lastModified }}</div>
      }
    </header>
    <div class="sheet-body">
      <ng-content></ng-content>
    </div>
    <footer class="sheet-footer">
      <ng-content select="[sheetActions]"></ng-content>
    </footer>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; }
    .sheet-header {
      display: flex; align-items: center; gap: 16px;
      padding: 16px 24px 12px; border-bottom: 1px solid var(--sheet-border);
    }
    .sheet-icon {
      flex: 0 0 auto; width: 44px; height: 44px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center; color: var(--on-entity);
    }
    .sheet-titles { flex: 1 1 auto; min-width: 0; }
    .sheet-title-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
    .sheet-title {
      margin: 0; font-size: 1.25rem; font-weight: 600; line-height: 1.3;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;
    }
    .sheet-subtitle { color: var(--sheet-muted); font-size: 0.875rem; margin-top: 2px; }
    .sheet-meta { flex: 0 0 auto; color: var(--sheet-muted); font-size: 0.75rem; text-align: right; max-width: 260px; }
    .sheet-body { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
    .sheet-footer {
      display: flex; justify-content: flex-end; align-items: center; gap: 8px;
      padding: 12px 24px; border-top: 1px solid var(--sheet-border);
    }
    @media (max-width: 700px) { .sheet-meta { display: none; } }
  `],
})
export class EntitySheetComponent {
  @Input({required: true}) icon!: string;
  @Input() color = 'var(--entity-asset)';
  @Input({required: true}) title!: string;
  @Input() subtitle: string | null | undefined = null;
  @Input() lastModified: string | null | undefined = null;
}

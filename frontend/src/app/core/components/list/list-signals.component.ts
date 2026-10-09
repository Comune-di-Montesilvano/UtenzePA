import {ChangeDetectionStrategy, Component, EventEmitter, inject, Input, OnChanges, Output, SimpleChanges} from '@angular/core';
import {MatExpansionModule} from '@angular/material/expansion';
import {MatIconModule} from '@angular/material/icon';
import {Anomalies, AnomaliesService} from '../../services/anomalies.service';

// Una segnalazione dell'elenco: un'anomalia della dashboard e come ricavare
// gli id dei record dell'elenco dai suoi elementi (default: item.id).
export interface SignalDef {
  key: keyof Anomalies;
  label: string;
  ids?: (items: any[]) => number[];
}

export interface ActiveSignal {
  key: string;
  label: string;
  ids: Set<number>;
}

interface Row {
  def: SignalDef;
  count: number;
  ids: Set<number>;
}

// Pannello "Segnalazioni (N)" sopra un elenco, chiuso di default. Un clic su
// una riga filtra l'elenco sui record di quell'anomalia (selected).
@Component({
  selector: 'app-list-signals',
  standalone: true,
  imports: [MatExpansionModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @if (withRecords.length) {
      <mat-expansion-panel class="ls">
        <mat-expansion-panel-header>
          <mat-panel-title>
            <mat-icon class="ls-icon">report</mat-icon>
            Segnalazioni ({{ withRecords.length }})
          </mat-panel-title>
        </mat-expansion-panel-header>
        <ul class="ls-list">
          @for (r of withRecords; track r.def.key) {
            <li>
              <button type="button" class="ls-row" [class.active]="r.def.key === activeKey" (click)="pick(r)">
                <span>{{ r.def.label }}</span>
                <span class="ls-count">{{ r.count }}</span>
              </button>
            </li>
          }
        </ul>
      </mat-expansion-panel>
    }
  `,
  styles: [`
    :host { display: block; margin-top: 0.75rem; }
    .ls { box-shadow: none !important; border: 1px solid light-dark(#fcd34d, #78591a); background: light-dark(#fffbeb, #2a2210); }
    .ls-icon { color: light-dark(#b45309, #fcd34d); margin-right: 8px; }
    .ls-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
    .ls-row { width: 100%; display: flex; justify-content: space-between; align-items: center; gap: 12px;
      border: 0; background: transparent; padding: 8px 12px; border-radius: 6px; cursor: pointer; font: inherit; color: light-dark(#374151, #d4d4d8); text-align: left; }
    .ls-row:hover { background: var(--tone-warn-bg); }
    .ls-row.active { background: var(--tone-disputed-bg); font-weight: 600; }
    .ls-count { min-width: 24px; padding: 0 8px; border-radius: 10px; background: light-dark(#b45309, #fcd34d); color: light-dark(#fff, #1c1c1e);
      font-size: 0.75rem; line-height: 20px; text-align: center; }
  `],
})
export class ListSignalsComponent implements OnChanges {
  @Input({required: true}) signals: SignalDef[] = [];
  // Cambia dopo ogni salvataggio: le anomalie si ricalcolano.
  @Input() reloadToken: unknown = 0;
  @Input() activeKey: string | null = null;
  @Output() selected = new EventEmitter<ActiveSignal>();

  private service = inject(AnomaliesService);
  withRecords: Row[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['reloadToken'] || changes['signals']) this.load();
  }

  pick(r: Row): void {
    this.selected.emit({key: r.def.key, label: r.def.label, ids: r.ids});
  }

  private load(): void {
    this.service.get().subscribe({
      next: data => {
        this.withRecords = this.signals
          .map(def => {
            const items = (data[def.key]?.items ?? []) as any[];
            const ids = new Set<number>((def.ids ? def.ids(items) : items.map(i => i.id)).filter((id: unknown): id is number => id != null));
            return {def, count: ids.size, ids};
          })
          .filter(r => r.count > 0);
        // Segnalazione attiva: id aggiornati dopo un salvataggio.
        // Se non ha più record (tutti sistemati) l'elenco filtrato resta vuoto.
        if (this.activeKey) {
          const active = this.withRecords.find(r => r.def.key === this.activeKey);
          const def = this.signals.find(d => d.key === this.activeKey);
          if (active) this.pick(active);
          else if (def) this.selected.emit({key: def.key, label: def.label, ids: new Set()});
        }
      },
      error: err => console.error('Errore nel caricamento delle segnalazioni:', err),
    });
  }
}

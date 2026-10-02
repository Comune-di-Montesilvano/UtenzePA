import {ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {FilterableSelectComponent} from '../filterable-select.component';
import type {TOption} from '../../types/option.interface';
import type {StatusInfo} from '../../helpers/entity-status';
import {StatusBadgeComponent} from './status-badge.component';

export interface LinkedRow {
  id: number;
}

export interface LinkedColumn<R> {
  label: string;
  value: (row: R) => string;
}

export interface RowIcon {
  icon: string;
  color?: string;
}

// Tabella dei collegamenti di una scheda: righe cliccabili (aprono la scheda
// collegata), "Collega" da un elenco, "Scollega" per riga, "Nuovo" opzionale.
// Le opzioni disponibili si ricalcolano solo quando cambiano gli input: un
// array nuovo a ogni change detection azzererebbe il filtro mentre si digita.
@Component({
  selector: 'app-linked-table',
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatIconModule, MatTooltipModule, FilterableSelectComponent, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @if (addOptions || createLabel) {
      <div class="lt-toolbar">
        @if (addOptions) {
          <div class="lt-picker">
            <app-filterable-select [label]="addLabel" placeholder="Cerca..." [options]="available" [(ngModel)]="toAdd"></app-filterable-select>
          </div>
          <button mat-flat-button type="button" class="lt-link-btn" [disabled]="toAdd === null" (click)="confirmAdd()">
            <mat-icon>link</mat-icon> Collega
          </button>
        }
        @if (createLabel) {
          <button mat-stroked-button type="button" class="lt-link-btn" (click)="create.emit()">
            <mat-icon>add</mat-icon> {{ createLabel }}
          </button>
        }
      </div>
    }
    @if (rows.length === 0) {
      <p class="lt-empty">{{ emptyText }}</p>
    } @else {
      <div class="lt-scroll">
        <table class="lt-table">
          <thead>
            <tr>
              @if (rowIcon) {
                <th class="lt-icon-col"></th>
              }
              @for (c of columns; track c.label) {
                <th>{{ c.label }}</th>
              }
              @if (rowStatus) {
                <th>Stato</th>
              }
              <th class="lt-actions"></th>
            </tr>
          </thead>
          <tbody>
            @for (row of rows; track row.id) {
              <tr class="lt-row" tabindex="0" (click)="open.emit(row)" (keydown.enter)="open.emit(row)">
                @if (rowIcon) {
                  @let ic = rowIcon(row);
                  <td class="lt-icon-col">
                    @if (ic) {
                      <mat-icon [style.color]="ic.color ?? null">{{ ic.icon }}</mat-icon>
                    }
                  </td>
                }
                @for (c of columns; track c.label) {
                  <td>{{ c.value(row) }}</td>
                }
                @if (rowStatus) {
                  @let st = rowStatus(row);
                  <td>
                    @if (st) {
                      <app-status-badge [info]="st" size="sm"></app-status-badge>
                    }
                  </td>
                }
                <td class="lt-actions">
                  @if (unlinkable) {
                    <button mat-icon-button type="button" matTooltip="Scollega" (click)="onUnlink($event, row)">
                      <mat-icon>link_off</mat-icon>
                    </button>
                  }
                  <mat-icon class="lt-chevron">chevron_right</mat-icon>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
  styles: [`
    .lt-toolbar { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 12px; margin-bottom: 8px; }
    .lt-picker { flex: 1 1 320px; }
    .lt-link-btn { margin-top: 8px; }
    .lt-empty { color: var(--sheet-muted); margin: 0; }
    .lt-scroll { overflow-x: auto; }
    .lt-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    .lt-table th { text-align: left; font-weight: 600; color: var(--sheet-muted); padding: 6px 8px; border-bottom: 1px solid var(--sheet-border); white-space: nowrap; }
    .lt-table td { padding: 6px 8px; border-bottom: 1px solid #f3f4f6; }
    .lt-row { cursor: pointer; }
    .lt-row:hover, .lt-row:focus { background: #f9fafb; outline: none; }
    .lt-icon-col { width: 32px; }
    .lt-icon-col .mat-icon { font-size: 20px; width: 20px; height: 20px; vertical-align: middle; }
    .lt-actions { width: 1%; white-space: nowrap; text-align: right; }
    .lt-chevron { color: #9ca3af; vertical-align: middle; }
  `],
})
export class LinkedTableComponent<R extends LinkedRow> implements OnChanges {
  @Input({required: true}) columns: LinkedColumn<R>[] = [];
  @Input({required: true}) rows: R[] = [];
  @Input() addOptions: TOption[] | null = null;
  @Input() addLabel = 'Collega';
  @Input() createLabel: string | null = null;
  @Input() unlinkable = false;
  @Input() emptyText = 'Nessun elemento collegato.';
  @Input() rowIcon: ((row: R) => RowIcon | null) | null = null;
  @Input() rowStatus: ((row: R) => StatusInfo | null) | null = null;

  @Output() open = new EventEmitter<R>();
  @Output() add = new EventEmitter<number>();
  @Output() unlink = new EventEmitter<number>();
  @Output() create = new EventEmitter<void>();

  available: TOption[] = [];
  toAdd: number | null = null;

  ngOnChanges(): void {
    const linked = new Set(this.rows.map(r => r.id));
    this.available = (this.addOptions ?? []).filter(o => !linked.has(Number(o.value)));
  }

  confirmAdd(): void {
    if (this.toAdd === null) return;
    this.add.emit(Number(this.toAdd));
    this.toAdd = null;
  }

  onUnlink(event: Event, row: R): void {
    event.stopPropagation();
    this.unlink.emit(row.id);
  }
}

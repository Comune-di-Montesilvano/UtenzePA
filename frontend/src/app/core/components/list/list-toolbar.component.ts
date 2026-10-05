import {ChangeDetectionStrategy, Component, EventEmitter, Input, Output} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatSelectModule} from '@angular/material/select';
import {HasRoleDirective} from '../../directives/has-role.directive';

// "Elenco (N)" a sinistra; Colonne, Esporta CSV, + Nuovo a destra, sempre in quest'ordine.
@Component({
  selector: 'app-list-toolbar',
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatSelectModule, HasRoleDirective],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="lt">
      <h3 class="lt-count">Elenco ({{ count }})</h3>
      <span style="flex: 1;"></span>
      @if (columns) {
        <mat-form-field subscriptSizing="dynamic" class="lt-cols">
          <mat-label>Colonne visibili</mat-label>
          <mat-select multiple [ngModel]="selectedColumns" [compareWith]="compareColumns"
                      (ngModelChange)="selectedColumnsChange.emit($event)">
            @for (col of columns; track col.field) { <mat-option [value]="col">{{ col.header }}</mat-option> }
          </mat-select>
        </mat-form-field>
      }
      @if (exportable) {
        <button mat-stroked-button type="button" (click)="export.emit()"><mat-icon>ios_share</mat-icon> Esporta CSV</button>
      }
      @if (createLabel) {
        <button mat-flat-button type="button" (click)="create.emit()" [appHasRole]="['Admin', 'Operatore']">
          <mat-icon>add</mat-icon> {{ createLabel }}
        </button>
      }
    </div>
  `,
  styles: [`
    .lt { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
    .lt-count { margin: 0; }
    .lt-cols { min-width: 220px; }
  `],
})
export class ListToolbarComponent {
  @Input() count = 0;
  @Input() createLabel: string | null = null;
  @Input() exportable = false;
  @Input() columns: IColumnDef[] | null = null;
  @Input() selectedColumns: IColumnDef[] = [];
  @Input() compareColumns: (a: IColumnDef, b: IColumnDef) => boolean = (a, b) => a?.field === b?.field;
  @Output() create = new EventEmitter<void>();
  @Output() export = new EventEmitter<void>();
  @Output() selectedColumnsChange = new EventEmitter<IColumnDef[]>();
}

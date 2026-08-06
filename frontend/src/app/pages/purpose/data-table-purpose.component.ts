import {Component, Type} from '@angular/core';
import {MatTableModule} from '@angular/material/table';
import {MatSortModule} from '@angular/material/sort';
import {MatPaginatorModule} from '@angular/material/paginator';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';
import {ScreenSizeService} from '../../services/screen-size.service';
import {Purpose} from './entity/purpose.entity';
import {UseType, UseTypeDescription} from './enum/use-type.enum';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {PurposeEditDialogComponent} from './purpose-edit-dialog.component';

@Component({
  selector: 'app-data-table-purpose',
  standalone: true,
  imports: [
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressBarModule,
    HasRoleDirective,
    ReadOnlyDirective
  ],
  templateUrl: './data-table-purpose.component.html'
})
export class DataTablePurposeComponent extends AbstractDataTableComponent<Purpose> {

  displayedColumns = ['actions', 'id', 'name', 'use_type'];
  useTypeDescription = UseTypeDescription;

  constructor(screen: ScreenSizeService) {
    super(screen);
  }

  override itemInstance(): Purpose {
    return Purpose.create();
  }

  override editDialogComponent(): Type<unknown> {
    return PurposeEditDialogComponent;
  }

  protected override entityLabel(): string {
    return `finalità d'uso`;
  }

  getUseTypeDescription(value: any): string {
    return this.useTypeDescription[value as UseType] || value;
  }
}

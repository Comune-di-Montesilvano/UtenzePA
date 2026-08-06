import {Component, Type} from '@angular/core';
import {CommonModule} from '@angular/common';
import {MatTableModule} from '@angular/material/table';
import {MatSortModule} from '@angular/material/sort';
import {MatPaginatorModule} from '@angular/material/paginator';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';
import {Utilizer} from './entity/utilizer.entity';
import {ScreenSizeService} from '../../services/screen-size.service';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {UtilizerEditDialogComponent} from './utilizer-edit-dialog.component';

@Component({
  selector: 'app-data-table-utilizer',
  standalone: true,
  imports: [
    CommonModule,
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
  templateUrl: './data-table-utilizer.component.html',
})
export class DataTableUtilizerComponent extends AbstractDataTableComponent<Utilizer> {

  displayedColumns = ['actions', 'id', 'name', 'description'];

  constructor(screen: ScreenSizeService) {
    super(screen);
  }

  override itemInstance(): Utilizer {
    return Utilizer.create();
  }

  override editDialogComponent(): Type<unknown> {
    return UtilizerEditDialogComponent;
  }

  protected override entityLabel(): string {
    return 'utilizzatore';
  }
}

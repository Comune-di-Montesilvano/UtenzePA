import {Component, Type} from '@angular/core';
import {DatePipe} from '@angular/common';
import {MatTableModule} from '@angular/material/table';
import {MatSortModule} from '@angular/material/sort';
import {MatPaginatorModule} from '@angular/material/paginator';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ScreenSizeService} from '../../services/screen-size.service';
import {SystemUser} from './entity/system-user.entity';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {SystemUserEditDialogComponent} from './system-user-edit-dialog.component';
import {ConfirmDialogComponent} from '../../core/components/confirm-dialog.component';

@Component({
  selector: 'app-data-table-users',
  standalone: true,
  imports: [
    DatePipe,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressBarModule,
    HasRoleDirective
  ],
  templateUrl: './data-table-users.component.html'
})
export class DataTableUsersComponent extends AbstractDataTableComponent<SystemUser> {

  displayedColumns = ['actions', 'id', 'firstName', 'lastName', 'email', 'role', 'status', 'create_date'];

  constructor(screen: ScreenSizeService) {
    super(screen);
  }

  override itemInstance(): SystemUser {
    return SystemUser.create({role: 'Operatore', status: 'Attivo'});
  }

  override editDialogComponent(): Type<unknown> {
    return SystemUserEditDialogComponent;
  }

  protected override entityLabel(): string {
    return 'utente';
  }

  override openDeleteDialog(entity: SystemUser): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Elimina utente',
        message: `Vuoi eliminare ${entity.firstName} ${entity.lastName}?`,
        confirmLabel: 'Elimina',
        danger: true
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onDelete.emit(entity);
    });
  }
}

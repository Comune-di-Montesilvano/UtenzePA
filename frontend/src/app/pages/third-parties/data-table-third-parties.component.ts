import {ChangeDetectionStrategy, Component, Type} from '@angular/core';
import {MatTableModule} from '@angular/material/table';
import {MatSortModule} from '@angular/material/sort';
import {MatPaginatorModule} from '@angular/material/paginator';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ScreenSizeService} from '../../services/screen-size.service';
import {ListToolbarComponent} from '../../core/components/list/list-toolbar.component';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {ConfirmDialogComponent} from '../../core/components/confirm-dialog.component';
import {StatusBadgeComponent} from '../../core/components/entity-sheet/status-badge.component';
import {partyRoleBadges} from '../../core/helpers/entity-status';
import {partyName} from '../../core/helpers/party-name.helper';
import {ThirdParty} from './entity/third-party.entity';
import {partyIdentifier, TYPE_LABEL} from './third-party.model';
import {ThirdPartyEditDialogComponent} from './third-party-edit-dialog.component';

@Component({
  selector: 'app-data-table-third-parties',
  standalone: true,
  imports: [ListToolbarComponent, 
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressBarModule,
    HasRoleDirective,
    StatusBadgeComponent,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './data-table-third-parties.component.html',
})
export class DataTableThirdPartiesComponent extends AbstractDataTableComponent<ThirdParty> {

  displayedColumns = ['actions', 'name', 'type', 'identifier', 'roles', 'city'];
  readonly partyName = partyName;
  readonly partyIdentifier = partyIdentifier;
  readonly typeText = (p: ThirdParty): string => TYPE_LABEL[p.type] ?? '';
  readonly roleBadges = partyRoleBadges;

  constructor(screen: ScreenSizeService) {
    super(screen);
    // Nome e identificativo dipendono dal tipo: si ordina sul valore mostrato.
    this.dataSource.sortingDataAccessor = (item: ThirdParty, column: string): string | number => {
      switch (column) {
        case 'name': return partyName(item).toLowerCase();
        case 'identifier': return partyIdentifier(item);
        case 'type': return TYPE_LABEL[item.type] ?? '';
        default: return ((item as unknown as Record<string, unknown>)[column] as string) ?? '';
      }
    };
  }

  override itemInstance(): ThirdParty {
    return ThirdParty.create();
  }

  override editDialogComponent(): Type<unknown> {
    return ThirdPartyEditDialogComponent;
  }

  protected override useSheet(): boolean {
    return true;
  }

  protected override entityLabel(): string {
    return 'soggetto';
  }

  override openDeleteDialog(entity: ThirdParty): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Elimina soggetto',
        message: `Eliminare ${partyName(entity)}?`,
        confirmLabel: 'Elimina',
        danger: true
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onDelete.emit(entity);
    });
  }

  override restoreItem(entity: ThirdParty): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Ripristina soggetto',
        message: `Riattivare ${partyName(entity)}?`,
        confirmLabel: 'Ripristina'
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onRestore.emit(entity);
    });
  }
}

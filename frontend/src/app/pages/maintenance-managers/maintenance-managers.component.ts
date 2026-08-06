import {Component} from '@angular/core';
import {CommonModule} from '@angular/common';
import {MaintenanceManagersService} from './maintenance-managers.service';
import {DataTableMaintenanceManagersComponent} from './data-table-maintenance-managers.component';
import {SearchFormMaintenanceManagers} from './search-maintenance-managers.component';
import {AbstractComponent} from '../../core/components/abstract.component';
import {MaintenanceManager} from './entity/maintenance-manager.entity';

@Component({
  selector: 'app-maintenance-managers',
  standalone: true,
  imports: [
    CommonModule,
    DataTableMaintenanceManagersComponent,
    SearchFormMaintenanceManagers
  ],
  templateUrl: './maintenance-managers.component.html'
})
export class MaintenanceManagersComponent extends AbstractComponent<MaintenanceManager> {

  constructor(protected override service: MaintenanceManagersService) {
    super();
  }

  protected override getEntityIdentifier(entity: MaintenanceManager): string {
    return entity.code;
  }

  protected override entityToPayload(entity: MaintenanceManager): Partial<MaintenanceManager> {
    return {
      code: entity.code,
      description: entity.description,
      created_by_user_id: this.userId,
      updated_by_user_id: this.userId
    };
  }
}

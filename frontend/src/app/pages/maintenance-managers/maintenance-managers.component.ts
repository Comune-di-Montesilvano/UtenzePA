import {Component} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {InputTextModule} from 'primeng/inputtext';
import {ButtonModule} from 'primeng/button';
import {TableModule} from 'primeng/table';
import {MessageService} from 'primeng/api';
import {ToastModule} from 'primeng/toast';
import {MaintenanceManagersService} from './maintenance-managers.service';
import {DataTableMaintenanceManagersComponent} from './data-table-maintenance-managers.component';
import {SearchFormMaintenanceManagers} from './search-maintenance-managers.component';
import {AbstractComponent} from '../../core/components/abstract.component';
import {MaintenanceManager} from './entity/maintenance-manager.entity';


@Component({
             selector: 'app-maintenance-managers',
             standalone: true,
             providers: [MessageService],
             imports: [
               CommonModule,
               FormsModule,
               InputTextModule,
               ButtonModule,
               TableModule,
               DataTableMaintenanceManagersComponent,
               ToastModule,
               SearchFormMaintenanceManagers
             ],
             templateUrl: './maintenance-managers.component.html'
           })
export class MaintenanceManagersComponent extends AbstractComponent<MaintenanceManager> {

  creationResult?: { success: boolean; message?: string };

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

  override onCreate(entity: MaintenanceManager) {
    const payload = this.entityToPayload(entity);
    this.service.create(payload).subscribe(
      {
        next: (item) => {
          this.list.push(item);
          this.messageService.add(
            {
              severity: 'success',
              summary: 'Gestore creato',
              detail: item.code,
              key: 'global'
            });
          this.loadAll();
          this.creationResult = {
            success: true,
            message: 'Gestore creato con successo'
          };
        },
        error: (err) => {
          this.handleError(err, 'Errore generico nella creazione gestore');
          this.creationResult = {success: false};
        }
      });
  }
}

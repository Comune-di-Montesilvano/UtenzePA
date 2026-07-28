import {Injectable} from '@angular/core';
import {environment} from '../../../environments/environment';
import {AbstractService} from '../../core/services/abstract.service';
import {MaintenanceManager} from './entity/maintenance-manager.entity';

@Injectable({
              providedIn: 'root'
            })
export class MaintenanceManagersService extends AbstractService<MaintenanceManager> {
  protected override readonly BASE_URL = environment.apiUrl + '/maintenance-managers';
  protected override readonly entityClass = MaintenanceManager;
}

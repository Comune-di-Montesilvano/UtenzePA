import {Injectable} from '@angular/core';
import {environment} from '../../../environments/environment';
import {CostsBorneBy} from './entity/costs-borne-by.entity';
import {AbstractService} from '../../core/services/abstract.service';

@Injectable({
  providedIn: 'root'
})
export class CostsBorneByService extends AbstractService<CostsBorneBy> {
  protected override readonly BASE_URL = environment.apiUrl + '/costs-borne-by';
  protected override readonly entityClass = CostsBorneBy;
}

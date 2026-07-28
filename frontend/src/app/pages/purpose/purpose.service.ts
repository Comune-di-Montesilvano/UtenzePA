import {Injectable} from '@angular/core';
import {environment} from '../../../environments/environment';
import {Purpose} from './entity/purpose.entity';
import {AbstractService} from '../../core/services/abstract.service';

@Injectable({
              providedIn: 'root'
            })
export class PurposeService extends AbstractService<Purpose> {
  protected override readonly BASE_URL = environment.apiUrl + '/purpose';
  protected override readonly entityClass = Purpose;
}

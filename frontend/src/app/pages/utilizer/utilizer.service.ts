import {Injectable} from '@angular/core';
import {environment} from '../../../environments/environment';
import {AbstractService} from '../../core/services/abstract.service';
import {Utilizer} from './entity/utilizer.entity';

@Injectable({
              providedIn: 'root',
            })
export class UtilizerService extends AbstractService<Utilizer> {
  protected override readonly BASE_URL = environment.apiUrl + '/utilizer';
  protected override readonly entityClass = Utilizer;
}

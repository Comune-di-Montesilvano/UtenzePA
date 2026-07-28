import {Injectable} from '@angular/core';
import {environment} from '../../../environments/environment';
import {UtilityType} from './entity/utility-type.entity';
import {AbstractService} from '../../core/services/abstract.service';

@Injectable({
              providedIn: 'root'
            })
export class UtilityTypesService extends AbstractService<UtilityType> {
  protected override readonly BASE_URL = environment.apiUrl + '/utility-types';
  protected override readonly entityClass = UtilityType;
}

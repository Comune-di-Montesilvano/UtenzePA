import {Injectable} from '@angular/core';
import {environment} from '../../../environments/environment';
import {AbstractService} from '../../core/services/abstract.service';
import {UtilizerGrant} from './entity/utilizer-grant.entity';
import {TOption} from '../../core/types/option.interface';

@Injectable({
              providedIn: 'root',
            })
export class UtilizerGrantService extends AbstractService<UtilizerGrant> {
  protected override readonly BASE_URL = environment.apiUrl + '/utilizer-grant';
  protected override readonly entityClass = UtilizerGrant;

  usageTypeOptions(): TOption[] {
    return [
      {label: 'Abitazione', value: 'Abitazione'},
      {label: 'Ufficio', value: 'Ufficio'},
      {label: 'Commerciale', value: 'Commerciale'},
      {label: 'Agricolo', value: 'Agricolo'},
    ];
  }
}

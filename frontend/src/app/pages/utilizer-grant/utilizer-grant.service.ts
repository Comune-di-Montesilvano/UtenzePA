import {Injectable} from '@angular/core';
import {environment} from '../../../environments/environment';
import {AbstractService} from '../../core/services/abstract.service';
import {UtilizerGrant} from './entity/utilizer-grant.entity';
import {TOption} from '../../core/types/option.interface';
import {Observable} from 'rxjs';
import {ContractSummary} from './real-estate-contract.model';

@Injectable({
              providedIn: 'root',
            })
export class UtilizerGrantService extends AbstractService<UtilizerGrant> {
  protected override readonly BASE_URL = environment.apiUrl + '/utilizer-grant';
  protected override readonly entityClass = UtilizerGrant;

  // Avvisi e totali annui per la dashboard.
  summary(): Observable<ContractSummary> {
    return this.http.get<ContractSummary>(`${this.BASE_URL}/summary`, {headers: this.getAuthHeaders()});
  }

  usageTypeOptions(): TOption[] {
    return [
      {label: 'Abitazione', value: 'Abitazione'},
      {label: 'Ufficio', value: 'Ufficio'},
      {label: 'Commerciale', value: 'Commerciale'},
      {label: 'Agricolo', value: 'Agricolo'},
    ];
  }
}

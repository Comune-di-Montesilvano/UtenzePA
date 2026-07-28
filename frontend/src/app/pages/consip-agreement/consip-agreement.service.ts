import {Injectable} from '@angular/core';
import {environment} from '../../../environments/environment';
import {ConsipAgreement} from './entity/consip-agreement.entity';
import {AbstractService} from '../../core/services/abstract.service';

@Injectable({
              providedIn: 'root'
            })
export class ConsipAgreementService extends AbstractService<ConsipAgreement> {
  protected override readonly BASE_URL = environment.apiUrl + '/consip-agreement';
  protected override readonly entityClass = ConsipAgreement;
}

import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AbstractService } from '../../core/services/abstract.service';
import { Contract } from './entity/contract.entity';

@Injectable({ providedIn: 'root' })
export class ContractsService extends AbstractService<Contract> {
  protected override readonly BASE_URL = environment.apiUrl + '/contracts';
  protected override readonly entityClass = Contract;
}

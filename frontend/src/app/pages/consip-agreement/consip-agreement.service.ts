import {Injectable} from '@angular/core';
import {map, Observable} from 'rxjs';
import {plainToInstance} from 'class-transformer';
import {environment} from '../../../environments/environment';
import {ConsipAgreement} from './entity/consip-agreement.entity';
import {AbstractService} from '../../core/services/abstract.service';
import {Commitment} from '../commitments/commitment.model';

export interface AgreementCommitments {
  items: Commitment[];
  totals: {amount: number; spent: number; remaining: number};
}

@Injectable({
              providedIn: 'root'
            })
export class ConsipAgreementService extends AbstractService<ConsipAgreement> {
  protected override readonly BASE_URL = environment.apiUrl + '/consip-agreement';
  protected override readonly entityClass = ConsipAgreement;

  // Impegni dei contratti della convenzione, con i totali.
  commitments(id: number): Observable<AgreementCommitments> {
    return this.http.get<{items: unknown[]; totals: AgreementCommitments['totals']}>(
      `${this.BASE_URL}/${id}/commitments`, {headers: this.getAuthHeaders()},
    ).pipe(map(r => ({items: plainToInstance(Commitment, r.items), totals: r.totals})));
  }

  linkContract(id: number, contractId: number): Observable<unknown> {
    return this.http.post(`${this.BASE_URL}/${id}/contracts/${contractId}`, {}, {headers: this.getAuthHeaders()});
  }

  unlinkContract(id: number, contractId: number): Observable<unknown> {
    return this.http.delete(`${this.BASE_URL}/${id}/contracts/${contractId}`, {headers: this.getAuthHeaders()});
  }
}

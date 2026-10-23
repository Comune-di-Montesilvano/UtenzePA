import {Injectable} from '@angular/core';
import {map, Observable} from 'rxjs';
import {plainToInstance} from 'class-transformer';
import {environment} from '../../../environments/environment';
import {AbstractService} from '../../core/services/abstract.service';
import {Commitment, CommitmentLine} from './commitment.model';

@Injectable({providedIn: 'root'})
export class CommitmentService extends AbstractService<Commitment> {
  protected override readonly BASE_URL = environment.apiUrl + '/commitments';
  protected override readonly entityClass = Commitment;

  // Righe di fattura assegnate, in ordine di consumo con speso progressivo.
  lines(id: number): Observable<CommitmentLine[]> {
    return this.http.get<CommitmentLine[]>(`${this.BASE_URL}/${id}/lines`, {headers: this.getAuthHeaders()});
  }

  byContract(contractId: number): Observable<Commitment[]> {
    return this.http
      .get<unknown[]>(`${environment.apiUrl}/contracts/${contractId}/commitments`, {headers: this.getAuthHeaders()})
      .pipe(map(rows => plainToInstance(Commitment, rows)));
  }
}

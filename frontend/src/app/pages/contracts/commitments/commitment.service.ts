import {inject, Injectable} from '@angular/core';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import {Observable} from 'rxjs';
import {environment} from '../../../../environments/environment';
import {AuthService} from '../../../services/auth.service';
import {Commitment, CommitmentPayload} from './commitment.model';

// Route annidate: non estende AbstractService, header Authorization a mano
// (nessun interceptor lo aggiunge, vedi CLAUDE.md).
@Injectable({providedIn: 'root'})
export class CommitmentService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private readonly api = environment.apiUrl;

  private headers(): HttpHeaders {
    return new HttpHeaders({Authorization: `Bearer ${this.auth.getToken() || ''}`});
  }

  list(contractId: number): Observable<Commitment[]> {
    return this.http.get<Commitment[]>(`${this.api}/contracts/${contractId}/commitments`, {headers: this.headers()});
  }

  create(contractId: number, payload: CommitmentPayload): Observable<Commitment> {
    return this.http.post<Commitment>(`${this.api}/contracts/${contractId}/commitments`, payload, {headers: this.headers()});
  }

  update(id: number, payload: Partial<CommitmentPayload>): Observable<Commitment> {
    return this.http.patch<Commitment>(`${this.api}/commitments/${id}`, payload, {headers: this.headers()});
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/commitments/${id}`, {headers: this.headers()});
  }
}

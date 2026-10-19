import {inject, Injectable} from '@angular/core';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import {Observable} from 'rxjs';
import {environment} from '../../../../environments/environment';
import {AuthService} from '../../../services/auth.service';
import {GrantDecisionRow, SetDecisionBody, SupplyEventPayload, SupplyEventsList} from './supply.model';

// Non estende AbstractService: header Authorization messo a mano (nessun
// interceptor lo aggiunge, vedi CLAUDE.md). Le scritture rispondono con lo
// storico (o le decisioni) aggiornati: la riconciliazione può aver toccato
// altre righe.
@Injectable({providedIn: 'root'})
export class SupplyService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private readonly BASE_URL = `${environment.apiUrl}/utility-supply`;

  private headers(): HttpHeaders {
    return new HttpHeaders({Authorization: `Bearer ${this.auth.getToken() || ''}`});
  }

  events(utilityId: number): Observable<SupplyEventsList> {
    return this.http.get<SupplyEventsList>(`${this.BASE_URL}/utilities/${utilityId}/events`, {headers: this.headers()});
  }

  create(payload: SupplyEventPayload): Observable<SupplyEventsList> {
    return this.http.post<SupplyEventsList>(`${this.BASE_URL}/events`, payload, {headers: this.headers()});
  }

  update(id: number, payload: SupplyEventPayload): Observable<SupplyEventsList> {
    return this.http.patch<SupplyEventsList>(`${this.BASE_URL}/events/${id}`, payload, {headers: this.headers()});
  }

  cancel(id: number): Observable<SupplyEventsList> {
    return this.http.post<SupplyEventsList>(`${this.BASE_URL}/events/${id}/cancel`, {}, {headers: this.headers()});
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${this.BASE_URL}/events/${id}`, {headers: this.headers()});
  }

  decisions(grantId: number): Observable<GrantDecisionRow[]> {
    return this.http.get<GrantDecisionRow[]>(`${this.BASE_URL}/grants/${grantId}/decisions`, {headers: this.headers()});
  }

  setDecision(grantId: number, utilityId: number, body: SetDecisionBody): Observable<GrantDecisionRow[]> {
    return this.http.put<GrantDecisionRow[]>(`${this.BASE_URL}/grants/${grantId}/decisions/${utilityId}`, body, {headers: this.headers()});
  }

  applyProposal(grantId: number): Observable<GrantDecisionRow[]> {
    return this.http.post<GrantDecisionRow[]>(`${this.BASE_URL}/grants/${grantId}/decisions/apply-proposal`, {}, {headers: this.headers()});
  }
}

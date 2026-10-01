import {inject, Injectable} from '@angular/core';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import {Observable} from 'rxjs';
import {environment} from '../../../../environments/environment';
import {AuthService} from '../../../services/auth.service';
import {ChapterConsumptionSummaryRow, ConsumptionPayload, ConsumptionSummary, UtilityConsumption} from './consumption.model';

// Non estende AbstractService (route annidate): header Authorization messo
// a mano, nessun interceptor lo aggiunge (vedi CLAUDE.md, bug BrandingService).
@Injectable({providedIn: 'root'})
export class UtilityConsumptionService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private readonly api = environment.apiUrl;

  private headers(): HttpHeaders {
    return new HttpHeaders({Authorization: `Bearer ${this.auth.getToken() || ''}`});
  }

  list(utilityId: number): Observable<UtilityConsumption[]> {
    return this.http.get<UtilityConsumption[]>(`${this.api}/utilities/${utilityId}/consumptions`, {headers: this.headers()});
  }

  summary(utilityId: number): Observable<ConsumptionSummary> {
    return this.http.get<ConsumptionSummary>(`${this.api}/utilities/${utilityId}/consumption-summary`, {headers: this.headers()});
  }

  create(utilityId: number, payload: ConsumptionPayload): Observable<UtilityConsumption> {
    return this.http.post<UtilityConsumption>(`${this.api}/utilities/${utilityId}/consumptions`, payload, {headers: this.headers()});
  }

  update(id: number, payload: ConsumptionPayload): Observable<UtilityConsumption> {
    return this.http.patch<UtilityConsumption>(`${this.api}/utility-consumptions/${id}`, payload, {headers: this.headers()});
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/utility-consumptions/${id}`, {headers: this.headers()});
  }

  chapterSummary(chapterId: number): Observable<ChapterConsumptionSummaryRow[]> {
    return this.http.get<ChapterConsumptionSummaryRow[]>(`${this.api}/budget-chapters/${chapterId}/consumption-summary`, {headers: this.headers()});
  }
}

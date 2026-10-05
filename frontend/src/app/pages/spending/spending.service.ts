import {inject, Injectable} from '@angular/core';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import {Observable} from 'rxjs';
import {environment} from '../../../environments/environment';
import {AuthService} from '../../services/auth.service';
import {AssetSpending, ChapterSummary, YearSpending} from './spending.model';

// Spesa calcolata dalle fatture (sola lettura). Header Authorization a mano.
@Injectable({providedIn: 'root'})
export class SpendingService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private readonly api = environment.apiUrl;

  private headers(): HttpHeaders {
    return new HttpHeaders({Authorization: `Bearer ${this.auth.getToken() || ''}`});
  }

  utility(id: number): Observable<YearSpending[]> {
    return this.http.get<YearSpending[]>(`${this.api}/utilities/${id}/spending`, {headers: this.headers()});
  }

  asset(id: number): Observable<AssetSpending> {
    return this.http.get<AssetSpending>(`${this.api}/assets/${id}/spending`, {headers: this.headers()});
  }

  contractChapters(id: number): Observable<ChapterSummary[]> {
    return this.http.get<ChapterSummary[]>(`${this.api}/contracts/${id}/chapters-summary`, {headers: this.headers()});
  }
}

import {inject, Injectable} from '@angular/core';
import {HttpClient, HttpHeaders, HttpParams} from '@angular/common/http';
import {Observable} from 'rxjs';
import {environment} from '../../../environments/environment';
import {AuthService} from '../../services/auth.service';
import {Complex, ComplexPayload} from './complex.model';
import type {Utility} from '../utilities/entity/utility.entity';
import type {Plant} from '../plants/plant.model';
import type {UtilizerGrant} from '../utilizer-grant/entity/utilizer-grant.entity';

export type ComplexFilters = Record<string, string | number | null | undefined>;

// Non estende AbstractService (rotte annidate): header Authorization a mano,
// l'interceptor non lo aggiunge (vedi CLAUDE.md).
@Injectable({providedIn: 'root'})
export class ComplexService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private readonly api = `${environment.apiUrl}/complexes`;

  private headers(): HttpHeaders {
    return new HttpHeaders({Authorization: `Bearer ${this.auth.getToken() || ''}`});
  }

  list(filters: ComplexFilters = {}): Observable<Complex[]> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== '') params = params.set(key, String(value));
    }
    return this.http.get<Complex[]>(this.api, {headers: this.headers(), params});
  }

  get(id: number): Observable<Complex> {
    return this.http.get<Complex>(`${this.api}/${id}`, {headers: this.headers()});
  }

  create(payload: ComplexPayload): Observable<Complex> {
    return this.http.post<Complex>(this.api, payload, {headers: this.headers()});
  }

  update(id: number, payload: Partial<ComplexPayload>): Observable<Complex> {
    return this.http.patch<Complex>(`${this.api}/${id}`, payload, {headers: this.headers()});
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/${id}`, {headers: this.headers()});
  }

  utilities(id: number): Observable<Utility[]> {
    return this.http.get<Utility[]>(`${this.api}/${id}/utilities`, {headers: this.headers()});
  }

  plants(id: number): Observable<Plant[]> {
    return this.http.get<Plant[]>(`${this.api}/${id}/plants`, {headers: this.headers()});
  }

  grants(id: number): Observable<UtilizerGrant[]> {
    return this.http.get<UtilizerGrant[]>(`${this.api}/${id}/grants`, {headers: this.headers()});
  }
}

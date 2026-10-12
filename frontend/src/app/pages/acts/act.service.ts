import {inject, Injectable} from '@angular/core';
import {HttpClient, HttpHeaders, HttpParams} from '@angular/common/http';
import {Observable} from 'rxjs';
import {environment} from '../../../environments/environment';
import {AuthService} from '../../services/auth.service';
import {Act, ActLinkEntity, ActPayload, ActType} from './act.model';

export type ActFilters = Record<string, string | number | boolean | null | undefined>;

// Non estende AbstractService (rotte annidate): header Authorization a mano.
@Injectable({providedIn: 'root'})
export class ActService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private readonly api = `${environment.apiUrl}/acts`;
  private readonly typesApi = `${environment.apiUrl}/act-types`;

  private headers(): HttpHeaders {
    return new HttpHeaders({Authorization: `Bearer ${this.auth.getToken() || ''}`});
  }

  list(filters: ActFilters = {}): Observable<Act[]> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== '') params = params.set(key, String(value));
    }
    return this.http.get<Act[]>(this.api, {headers: this.headers(), params});
  }

  get(id: number): Observable<Act> {
    return this.http.get<Act>(`${this.api}/${id}`, {headers: this.headers()});
  }

  create(payload: ActPayload): Observable<Act> {
    return this.http.post<Act>(this.api, payload, {headers: this.headers()});
  }

  update(id: number, payload: Partial<ActPayload>): Observable<Act> {
    return this.http.patch<Act>(`${this.api}/${id}`, payload, {headers: this.headers()});
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/${id}`, {headers: this.headers()});
  }

  restore(id: number): Observable<Act> {
    return this.http.post<Act>(`${this.api}/${id}/restore`, {}, {headers: this.headers()});
  }

  byEntity(entity: ActLinkEntity, id: number): Observable<Act[]> {
    return this.http.get<Act[]>(`${this.api}/by-entity/${entity}/${id}`, {headers: this.headers()});
  }

  link(id: number, entity: ActLinkEntity, entityId: number): Observable<void> {
    return this.http.post<void>(`${this.api}/${id}/links`, {entity, id: entityId}, {headers: this.headers()});
  }

  unlink(id: number, entity: ActLinkEntity, entityId: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/${id}/links`, {headers: this.headers(), body: {entity, id: entityId}});
  }

  types(): Observable<ActType[]> {
    return this.http.get<ActType[]>(this.typesApi, {headers: this.headers()});
  }

  createType(payload: {name: string; sort_order?: number}): Observable<ActType> {
    return this.http.post<ActType>(this.typesApi, payload, {headers: this.headers()});
  }

  updateType(id: number, payload: Partial<{name: string; sort_order: number}>): Observable<ActType> {
    return this.http.patch<ActType>(`${this.typesApi}/${id}`, payload, {headers: this.headers()});
  }

  deleteType(id: number): Observable<void> {
    return this.http.delete<void>(`${this.typesApi}/${id}`, {headers: this.headers()});
  }
}

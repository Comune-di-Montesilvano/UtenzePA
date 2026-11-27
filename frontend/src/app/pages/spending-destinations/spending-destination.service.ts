import {inject, Injectable} from '@angular/core';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import {Observable} from 'rxjs';
import {environment} from '../../../environments/environment';
import {AuthService} from '../../services/auth.service';

export interface SpendingDestination {
  id: number;
  name: string;
  notes: string | null;
  assets: number;
  plants: number;
  chapters: number;
  utilities: number;
}

export interface DestinationSuggestion {
  asset_id: number;
  label: string;
  destination_id: number;
  utilities: number;
}

// Opzioni per «Destinazione di spesa» nelle schede (nessuna = nessuna destinazione).
export function destinationOptions(list: SpendingDestination[]): {label: string; value: number; sublabel?: string}[] {
  return list
    .map(d => ({label: d.name, value: d.id, sublabel: d.notes || undefined}))
    .sort((a, b) => a.label.localeCompare(b.label, 'it'));
}

// Non estende AbstractService: header Authorization a mano.
@Injectable({providedIn: 'root'})
export class SpendingDestinationService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private readonly api = `${environment.apiUrl}/spending-destinations`;

  private headers(): HttpHeaders {
    return new HttpHeaders({Authorization: `Bearer ${this.auth.getToken() || ''}`});
  }

  list(): Observable<SpendingDestination[]> {
    return this.http.get<SpendingDestination[]>(this.api, {headers: this.headers()});
  }

  create(payload: {name: string; notes?: string | null}): Observable<SpendingDestination> {
    return this.http.post<SpendingDestination>(this.api, payload, {headers: this.headers()});
  }

  update(id: number, payload: {name?: string; notes?: string | null}): Observable<SpendingDestination> {
    return this.http.patch<SpendingDestination>(`${this.api}/${id}`, payload, {headers: this.headers()});
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/${id}`, {headers: this.headers()});
  }

  suggestions(): Observable<DestinationSuggestion[]> {
    return this.http.get<DestinationSuggestion[]>(`${this.api}/suggestions`, {headers: this.headers()});
  }

  assignAssets(id: number, assetIds: number[]): Observable<{assigned: number}> {
    return this.http.post<{assigned: number}>(`${this.api}/${id}/assets`, {asset_ids: assetIds}, {headers: this.headers()});
  }
}

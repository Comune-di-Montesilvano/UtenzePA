import {inject, Injectable} from '@angular/core';
import {HttpClient, HttpHeaders, HttpParams} from '@angular/common/http';
import {Observable} from 'rxjs';
import {environment} from '../../../environments/environment';
import {AuthService} from '../../services/auth.service';
import {
  Plant,
  PlantFireEquipment,
  PlantFireEquipmentPayload,
  PlantInspection,
  PlantInspectionPayload,
  PlantPayload,
  PlantSummary,
} from './plant.model';

export type PlantFilters = Record<string, string | number | null | undefined>;

// Non estende AbstractService (route annidate per verifiche e presidi):
// header Authorization messo a mano, nessun interceptor lo aggiunge (vedi
// CLAUDE.md, bug BrandingService).
@Injectable({providedIn: 'root'})
export class PlantService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private readonly api = `${environment.apiUrl}/plants`;

  private headers(): HttpHeaders {
    return new HttpHeaders({Authorization: `Bearer ${this.auth.getToken() || ''}`});
  }

  list(filters: PlantFilters = {}): Observable<Plant[]> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== '') params = params.set(key, String(value));
    }
    return this.http.get<Plant[]>(this.api, {headers: this.headers(), params});
  }

  get(id: number): Observable<Plant> {
    return this.http.get<Plant>(`${this.api}/${id}`, {headers: this.headers()});
  }

  summary(): Observable<PlantSummary> {
    return this.http.get<PlantSummary>(`${this.api}/summary`, {headers: this.headers()});
  }

  create(payload: PlantPayload): Observable<Plant> {
    return this.http.post<Plant>(this.api, payload, {headers: this.headers()});
  }

  update(id: number, payload: Partial<PlantPayload>): Observable<Plant> {
    return this.http.patch<Plant>(`${this.api}/${id}`, payload, {headers: this.headers()});
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/${id}`, {headers: this.headers()});
  }

  addInspection(plantId: number, payload: Partial<PlantInspectionPayload>): Observable<PlantInspection> {
    return this.http.post<PlantInspection>(`${this.api}/${plantId}/inspections`, payload, {headers: this.headers()});
  }

  updateInspection(id: number, payload: Partial<PlantInspectionPayload>): Observable<PlantInspection> {
    return this.http.patch<PlantInspection>(`${this.api}/inspections/${id}`, payload, {headers: this.headers()});
  }

  deleteInspection(id: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/inspections/${id}`, {headers: this.headers()});
  }

  addFireEquipment(plantId: number, payload: Partial<PlantFireEquipmentPayload>): Observable<PlantFireEquipment> {
    return this.http.post<PlantFireEquipment>(`${this.api}/${plantId}/fire-equipment`, payload, {headers: this.headers()});
  }

  updateFireEquipment(id: number, payload: Partial<PlantFireEquipmentPayload>): Observable<PlantFireEquipment> {
    return this.http.patch<PlantFireEquipment>(`${this.api}/fire-equipment/${id}`, payload, {headers: this.headers()});
  }

  deleteFireEquipment(id: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/fire-equipment/${id}`, {headers: this.headers()});
  }
}

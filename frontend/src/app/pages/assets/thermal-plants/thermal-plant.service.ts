import {inject, Injectable} from '@angular/core';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import {Observable} from 'rxjs';
import {environment} from '../../../../environments/environment';
import {AuthService} from '../../../services/auth.service';

export interface ThermalPlantPayload {
  name: string;
  utility_id_fk: number | null;
  power_kw: number | null;
  generators_description: string | null;
  vvf_certification: string | null;
  vvf_exempt: boolean;
  inail_certification: string | null;
  inail_exempt: boolean;
  served_area_sqm: number | null;
  water_room: boolean | null;
  outdoor_units: number | null;
  indoor_units: number | null;
  fan_coils: number | null;
  air_handling_units: number | null;
  chillers_heat_pumps: number | null;
  notes: string | null;
}

export interface ThermalPlant extends ThermalPlantPayload {
  id: number;
  asset_id_fk: number;
  // Obblighi derivati dalla potenza, calcolati dal backend.
  efficiency_check_required: boolean;
  inail_required: boolean;
  vvf_required: boolean;
  utility?: {id: number; utility_id: string} | null;
  asset?: {id: number; asset_name: string; associated_building?: string | null} | null;
}

// Stato di una certificazione rispetto all'obbligo derivato dalla potenza.
export function certificationStatus(
  required: boolean, exempt: boolean, value: string | null,
): {text: string; bg: string; fg: string} {
  if (value?.trim()) return {text: value.trim(), bg: '#dcfce7', fg: '#166534'};
  if (exempt) return {text: 'Esente', bg: '#f3f4f6', fg: '#374151'};
  if (required) return {text: 'Richiesta, mancante', bg: '#fee2e2', fg: '#991b1b'};
  return {text: 'Non richiesta', bg: '#f3f4f6', fg: '#374151'};
}

// Certificazione richiesta dalla potenza ma né registrata né esente.
export function missingCertifications(p: ThermalPlant): string[] {
  const missing: string[] = [];
  if (p.vvf_required && !p.vvf_exempt && !p.vvf_certification?.trim()) missing.push('VVF');
  if (p.inail_required && !p.inail_exempt && !p.inail_certification?.trim()) missing.push('INAIL');
  return missing;
}

// Non estende AbstractService (route annidate): header Authorization messo
// a mano, nessun interceptor lo aggiunge (vedi CLAUDE.md, bug BrandingService).
@Injectable({providedIn: 'root'})
export class ThermalPlantService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private readonly api = environment.apiUrl;

  private headers(): HttpHeaders {
    return new HttpHeaders({Authorization: `Bearer ${this.auth.getToken() || ''}`});
  }

  listAll(): Observable<ThermalPlant[]> {
    return this.http.get<ThermalPlant[]>(`${this.api}/thermal-plants`, {headers: this.headers()});
  }

  listByAsset(assetId: number): Observable<ThermalPlant[]> {
    return this.http.get<ThermalPlant[]>(`${this.api}/assets/${assetId}/thermal-plants`, {headers: this.headers()});
  }

  listByUtility(utilityId: number): Observable<ThermalPlant[]> {
    return this.http.get<ThermalPlant[]>(`${this.api}/utilities/${utilityId}/thermal-plants`, {headers: this.headers()});
  }

  create(assetId: number, payload: ThermalPlantPayload): Observable<ThermalPlant> {
    return this.http.post<ThermalPlant>(`${this.api}/assets/${assetId}/thermal-plants`, payload, {headers: this.headers()});
  }

  update(id: number, payload: ThermalPlantPayload): Observable<ThermalPlant> {
    return this.http.patch<ThermalPlant>(`${this.api}/thermal-plants/${id}`, payload, {headers: this.headers()});
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/thermal-plants/${id}`, {headers: this.headers()});
  }
}

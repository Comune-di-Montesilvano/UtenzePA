import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth.service';
import { MapPointsResponse } from './map-point.entity';

export interface MapPointsFilters {
  showAssets?: boolean;
  showUtilities?: boolean;
  assetAggregatorIds?: number[] | null;
  utilityTypeIds?: number[] | null;
}

@Injectable({ providedIn: 'root' })
export class MapService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private readonly BASE_URL = environment.apiUrl + '/map';

  getPoints(filters: MapPointsFilters): Observable<MapPointsResponse> {
    let params = new HttpParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        if (value.length > 0) params = params.set(key, value.join(','));
      } else if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    });

    const headers = new HttpHeaders({ Authorization: `Bearer ${this.auth.getToken() || ''}` });
    return this.http.get<MapPointsResponse>(`${this.BASE_URL}/points`, { headers, params });
  }

  // Ricerca libera indirizzo (barra ricerca mappa) — null se Nominatim non
  // trova nessun match, mai un errore applicativo per "non trovato".
  geocode(q: string): Observable<{ lat: string; lng: string } | null> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${this.auth.getToken() || ''}` });
    const params = new HttpParams().set('q', q);
    return this.http.get<{ lat: string; lng: string } | null>(`${this.BASE_URL}/geocode`, { headers, params });
  }
}

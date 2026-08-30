import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth.service';
import { MapPointsResponse } from './map-point.entity';

export interface MapPointsFilters {
  showAssets?: boolean;
  showUtilities?: boolean;
  assetAggregatorId?: number | null;
  utilityTypeId?: number | null;
}

@Injectable({ providedIn: 'root' })
export class MapService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private readonly BASE_URL = environment.apiUrl + '/map';

  getPoints(filters: MapPointsFilters): Observable<MapPointsResponse> {
    let params = new HttpParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    });

    const headers = new HttpHeaders({ Authorization: `Bearer ${this.auth.getToken() || ''}` });
    return this.http.get<MapPointsResponse>(`${this.BASE_URL}/points`, { headers, params });
  }
}

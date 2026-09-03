import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth.service';

export interface RegeocodeAllStatus {
  running: boolean;
  forceAll: boolean;
  total: number;
  processed: number;
  geocoded: number;
  skippedNoAddress: number;
  failed: number;
  startedAt: string | null;
  finishedAt: string | null;
}

@Injectable({ providedIn: 'root' })
export class GeocodeService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private readonly BASE_URL = environment.apiUrl + '/building';

  private getAuthHeaders(): HttpHeaders {
    const token = this.auth.getToken();
    return new HttpHeaders({ Authorization: `Bearer ${token || ''}` });
  }

  startAll(forceAll: boolean): Observable<RegeocodeAllStatus> {
    return this.http.post<RegeocodeAllStatus>(
      `${this.BASE_URL}/regeocode-all`,
      { forceAll },
      { headers: this.getAuthHeaders() },
    );
  }

  getStatus(): Observable<RegeocodeAllStatus> {
    return this.http.get<RegeocodeAllStatus>(`${this.BASE_URL}/regeocode-all/status`, {
      headers: this.getAuthHeaders(),
    });
  }
}

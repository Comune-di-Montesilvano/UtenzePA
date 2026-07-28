import {Injectable} from '@angular/core';
import {HttpParams} from '@angular/common/http';
import {Observable} from 'rxjs';
import {environment} from '../../../environments/environment';
import {Utility} from './entity/utility.entity';
import {AbstractService} from '../../core/services/abstract.service';

@Injectable({
              providedIn: 'root',
            })
export class UtilityService extends AbstractService<Utility> {
  protected override readonly BASE_URL = environment.apiUrl + '/utilities';
  protected override readonly entityClass = Utility;

  override search(
    filters?: {
      utility_id?: string;
      utility_code?: string;
      meter_usage_type?: string;
      deleted?: boolean;
      text?: string;
      safeguard?: boolean;
      supply_expiry_date_range?: string[];
    },
  ): Observable<Utility[]> {
    let params = new HttpParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (key !== 'text') {
            params = params.set(key, value.toString());
          }
        }
      });
    }
    return this.http.get<Utility[]>(this.BASE_URL, {
      headers: this.getAuthHeaders(),
      params,
    });
  }

  override getById(id: number): Observable<Utility> {
    return this.http.get<Utility>(`${this.BASE_URL}/${id}`, {
      headers: this.getAuthHeaders(),
    });
  }

  getSafeGuardedUtilities(): Observable<Utility[]> {
    return this.http.get<Utility[]>(`${this.BASE_URL}/safeguarded`, {
      headers: this.getAuthHeaders(),
    });
  }
}

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { AuditLogPage } from '../core/entities/audit-log-entry.entity';

export interface AuditLogFilters {
  entity: string;
  entityId?: number;
  userId?: number;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

@Injectable({ providedIn: 'root' })
export class AuditLogService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private readonly BASE_URL = `${environment.apiUrl}/audit-log`;

  private getAuthHeaders(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${this.auth.getToken() || ''}` });
  }

  search(filters: AuditLogFilters): Observable<AuditLogPage> {
    let params = new HttpParams().set('entity', filters.entity);
    if (filters.entityId !== undefined) params = params.set('entityId', String(filters.entityId));
    if (filters.userId !== undefined) params = params.set('userId', String(filters.userId));
    if (filters.dateFrom) params = params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params = params.set('dateTo', filters.dateTo);
    if (filters.page !== undefined) params = params.set('page', String(filters.page));
    if (filters.pageSize !== undefined) params = params.set('pageSize', String(filters.pageSize));

    return this.http.get<AuditLogPage>(this.BASE_URL, { headers: this.getAuthHeaders(), params });
  }
}

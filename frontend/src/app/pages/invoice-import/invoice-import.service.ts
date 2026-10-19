import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth.service';

// Stato del motore di import fatture dalla PEC dello SDI (backend InvoiceImportStatus).
export interface InvoiceImportStatus {
  configured: boolean;
  forcedOff: boolean;
  enabled: boolean;
  running: boolean;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  counts: Record<string, number>;
  // Ultimi 10 file in errore, dal più recente.
  recentErrors: {file_name: string; error: string | null; create_date: string}[];
}

@Injectable({ providedIn: 'root' })
export class InvoiceImportService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private readonly BASE_URL = environment.apiUrl + '/invoice-import';

  private getAuthHeaders(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${this.auth.getToken() || ''}` });
  }

  status(): Observable<InvoiceImportStatus> {
    return this.http.get<InvoiceImportStatus>(`${this.BASE_URL}/status`, { headers: this.getAuthHeaders() });
  }

  setEnabled(enabled: boolean): Observable<InvoiceImportStatus> {
    return this.http.patch<InvoiceImportStatus>(this.BASE_URL, { enabled }, { headers: this.getAuthHeaders() });
  }

  // Avvia un giro in background: risponde subito con running = true.
  run(): Observable<InvoiceImportStatus> {
    return this.http.post<InvoiceImportStatus>(`${this.BASE_URL}/run`, {}, { headers: this.getAuthHeaders() });
  }
}

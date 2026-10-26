import {Injectable, inject} from '@angular/core';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import {Observable} from 'rxjs';
import {environment} from '../../../environments/environment';
import {AuthService} from '../../services/auth.service';

export type AccKind = 'chapters' | 'commitments' | 'liquidations';

export interface CsvIssue {
  line: number;
  message: string;
}

// Esito dell'ultimo giro (backend AccountingImportSummary).
export interface AccountingImportSummary {
  loaded: Partial<Record<AccKind, number>>;
  issues: Partial<Record<AccKind, CsvIssue[]>>;
  steps: Record<string, Record<string, number>>;
}

// Stato dell'import della contabilità (backend AccountingImportStatus, solo Admin).
export interface AccountingImportStatus {
  enabled: boolean;
  forcedOff: boolean;
  running: boolean;
  fromYear: number | null;
  lastRunAt: string | null;
  lastError: string | null;
  lastSummary: AccountingImportSummary | null;
  counts: Record<AccKind, number>;
}

@Injectable({providedIn: 'root'})
export class AccountingImportService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private readonly BASE_URL = environment.apiUrl + '/accounting-import';

  private headers(): HttpHeaders {
    return new HttpHeaders({Authorization: `Bearer ${this.auth.getToken() || ''}`});
  }

  status(): Observable<AccountingImportStatus> {
    return this.http.get<AccountingImportStatus>(`${this.BASE_URL}/status`, {headers: this.headers()});
  }

  update(patch: {enabled?: boolean; from_year?: number}): Observable<AccountingImportStatus> {
    return this.http.patch<AccountingImportStatus>(this.BASE_URL, patch, {headers: this.headers()});
  }

  // Carica i file scelti e fa il giro completo: risponde a giro finito.
  run(files: Partial<Record<AccKind, File>>): Observable<AccountingImportSummary> {
    const body = new FormData();
    for (const [kind, file] of Object.entries(files)) if (file) body.append(kind, file, file.name);
    return this.http.post<AccountingImportSummary>(this.BASE_URL, body, {headers: this.headers()});
  }
}

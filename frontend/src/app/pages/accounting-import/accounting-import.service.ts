import {Injectable, inject} from '@angular/core';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import {Observable} from 'rxjs';
import {environment} from '../../../environments/environment';
import {AuthService} from '../../services/auth.service';

export type AccKind = 'chapters' | 'commitments' | 'liquidations' | 'credit_notes';

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

// Stato del container Tinn che scarica la contabilità ogni notte (backend TinnStatus).
export interface TinnStatus {
  state: 'running' | 'ok' | 'unchanged' | 'error';
  step: string | null;
  message: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  backupSha256: string | null;
  backupDate: string | null;
  nextRunAt: string | null;
}

// Stato dell'import della contabilità (backend AccountingImportStatus, solo Admin).
export interface AccountingImportStatus {
  enabled: boolean;
  forcedOff: boolean;
  running: boolean;
  fromYear: number | null;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastSummary: AccountingImportSummary | null;
  counts: Record<AccKind, number>;
  // null = scaricamento automatico non installato (profilo tinn spento).
  container: TinnStatus | null;
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

  // «Esegui ora» del container Tinn: parte entro un minuto.
  runContainer(): Observable<AccountingImportStatus> {
    return this.http.post<AccountingImportStatus>(`${this.BASE_URL}/container/run`, {}, {headers: this.headers()});
  }

  // Carica i file scelti e avvia il giro in background: risponde subito con lo
  // stato (running), l'esito arriva da status().
  run(files: Partial<Record<AccKind, File>>): Observable<AccountingImportStatus> {
    const body = new FormData();
    for (const [kind, file] of Object.entries(files)) if (file) body.append(kind, file, file.name);
    return this.http.post<AccountingImportStatus>(this.BASE_URL, body, {headers: this.headers()});
  }
}

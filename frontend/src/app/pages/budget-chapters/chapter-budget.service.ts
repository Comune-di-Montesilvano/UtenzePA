import {inject, Injectable} from '@angular/core';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import {Observable} from 'rxjs';
import {environment} from '../../../environments/environment';
import {AuthService} from '../../services/auth.service';
import {
  BudgetCheckPayload,
  BudgetWarning,
  ChapterCommitment,
  ChapterInvoiceLine,
  ChapterYear,
  ChapterYearSummary,
} from './chapter-budget.model';

// Dati calcolati del capitolo (esercizi, impegni, fatture). Non estende
// AbstractService: header Authorization a mano (nessun interceptor lo aggiunge).
@Injectable({providedIn: 'root'})
export class ChapterBudgetService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private readonly api = environment.apiUrl;

  private headers(): HttpHeaders {
    return new HttpHeaders({Authorization: `Bearer ${this.auth.getToken() || ''}`});
  }

  years(chapterId: number): Observable<ChapterYear[]> {
    return this.http.get<ChapterYear[]>(`${this.api}/budget-chapters/${chapterId}/years`, {headers: this.headers()});
  }

  commitments(chapterId: number): Observable<ChapterCommitment[]> {
    return this.http.get<ChapterCommitment[]>(`${this.api}/budget-chapters/${chapterId}/commitments`, {headers: this.headers()});
  }

  invoiceLines(chapterId: number): Observable<ChapterInvoiceLine[]> {
    return this.http.get<ChapterInvoiceLine[]>(`${this.api}/budget-chapters/${chapterId}/invoice-lines`, {headers: this.headers()});
  }

  yearSummary(year: number): Observable<ChapterYearSummary[]> {
    return this.http.get<ChapterYearSummary[]>(`${this.api}/spending/chapters`, {headers: this.headers(), params: {year}});
  }

  budgetCheck(payload: BudgetCheckPayload): Observable<BudgetWarning[]> {
    return this.http.post<BudgetWarning[]>(`${this.api}/spending/budget-check`, payload, {headers: this.headers()});
  }
}

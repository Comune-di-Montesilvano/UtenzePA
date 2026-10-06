import {inject, Injectable} from '@angular/core';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import {Observable} from 'rxjs';
import {environment} from '../../../../environments/environment';
import {AuthService} from '../../../services/auth.service';

export interface BudgetChapterSpending {
  id: number;
  budget_chapter_id_fk: number;
  year: number;
  amount: number | null;
  initial_budget: number | null;
  adjusted_budget: number | null;
  notes: string | null;
}

export interface BudgetChapterSpendingPayload {
  year: number;
  amount: number | null;
  initial_budget: number | null;
  adjusted_budget: number | null;
  notes: string | null;
}

export const formatEuro = (value: number | null | undefined): string =>
  value === null || value === undefined
    ? ''
    : Number(value).toLocaleString('it-IT', {style: 'currency', currency: 'EUR'});

// Non estende AbstractService (route annidate): header Authorization messo
// a mano, nessun interceptor lo aggiunge (vedi CLAUDE.md, bug BrandingService).
@Injectable({providedIn: 'root'})
export class BudgetChapterSpendingService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private readonly api = environment.apiUrl;

  private headers(): HttpHeaders {
    return new HttpHeaders({Authorization: `Bearer ${this.auth.getToken() || ''}`});
  }

  list(chapterId: number): Observable<BudgetChapterSpending[]> {
    return this.http.get<BudgetChapterSpending[]>(`${this.api}/budget-chapters/${chapterId}/spending`, {headers: this.headers()});
  }

  create(chapterId: number, payload: BudgetChapterSpendingPayload): Observable<BudgetChapterSpending> {
    return this.http.post<BudgetChapterSpending>(`${this.api}/budget-chapters/${chapterId}/spending`, payload, {headers: this.headers()});
  }

  update(id: number, payload: BudgetChapterSpendingPayload): Observable<BudgetChapterSpending> {
    return this.http.patch<BudgetChapterSpending>(`${this.api}/budget-chapter-spending/${id}`, payload, {headers: this.headers()});
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/budget-chapter-spending/${id}`, {headers: this.headers()});
  }
}

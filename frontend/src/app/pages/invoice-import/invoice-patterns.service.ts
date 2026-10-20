import {Injectable, inject} from '@angular/core';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import {Observable} from 'rxjs';
import {environment} from '../../../environments/environment';
import {AuthService} from '../../services/auth.service';
import type {
  InvoicePattern,
  InvoicePatternRow,
  PatternEditorData,
  PatternAnalysis,
  PatternPreview,
  PatternRules,
  UnknownStructure,
} from './pattern-rules.model';

export interface SavedPattern {
  pattern: InvoicePattern;
  // Fatture del fornitore rielaborate in background col pattern.
  reprocessing: number;
}

@Injectable({providedIn: 'root'})
export class InvoicePatternsService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private readonly BASE_URL = environment.apiUrl + '/invoice-patterns';

  private get headers(): HttpHeaders {
    return new HttpHeaders({Authorization: `Bearer ${this.auth.getToken() || ''}`});
  }

  unknown(): Observable<UnknownStructure[]> {
    return this.http.get<UnknownStructure[]>(`${this.BASE_URL}/unknown`, {headers: this.headers});
  }

  list(): Observable<InvoicePatternRow[]> {
    return this.http.get<InvoicePatternRow[]>(this.BASE_URL, {headers: this.headers});
  }

  get(id: number): Observable<InvoicePattern> {
    return this.http.get<InvoicePattern>(`${this.BASE_URL}/${id}`, {headers: this.headers});
  }

  editor(messageId: number): Observable<PatternEditorData> {
    return this.http.get<PatternEditorData>(`${this.BASE_URL}/messages/${messageId}/editor`, {headers: this.headers});
  }

  pdf(messageId: number): Observable<Blob> {
    return this.http.get(`${this.BASE_URL}/messages/${messageId}/pdf`, {headers: this.headers, responseType: 'blob'});
  }

  analyze(messageId: number, messageIds: number[], rules: PatternRules): Observable<PatternAnalysis> {
    return this.http.post<PatternAnalysis>(`${this.BASE_URL}/analyze`, {message_id: messageId, message_ids: messageIds, rules},
      {headers: this.headers});
  }

  preview(messageId: number, rules: PatternRules): Observable<PatternPreview> {
    return this.http.post<PatternPreview>(`${this.BASE_URL}/preview`, {message_id: messageId, rules}, {headers: this.headers});
  }

  create(messageId: number, name: string, rules: PatternRules): Observable<SavedPattern> {
    return this.http.post<SavedPattern>(this.BASE_URL, {message_id: messageId, name, rules}, {headers: this.headers});
  }

  update(id: number, messageId: number, name: string, rules: PatternRules): Observable<SavedPattern> {
    return this.http.patch<SavedPattern>(`${this.BASE_URL}/${id}`, {message_id: messageId, name, rules}, {headers: this.headers});
  }

  ignore(messageId: number, name: string): Observable<SavedPattern> {
    return this.http.post<SavedPattern>(`${this.BASE_URL}/ignore`, {message_id: messageId, name}, {headers: this.headers});
  }

  remove(id: number): Observable<unknown> {
    return this.http.delete(`${this.BASE_URL}/${id}`, {headers: this.headers});
  }
}

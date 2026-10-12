import {inject, Injectable} from '@angular/core';
import {HttpClient, HttpHeaders, HttpParams} from '@angular/common/http';
import {Observable} from 'rxjs';
import {environment} from '../../../environments/environment';
import {AuthService} from '../../services/auth.service';
import {ChunkedUploadService} from '../../services/chunked-upload.service';
import {Attachment, AttachmentEntityType} from './attachment.model';

// Non estende AbstractService: header Authorization a mano, l'interceptor
// non lo aggiunge (vedi CLAUDE.md).
@Injectable({providedIn: 'root'})
export class AttachmentService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private chunked = inject(ChunkedUploadService);
  private readonly api = `${environment.apiUrl}/attachments`;

  private headers(): HttpHeaders {
    return new HttpHeaders({Authorization: `Bearer ${this.auth.getToken() || ''}`});
  }

  list(type: AttachmentEntityType, id: number): Observable<Attachment[]> {
    const params = new HttpParams().set('entity_type', type).set('entity_id', String(id));
    return this.http.get<Attachment[]>(this.api, {headers: this.headers(), params});
  }

  // A pezzi (limite del proxy di produzione), come le foto.
  upload(type: AttachmentEntityType, id: number, file: File, description: string | null = null): Observable<Attachment> {
    return this.chunked.uploadFile(file, `${this.api}/chunk`, `${this.api}/finalize`,
      {entity_type: type, entity_id: id, originalFilename: file.name, description});
  }

  blob(id: number, inline: boolean): Observable<Blob> {
    return this.http.get(`${this.api}/${id}/file${inline ? '?inline=1' : ''}`,
      {headers: this.headers(), responseType: 'blob'});
  }

  update(id: number, description: string | null): Observable<Attachment> {
    return this.http.patch<Attachment>(`${this.api}/${id}`, {description}, {headers: this.headers()});
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/${id}`, {headers: this.headers()});
  }
}

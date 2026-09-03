import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { ChunkedUploadService } from './chunked-upload.service';
import { Photo, PhotoEntityType } from '../core/entities/photo.entity';

@Injectable({ providedIn: 'root' })
export class PhotosService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private chunkedUpload = inject(ChunkedUploadService);
  private readonly BASE_URL = `${environment.apiUrl}/photos`;

  private getAuthHeaders(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${this.auth.getToken() || ''}` });
  }

  list(entityType: PhotoEntityType, entityId: number): Observable<Photo[]> {
    const params = new HttpParams().set('entityType', entityType).set('entityId', String(entityId));
    return this.http.get<Photo[]>(this.BASE_URL, { headers: this.getAuthHeaders(), params });
  }

  // Sempre a chunk (1MB per parte, vincolo reverse proxy di produzione — vedi
  // ChunkedUploadService) — a differenza di un backup/import, qui il caso
  // comune (foto da fotocamera/smartphone) supera quasi sempre 1MB, non è
  // un caso limite.
  upload(entityType: PhotoEntityType, entityId: number, file: File): Observable<Photo> {
    return this.chunkedUpload.uploadFile(
      file,
      `${this.BASE_URL}/upload/chunk`,
      `${this.BASE_URL}/upload/finalize`,
      {
        entityType,
        entityId,
        originalFilename: file.name,
        mimeType: file.type,
      },
    );
  }

  getFileBlob(id: number): Observable<Blob> {
    return this.http.get(`${this.BASE_URL}/${id}/file`, {
      headers: this.getAuthHeaders(),
      responseType: 'blob',
    });
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.BASE_URL}/${id}`, { headers: this.getAuthHeaders() });
  }
}

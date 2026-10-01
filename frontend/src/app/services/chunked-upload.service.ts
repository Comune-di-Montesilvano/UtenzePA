// frontend/src/app/services/chunked-upload.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, from, concatMap, toArray, switchMap } from 'rxjs';
import { AuthService } from './auth.service';

// Limite del reverse proxy di produzione: 1MB per richiesta, corpo multipart
// COMPRESO (boundary, intestazioni, campi uploadId/chunkIndex/...). Con
// chunk da esattamente 1MB ogni richiesta lo superava di poco → 413.
const CHUNK_SIZE = 512 * 1024;

@Injectable({ providedIn: 'root' })
export class ChunkedUploadService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  private getAuthHeaders(): HttpHeaders {
    const token = this.auth.getToken();
    return new HttpHeaders({ Authorization: `Bearer ${token || ''}` });
  }

  private generateUploadId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  uploadFile(
    file: File,
    chunkEndpointUrl: string,
    finalizeEndpointUrl: string,
    finalizeExtraBody: Record<string, any> = {},
  ): Observable<any> {
    const uploadId = this.generateUploadId();
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const chunkIndexes = Array.from({ length: totalChunks }, (_, i) => i);

    return from(chunkIndexes).pipe(
      concatMap((chunkIndex) => {
        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const blob = file.slice(start, end);

        const formData = new FormData();
        formData.append('chunk', blob);
        formData.append('uploadId', uploadId);
        formData.append('chunkIndex', String(chunkIndex));
        formData.append('totalChunks', String(totalChunks));

        return this.http.post(chunkEndpointUrl, formData, { headers: this.getAuthHeaders() });
      }),
      toArray(),
      switchMap(() =>
        this.http.post(
          finalizeEndpointUrl,
          { uploadId, totalChunks, ...finalizeExtraBody },
          { headers: this.getAuthHeaders() },
        ),
      ),
    );
  }
}

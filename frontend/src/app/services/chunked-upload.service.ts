// frontend/src/app/services/chunked-upload.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, from, mergeMap, toArray, switchMap, tap } from 'rxjs';
import { AuthService } from './auth.service';

// Limite del reverse proxy di produzione: 1MB per richiesta, corpo multipart
// COMPRESO (boundary, intestazioni, campi uploadId/chunkIndex/...). Con
// chunk da esattamente 1MB ogni richiesta lo superava di poco → 413.
const CHUNK_SIZE = 512 * 1024;
// Pezzi inviati insieme: con backup da GB (decine di migliaia di pezzi) uno
// alla volta pagava la latenza di ogni richiesta. L'ordine non conta: il
// backend li salva per indice.
const PARALLEL_CHUNKS = 3;

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
    onProgress?: (sentBytes: number, totalBytes: number) => void,
  ): Observable<any> {
    const uploadId = this.generateUploadId();
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const chunkIndexes = Array.from({ length: totalChunks }, (_, i) => i);
    let sentBytes = 0;

    return from(chunkIndexes).pipe(
      mergeMap((chunkIndex) => {
        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const blob = file.slice(start, end);

        const formData = new FormData();
        formData.append('chunk', blob);
        formData.append('uploadId', uploadId);
        formData.append('chunkIndex', String(chunkIndex));
        formData.append('totalChunks', String(totalChunks));

        return this.http
          .post(chunkEndpointUrl, formData, { headers: this.getAuthHeaders() })
          .pipe(
            tap(() => {
              sentBytes += end - start;
              onProgress?.(sentBytes, file.size);
            }),
          );
      }, PARALLEL_CHUNKS),
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

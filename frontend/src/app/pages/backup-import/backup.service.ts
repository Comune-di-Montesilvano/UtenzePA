import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth.service';
import { ChunkedUploadService } from '../../services/chunked-upload.service';

export interface BackupInfo {
  filename: string;
  size: number;
  createdAt: string;
}

// Creazione e ripristino girano in background sul server (vedi backend
// BackupJobStatus): la pagina interroga questo stato.
export interface BackupJobStatus {
  creating: { startedAt: string } | null;
  lastCreate: { finishedAt: string; filename?: string; error?: string } | null;
  restoring: { startedAt: string } | null;
  lastRestore: { finishedAt: string; error?: string } | null;
}

@Injectable({ providedIn: 'root' })
export class BackupService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private chunkedUpload = inject(ChunkedUploadService);
  private readonly BASE_URL = environment.apiUrl + '/backup';

  private getAuthHeaders(): HttpHeaders {
    const token = this.auth.getToken();
    return new HttpHeaders({ Authorization: `Bearer ${token || ''}` });
  }

  list(): Observable<BackupInfo[]> {
    return this.http.get<BackupInfo[]>(this.BASE_URL, { headers: this.getAuthHeaders() });
  }

  create(includePhotos = false, includeAttachments = false): Observable<BackupJobStatus> {
    return this.http.post<BackupJobStatus>(
      this.BASE_URL,
      { includePhotos, includeAttachments },
      { headers: this.getAuthHeaders() },
    );
  }

  remove(filename: string): Observable<void> {
    return this.http.delete<void>(`${this.BASE_URL}/${filename}`, { headers: this.getAuthHeaders() });
  }

  status(): Observable<BackupJobStatus> {
    return this.http.get<BackupJobStatus>(`${this.BASE_URL}/status`, { headers: this.getAuthHeaders() });
  }

  // Link monouso: il browser scarica in streaming (un backup da GB letto
  // come Blob finirebbe tutto in memoria).
  downloadUrl(filename: string): Observable<string> {
    return this.http
      .post<{ ticket: string }>(`${this.BASE_URL}/${filename}/download-link`, {}, { headers: this.getAuthHeaders() })
      .pipe(map(({ ticket }) => `${environment.apiUrl}/backup-download/${ticket}`));
  }

  restore(
    file: File,
    password: string,
    options?: { excludeUsers?: boolean; excludeBranding?: boolean },
    onProgress?: (sentBytes: number, totalBytes: number) => void,
  ): Observable<any> {
    return this.chunkedUpload.uploadFile(
      file,
      `${this.BASE_URL}/restore/chunk`,
      `${this.BASE_URL}/restore/finalize`,
      {
        password,
        excludeUsers: options?.excludeUsers ?? false,
        excludeBranding: options?.excludeBranding ?? false,
        // Serve al backend per distinguere un .tar.gz (dump + foto) da un
        // .sql (solo dump) una volta riassemblato dai chunk — di per sé
        // sono blob "nudi" senza nome/estensione.
        originalFilename: file.name,
      },
      onProgress,
    );
  }
}

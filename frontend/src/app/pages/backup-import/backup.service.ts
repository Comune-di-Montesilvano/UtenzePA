import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth.service';
import { ChunkedUploadService } from '../../services/chunked-upload.service';

export interface BackupInfo {
  filename: string;
  size: number;
  createdAt: string;
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

  create(): Observable<BackupInfo> {
    return this.http.post<BackupInfo>(this.BASE_URL, {}, { headers: this.getAuthHeaders() });
  }

  remove(filename: string): Observable<void> {
    return this.http.delete<void>(`${this.BASE_URL}/${filename}`, { headers: this.getAuthHeaders() });
  }

  downloadUrl(filename: string): string {
    return `${this.BASE_URL}/${filename}/download`;
  }

  restore(file: File, password: string): Observable<any> {
    return this.chunkedUpload.uploadFile(
      file,
      `${this.BASE_URL}/restore/chunk`,
      `${this.BASE_URL}/restore/finalize`,
      { password },
    );
  }
}

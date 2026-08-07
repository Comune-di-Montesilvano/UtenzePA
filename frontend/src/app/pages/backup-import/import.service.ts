import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ChunkedUploadService } from '../../services/chunked-upload.service';

@Injectable({ providedIn: 'root' })
export class ImportService {
  private chunkedUpload = inject(ChunkedUploadService);
  private readonly BASE_URL = environment.apiUrl + '/import';

  import(entityType: string, file: File): Observable<any> {
    return this.chunkedUpload.uploadFile(
      file,
      `${this.BASE_URL}/${entityType}/chunk`,
      `${this.BASE_URL}/${entityType}/finalize`,
    );
  }
}

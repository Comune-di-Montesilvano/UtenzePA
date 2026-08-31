import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Branding {
  entity_name: string;
  entity_type: string;
  default_latitude: string;
  default_longitude: string;
  logo: string | null;
  logo_mime: string | null;
  favicon: string | null;
  favicon_mime: string | null;
}

export interface UpdateBrandingPayload extends Partial<Branding> {
  removeLogo?: boolean;
  removeFavicon?: boolean;
}

@Injectable({ providedIn: 'root' })
export class BrandingService {
  private http = inject(HttpClient);
  private readonly BASE_URL = `${environment.apiUrl}/settings/branding`;

  private value: Branding | null = null;
  private subject = new BehaviorSubject<Branding | null>(null);
  readonly current$: Observable<Branding | null> = this.subject.asObservable();

  // GET pubblico — nessun header di auth necessario (endpoint senza guard,
  // vedi backend SettingsController). Chiamato una sola volta all'avvio
  // dell'app tramite APP_INITIALIZER (vedi app.config.ts).
  load(): Observable<Branding> {
    return this.http.get<Branding>(this.BASE_URL).pipe(
      tap((branding) => {
        this.value = branding;
        this.subject.next(branding);
      }),
    );
  }

  current(): Branding {
    if (!this.value) {
      throw new Error('BrandingService.current() chiamato prima di load() — verifica APP_INITIALIZER');
    }
    return this.value;
  }

  // Applica dei valori di branding senza chiamata HTTP — usato dall'APP_INITIALIZER
  // come fallback quando load() fallisce (backend down/CORS), per evitare che
  // current() lanci e blocchi il bootstrap dell'app (vedi app.config.ts).
  applyFallback(branding: Branding): void {
    this.value = branding;
    this.subject.next(branding);
  }

  update(payload: UpdateBrandingPayload): Observable<Branding> {
    return this.http.patch<Branding>(this.BASE_URL, payload).pipe(
      tap((branding) => {
        this.value = branding;
        this.subject.next(branding);
      }),
    );
  }
}

import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth.service';
import { BrandingService } from '../../services/branding.service';

// Codice del 400 con cui il backend rifiuta le richieste durante un
// ripristino da backup (common/maintenance nel backend).
export const MAINTENANCE_CODE = 'MAINTENANCE';

const POLL_MS = 5000;

/**
 * Pagina di cortesia durante un ripristino da backup: database e file vengono
 * sostituiti, l'app è bloccata per tutti. Interroga /health finché la
 * manutenzione non finisce, poi rimanda al login (utenti e dati sono cambiati).
 */
@Component({
  selector: 'app-manutenzione',
  standalone: true,
  imports: [MatProgressSpinnerModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="manutenzione">
      <div class="manutenzione__box">
        @if (logo) {
          <img class="manutenzione__logo" [src]="logo" alt="" />
        }
        <h1>Ripristino dei dati in corso</h1>
        <p>
          {{ entityName ? entityName + ': l’' : 'L’' }}applicazione è momentaneamente non disponibile
          mentre vengono ripristinati i dati da un backup.
        </p>
        <p>La pagina si aggiorna da sola: al termine verrà chiesto di accedere di nuovo.</p>
        <mat-spinner diameter="36"></mat-spinner>
      </div>
    </div>
  `,
  styles: `
    .manutenzione {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      background: var(--app-bg);
      color: var(--app-text);
    }
    .manutenzione__box {
      max-width: 480px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;
    }
    .manutenzione__logo {
      max-height: 64px;
    }
    h1 {
      font-size: 1.4rem;
      margin: 0;
    }
    p {
      margin: 0;
      color: var(--app-muted);
    }
  `,
})
export class ManutenzioneComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private router = inject(Router);
  private auth = inject(AuthService);
  private branding = inject(BrandingService).current();

  entityName = this.branding.entity_name;
  logo = this.branding.logo;
  private timer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.check();
    this.timer = setInterval(() => this.check(), POLL_MS);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private check(): void {
    this.http.get<{ maintenance?: boolean }>(`${environment.apiUrl}/health`).subscribe({
      next: (health) => {
        if (!health.maintenance) {
          this.auth.logout();
          void this.router.navigate(['/login']);
        }
      },
      // API momentaneamente irraggiungibile: si riprova al giro successivo.
      error: () => undefined,
    });
  }
}

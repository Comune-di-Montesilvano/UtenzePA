import { Component, OnInit, signal, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AuthService } from './services/auth.service';
import { Idle, DEFAULT_INTERRUPTSOURCES } from '@ng-idle/core';
import { Keepalive } from '@ng-idle/keepalive';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './app.scss'
})
export class App implements OnInit {
  protected readonly title = signal('montesilvano-fe');

  constructor(
    private idle: Idle,
    private keepalive: Keepalive,
    private authService: AuthService,
    private router: Router,
  ) {}

  ngOnInit() {
    this.idle.setIdle(1800);
    this.idle.setTimeout(60);
    this.idle.setInterrupts(DEFAULT_INTERRUPTSOURCES);

    this.idle.onIdleStart.subscribe(() => console.log('Utente inattivo...'));
    this.idle.onTimeout.subscribe(() => {
      this.authService.logout('TIMEOUT');
      alert('Sessione scaduta per inattività');
      this.router.navigate(['/login']);
    });

    // Il token dura 1 ora: rinnovato all'avvio (ricarica pagina) e ogni 15
    // minuti finché l'utente non è inattivo (ng-idle sospende il keepalive
    // durante l'inattività, poi scatta il logout per scadenza).
    this.keepalive.interval(900);
    this.keepalive.onPing.subscribe(() => this.refreshToken());
    this.refreshToken();

    this.idle.watch();
  }

  private refreshToken(): void {
    if (!this.authService.authenticated) return;
    this.authService.refresh().then((ok) => {
      if (ok) return;
      this.authService.logout();
      this.router.navigate(['/login']);
    });
  }
}

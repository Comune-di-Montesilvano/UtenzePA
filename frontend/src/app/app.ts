import { Component, OnInit, signal, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { distinctUntilChanged, fromEvent } from 'rxjs';
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
    private dialog: MatDialog,
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

    // Ritorno sulla pagina (PC in sospensione, scheda in background): i timer
    // erano fermi, si verifica subito la sessione invece di aspettare un clic.
    // Prima l'inattività (scaduta = timeout e login), poi il token.
    fromEvent(document, 'visibilitychange').subscribe(() => {
      if (document.visibilityState !== 'visible') return;
      this.idle.interrupt();
      this.refreshToken();
    });

    // Sorveglianza dell'inattività legata alla sessione: dopo un timeout ng-idle si
    // ferma (keepalive compreso) e un nuovo login senza ricaricare la pagina deve
    // farla ripartire, altrimenti il token scade e lo si scopre solo al clic.
    // Qualsiasi uscita (inattività, refresh rifiutato, 401, Esci) chiude anche le
    // schede aperte: MatDialog non segue il routing e resterebbero sopra il login.
    this.authService.currentUser$
      .pipe(distinctUntilChanged((a, b) => !!a === !!b))
      .subscribe(user => {
        if (user) {
          this.idle.watch();
          return;
        }
        this.idle.stop();
        this.dialog.closeAll();
      });
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

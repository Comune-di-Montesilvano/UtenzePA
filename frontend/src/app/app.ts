import { Component, OnInit, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AuthService } from './services/auth.service';
import { Idle, DEFAULT_INTERRUPTSOURCES } from '@ng-idle/core';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  protected readonly title = signal('montesilvano-fe');

  constructor(private idle: Idle, private authService: AuthService, private router: Router) {}

  ngOnInit() {
    this.idle.setIdle(1800);
    this.idle.setTimeout(60);
    this.idle.setInterrupts(DEFAULT_INTERRUPTSOURCES);

    this.idle.onIdleStart.subscribe(() => console.log('Utente inattivo...'));
    this.idle.onTimeout.subscribe(() => {
      this.authService.logout();
      alert('Sessione scaduta per inattività');
      this.router.navigate(['/login']);
    });

    this.idle.watch();
  }
}

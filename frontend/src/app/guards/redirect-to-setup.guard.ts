import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { SetupService } from '../services/setup.service';

// Simmetrico a SetupGuard: se il setup è ancora disponibile (nessun utente
// creato), non ha senso mostrare la pagina di login — non c'è nessuno con
// cui autenticarsi. Applicato sulla route 'login', dove AuthGuard fa
// confluire chiunque non sia autenticato.
@Injectable({
  providedIn: 'root'
})
export class RedirectToSetupGuard implements CanActivate {
  constructor(private setup: SetupService, private router: Router) {}

  async canActivate(): Promise<boolean> {
    const available = await this.setup.getStatus();
    if (available) {
      this.router.navigate(['/setup']);
      return false;
    }
    return true;
  }
}

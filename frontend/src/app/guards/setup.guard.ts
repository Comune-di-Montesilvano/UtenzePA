import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { SetupService } from '../services/setup.service';

@Injectable({
  providedIn: 'root'
})
export class SetupGuard implements CanActivate {
  constructor(private setup: SetupService, private router: Router) {}

  async canActivate(): Promise<boolean> {
    const available = await this.setup.getStatus();
    if (!available) {
      this.router.navigate(['/login']);
      return false;
    }
    return true;
  }
}

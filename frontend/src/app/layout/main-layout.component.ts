import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { GUIDA_PER_PAGINA } from '../pages/guida/guida';
import { SidebarComponent } from '../comp/sidebar/sidebar.component';
import { AuthService } from '../services/auth.service';
import { BrandingService } from '../services/branding.service';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterModule, MatIconModule, SidebarComponent],
  templateUrl: './main-layout.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./main-layout.component.scss']
})
export class MainLayoutComponent {

  userInitials: string = '';
  entityName = inject(BrandingService).current().entity_name;
  logo = inject(BrandingService).current().logo;

  private router = inject(Router);

  constructor(private authService: AuthService) {}

  // Sezione della guida per la pagina corrente (primo segmento dell'URL).
  get guidaFragment(): string | undefined {
    const page = this.router.url.split(/[/?#]/)[1] ?? '';
    return GUIDA_PER_PAGINA[page];
  }

  ngOnInit() {
    const user = this.authService.getCurrentUser();
    if (user) {
      this.userInitials = this.getInitials(user.firstName, user.lastName);
    }

    this.authService.currentUser$.subscribe(u => {
      if (u) this.userInitials = this.getInitials(u.firstName, u.lastName);
    });
  }

  private getInitials(firstName: string, lastName: string): string {
    const f = firstName?.charAt(0).toUpperCase() || '';
    const l = lastName?.charAt(0).toUpperCase() || '';
    return f + l;
  }

}

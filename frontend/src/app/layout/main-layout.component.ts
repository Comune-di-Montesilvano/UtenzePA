import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SidebarComponent } from '../comp/sidebar/sidebar.component';
import { AuthService } from '../services/auth.service';
import { BrandingService } from '../services/branding.service';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterModule, SidebarComponent],
  templateUrl: './main-layout.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./main-layout.component.scss']
})
export class MainLayoutComponent {

  userInitials: string = '';
  entityName = inject(BrandingService).current().entity_name;
  logo = inject(BrandingService).current().logo;

  constructor(private authService: AuthService) {}

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

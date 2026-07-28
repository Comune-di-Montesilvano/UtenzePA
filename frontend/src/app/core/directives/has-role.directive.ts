import { Directive, Input, ElementRef, OnInit } from '@angular/core';
import { AuthService } from '../../services/auth.service';

@Directive({
  selector: '[appHasRole]',
  standalone: true
})
export class HasRoleDirective implements OnInit {

  @Input('appHasRole') allowedRoles!: string[];

  constructor(
    private el: ElementRef,
    private authService: AuthService
  ) {}

  ngOnInit() {
    const user = this.authService.getCurrentUser();
    const userRole = user?.role;

    if (!userRole || !this.allowedRoles.includes(userRole)) {
      this.el.nativeElement.style.display = 'none';
    }
  }
}

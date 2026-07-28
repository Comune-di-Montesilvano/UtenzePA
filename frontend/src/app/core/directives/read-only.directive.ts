import { Directive, Input, ElementRef, OnInit } from '@angular/core';
import { AuthService } from '../../services/auth.service';

@Directive({
  selector: '[readOnly]',
  standalone: true
})
export class ReadOnlyDirective implements OnInit {

  @Input('readOnly') readOnly!: string[];

  constructor(
    private el: ElementRef,
    private authService: AuthService
  ) {}

  ngOnInit() {
    const user = this.authService.getCurrentUser();
    const userRole = user?.role;

    if (!userRole || this.readOnly.includes(userRole)) {
      this.el.nativeElement.style.pointerEvents = 'none';
    }
  }
}

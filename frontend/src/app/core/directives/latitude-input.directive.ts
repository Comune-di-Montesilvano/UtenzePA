import {Directive, HostListener} from '@angular/core';
import {CoordinateHelper} from '../helpers/coordinate.helper';

@Directive({
  selector: '[geoLatitude]',
  standalone: true
})
export class LatitudeInputDirective {

  @HostListener('keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    CoordinateHelper.filterCoordinateInput(event);
  }

  @HostListener('blur', ['$event'])
  onBlur(event: FocusEvent): void {
    CoordinateHelper.validateRange(event.target as HTMLInputElement, -90, 90);
  }
}


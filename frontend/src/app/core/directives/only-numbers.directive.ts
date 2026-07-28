import {Directive, HostListener} from '@angular/core';
import {KeyboardHelper} from '../helpers/keyboard.helper';

@Directive({
  selector: '[onlyNumbers]',
  standalone: true
})
export class OnlyNumbersDirective {

  @HostListener('keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    KeyboardHelper.onlyNumbers(event);
  }
}


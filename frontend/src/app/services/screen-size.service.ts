import { Injectable, HostListener } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ScreenSizeService {

  private height$ = new BehaviorSubject<number>(window.innerHeight);

  constructor() {
    window.addEventListener('resize', () => {
      this.height$.next(window.innerHeight);
    });
  }

  public updateMinHeight() {
    
  }

  get screenHeight$() {
    return this.height$.asObservable();
  }

  get screenHeight(): number {
    return this.height$.value;
  }
}

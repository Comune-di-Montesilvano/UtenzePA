import {Injectable, inject} from '@angular/core';
import {MatSnackBar} from '@angular/material/snack-bar';

export interface ToastMessage {
  severity: 'success' | 'error' | 'info' | 'warn';
  summary: string;
  detail?: string;
  key?: string;
}

@Injectable({providedIn: 'root'})
export class ToastService {
  private snackBar = inject(MatSnackBar);

  add(message: ToastMessage): void {
    const text = message.detail ? `${message.summary}: ${message.detail}` : message.summary;
    this.snackBar.open(text, 'Chiudi', {
      duration: 5000,
      panelClass: [`toast-${message.severity}`],
      horizontalPosition: 'end',
      verticalPosition: 'top'
    });
  }
}

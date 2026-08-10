import {Component, inject, ChangeDetectionStrategy} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';

export interface RestoreConfirmDialogData {
  fileName: string;
}

@Component({
  selector: 'app-restore-confirm-dialog',
  standalone: true,
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h2 mat-dialog-title>Conferma ripristino</h2>
    <mat-dialog-content>
      <p>
        Stai per sovrascrivere TUTTI i dati attuali con il contenuto del file
        <strong>{{ data.fileName }}</strong>. Questa azione è irreversibile.
      </p>
      <p>Inserisci la tua password per confermare:</p>
      <mat-form-field style="width: 100%;">
        <mat-label>Password</mat-label>
        <input matInput [type]="showPassword ? 'text' : 'password'" [(ngModel)]="password" name="password">
        <button mat-icon-button matSuffix type="button" (click)="showPassword = !showPassword">
          <mat-icon>{{ showPassword ? 'visibility_off' : 'visibility' }}</mat-icon>
        </button>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button (click)="cancel()">Annulla</button>
      <button mat-flat-button color="warn" [disabled]="!password" (click)="confirm()">Conferma ripristino</button>
    </mat-dialog-actions>
  `
})
export class RestoreConfirmDialogComponent {
  private dialogRef = inject(MatDialogRef<RestoreConfirmDialogComponent, string | undefined>);
  protected data = inject<RestoreConfirmDialogData>(MAT_DIALOG_DATA);

  password = '';
  showPassword = false;

  confirm(): void {
    if (!this.password) return;
    this.dialogRef.close(this.password);
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}

import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {MAT_DIALOG_DATA, MatDialogModule} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {AttachmentsComponent} from './attachments.component';

export interface InspectionAttachmentsDialogData {
  inspectionId: number;
  title: string;
  readOnly: boolean;
}

// Allegati di una singola verifica dell'impianto (es. il verbale).
@Component({
  selector: 'app-inspection-attachments-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, AttachmentsComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h2 mat-dialog-title>Allegati della verifica: {{ data.title }}</h2>
    <mat-dialog-content>
      <app-attachments entityType="plant_inspection" [entityId]="data.inspectionId"
                       [readOnly]="data.readOnly"></app-attachments>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button mat-dialog-close type="button">Chiudi</button>
    </mat-dialog-actions>
  `,
})
export class InspectionAttachmentsDialogComponent {
  protected data = inject<InspectionAttachmentsDialogData>(MAT_DIALOG_DATA);
}

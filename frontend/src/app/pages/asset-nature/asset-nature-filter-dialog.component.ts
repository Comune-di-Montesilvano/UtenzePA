import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {FilterDialogData} from '../../core/components/abstract-search.component';

export interface NameFilterValues {
  name: string | null;
}

@Component({
  selector: 'app-asset-nature-filter-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h2 mat-dialog-title>Filtri di ricerca</h2>
    <mat-dialog-content>
      <form [formGroup]="form" id="filter-form" (ngSubmit)="apply()" style="display: flex; flex-direction: column; gap: 1rem;">
        <mat-form-field>
          <mat-label>Nome</mat-label>
          <input matInput formControlName="name">
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button (click)="clear()">Pulisci Filtri</button>
      <button mat-flat-button type="submit" form="filter-form">Applica Filtri</button>
    </mat-dialog-actions>
  `
})
export class AssetNatureFilterDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<AssetNatureFilterDialogComponent, NameFilterValues | 'clear'>);
  protected data = inject<FilterDialogData<NameFilterValues>>(MAT_DIALOG_DATA);

  form = this.fb.group({name: [this.data.values.name ?? '']});

  apply(): void {
    this.dialogRef.close(this.form.getRawValue());
  }

  clear(): void {
    this.dialogRef.close('clear');
  }
}

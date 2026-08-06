import {Component, inject} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {plainToInstance} from 'class-transformer';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {AssetAggregator} from './entity/asset-aggregator.entity';

@Component({
  selector: 'app-asset-aggregator-edit-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  templateUrl: './asset-aggregator-edit-dialog.component.html'
})
export class AssetAggregatorEditDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<AssetAggregatorEditDialogComponent, AssetAggregator | undefined>);
  protected data = inject<EditDialogData<AssetAggregator>>(MAT_DIALOG_DATA);

  isNew = this.data.mode === 'create';

  form = this.fb.group({
    code: [this.data.item.code ?? '', Validators.required],
    description: [this.data.item.description ?? '', Validators.required],
  });

  save(): void {
    if (!this.form.valid) return;
    const result = plainToInstance(AssetAggregator, {
      id: this.data.item.id,
      ...this.form.getRawValue()
    });
    this.dialogRef.close(result);
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}

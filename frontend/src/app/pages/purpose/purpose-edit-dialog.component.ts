import {Component, inject} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {plainToInstance} from 'class-transformer';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {Purpose} from './entity/purpose.entity';
import {UseTypeOptions} from './enum/use-type.enum';

@Component({
  selector: 'app-purpose-edit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule
  ],
  templateUrl: './purpose-edit-dialog.component.html'
})
export class PurposeEditDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<PurposeEditDialogComponent, Purpose | undefined>);
  protected data = inject<EditDialogData<Purpose>>(MAT_DIALOG_DATA);

  useTypeOptions = UseTypeOptions;
  isNew = this.data.mode === 'create';

  form = this.fb.group({
    name: [this.data.item.name ?? '', Validators.required],
    use_type: [this.data.item.use_type ?? null, Validators.required],
  });

  save(): void {
    if (!this.form.valid) return;
    const result = plainToInstance(Purpose, {
      id: this.data.item.id,
      ...this.form.getRawValue()
    });
    this.dialogRef.close(result);
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}

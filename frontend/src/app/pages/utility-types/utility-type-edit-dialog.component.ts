import {Component, inject, ChangeDetectionStrategy} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {plainToInstance} from 'class-transformer';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {UtilityType} from './entity/utility-type.entity';
import {HardTypeOptions} from './enum/hard-type.enum';
import {AuthService} from '../../services/auth.service';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';

@Component({
  selector: 'app-utility-type-edit-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, HasRoleDirective, ReadOnlyDirective],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './utility-type-edit-dialog.component.html'
})
export class UtilityTypeEditDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<UtilityTypeEditDialogComponent, UtilityType | undefined>);
  private authService = inject(AuthService);
  protected data = inject<EditDialogData<UtilityType>>(MAT_DIALOG_DATA);

  hardTypeOptions = HardTypeOptions;
  isNew = this.data.mode === 'create';

  form = this.fb.group({
    name: [this.data.item.name ?? '', Validators.required],
    hard_type: [this.data.item.hard_type ?? null, Validators.required],
    description: [this.data.item.description ?? ''],
  });

  constructor() {
    const role = this.authService.getCurrentUser()?.role;
    if (!role || role === 'Lettore') {
      this.form.disable();
    }
  }

  save(): void {
    if (!this.form.valid) return;
    const result = plainToInstance(UtilityType, {
      id: this.data.item.id,
      ...this.form.getRawValue(),
    });
    this.dialogRef.close(result);
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}

import {Component, inject, ChangeDetectionStrategy} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {plainToInstance} from 'class-transformer';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {SystemUser} from './entity/system-user.entity';
import {AuthService} from '../../services/auth.service';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';

export const SYSTEM_USER_ROLE_OPTIONS: { label: string; value: SystemUser['role'] }[] = [
  {label: 'Admin', value: 'Admin'},
  {label: 'Operatore', value: 'Operatore'},
  {label: 'Lettore', value: 'Lettore'},
];

export const SYSTEM_USER_STATUS_OPTIONS: { label: string; value: SystemUser['status'] }[] = [
  {label: 'Attivo', value: 'Attivo'},
  {label: 'Disattivo', value: 'Disattivo'},
];

@Component({
  selector: 'app-system-user-edit-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, HasRoleDirective, ReadOnlyDirective],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './system-user-edit-dialog.component.html'
})
export class SystemUserEditDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<SystemUserEditDialogComponent, SystemUser | undefined>);
  private authService = inject(AuthService);
  protected data = inject<EditDialogData<SystemUser>>(MAT_DIALOG_DATA);

  roleOptions = SYSTEM_USER_ROLE_OPTIONS;
  statusOptions = SYSTEM_USER_STATUS_OPTIONS;
  isNew = this.data.mode === 'create';

  form = this.fb.group({
    firstName: [this.data.item.firstName ?? '', Validators.required],
    lastName: [this.data.item.lastName ?? '', Validators.required],
    email: [this.data.item.email ?? '', [Validators.required, Validators.email]],
    role: [this.data.item.role ?? 'Operatore', Validators.required],
    status: [this.data.item.status ?? 'Attivo', Validators.required],
  });

  constructor() {
    const role = this.authService.getCurrentUser()?.role;
    if (!role || role === 'Lettore') {
      this.form.disable();
    }
  }

  save(): void {
    if (!this.form.valid) return;
    const result = plainToInstance(SystemUser, {
      id: this.data.item.id,
      ...this.form.getRawValue()
    });
    this.dialogRef.close(result);
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}

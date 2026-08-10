import {Component, inject, ChangeDetectionStrategy} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {plainToInstance} from 'class-transformer';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {Utilizer} from './entity/utilizer.entity';
import {AuthService} from '../../services/auth.service';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';

@Component({
  selector: 'app-utilizer-edit-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, HasRoleDirective, ReadOnlyDirective],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './utilizer-edit-dialog.component.html'
})
export class UtilizerEditDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<UtilizerEditDialogComponent, Utilizer | undefined>);
  private authService = inject(AuthService);
  protected data = inject<EditDialogData<Utilizer>>(MAT_DIALOG_DATA);

  isNew = this.data.mode === 'create';

  form = this.fb.group({
    name: [this.data.item.name ?? '', Validators.required],
    description: [this.data.item.description ?? null],
  });

  constructor() {
    // ReadOnlyDirective sul <form> nel template imposta solo pointer-events:none,
    // bypassabile da tastiera/screen reader. Qui disabilitiamo esplicitamente il
    // FormGroup per il ruolo Lettore, cosi' i controlli sono anche
    // programmaticamente non modificabili e save() non puo' inviare dati
    // (gate di autorizzazione lato client per il ruolo Lettore).
    const role = this.authService.getCurrentUser()?.role;
    if (!role || role === 'Lettore') {
      this.form.disable();
    }
  }

  save(): void {
    if (!this.form.valid) return;
    const result = plainToInstance(Utilizer, {
      id: this.data.item.id,
      ...this.form.getRawValue()
    });
    this.dialogRef.close(result);
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}

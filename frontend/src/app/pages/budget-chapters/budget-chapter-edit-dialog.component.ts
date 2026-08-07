import {Component, inject} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {plainToInstance} from 'class-transformer';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {BudgetChapter} from './entity/budget-chapter.entity';
import {SupplyTypeOptions} from './enum/supply-type.enum';
import {AuthService} from '../../services/auth.service';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';
import {OnlyNumbersDirective} from '../../core/directives/only-numbers.directive';

@Component({
  selector: 'app-budget-chapter-edit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    HasRoleDirective,
    ReadOnlyDirective,
    OnlyNumbersDirective
  ],
  templateUrl: './budget-chapter-edit-dialog.component.html'
})
export class BudgetChapterEditDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<BudgetChapterEditDialogComponent, BudgetChapter | undefined>);
  private authService = inject(AuthService);
  protected data = inject<EditDialogData<BudgetChapter>>(MAT_DIALOG_DATA);

  supplyTypeOptions = SupplyTypeOptions;
  isNew = this.data.mode === 'create';

  form = this.fb.group({
    chapter_code: [{value: this.data.item.chapter_code ?? '', disabled: !this.isNew}, Validators.required],
    article: [this.data.item.article ?? '', Validators.required],
    pdc: [this.data.item.pdc ?? ''],
    supply_type: [this.data.item.supply_type ?? null, Validators.required],
    description: [this.data.item.description ?? ''],
  });

  constructor() {
    // ReadOnlyDirective sul <form> imposta solo pointer-events:none, bypassabile
    // da tastiera/screen reader. Disabilitiamo esplicitamente il FormGroup per il
    // ruolo Lettore (gate lato client, finding C1 dei gruppi precedenti).
    const role = this.authService.getCurrentUser()?.role;
    if (!role || role === 'Lettore') {
      this.form.disable();
    }
  }

  save(): void {
    if (!this.form.valid) return;
    const result = plainToInstance(BudgetChapter, {
      id: this.data.item.id,
      ...this.form.getRawValue()
    });
    this.dialogRef.close(result);
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}

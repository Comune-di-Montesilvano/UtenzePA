import {Component, inject, ChangeDetectionStrategy} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {MatTabsModule} from '@angular/material/tabs';
import {MatIconModule} from '@angular/material/icon';
import {BudgetChapterUtilitiesTabComponent} from './budget-chapter-utilities-tab.component';
import {BudgetChapterSpendingTabComponent} from './spending/budget-chapter-spending-tab.component';
import {plainToInstance} from 'class-transformer';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {BudgetChapter} from './entity/budget-chapter.entity';
import {MultiSelectComponent} from '../../core/components/multi-select.component';
import {UtilityTypesService} from '../utility-types/utility-types.service';
import type {TOption} from '../../core/types/option.interface';
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
    OnlyNumbersDirective,
    MatTabsModule,
    MatIconModule,
    MultiSelectComponent,
    BudgetChapterUtilitiesTabComponent,
    BudgetChapterSpendingTabComponent
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './budget-chapter-edit-dialog.component.html'
})
export class BudgetChapterEditDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<BudgetChapterEditDialogComponent, BudgetChapter | undefined>);
  private authService = inject(AuthService);
  protected data = inject<EditDialogData<BudgetChapter>>(MAT_DIALOG_DATA);

  utilityTypeOptions: TOption[] = [];
  isNew = this.data.mode === 'create';

  form = this.fb.group({
    chapter_code: [{value: this.data.item.chapter_code ?? '', disabled: !this.isNew}, Validators.required],
    article: [this.data.item.article ?? '', Validators.required],
    pdc: [this.data.item.pdc ?? ''],
    utility_type_ids: [(this.data.item.utilityTypes ?? []).map(t => t.id)],
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
    inject(UtilityTypesService).search({deleted: false}).subscribe({
      next: list => this.utilityTypeOptions = list.map(t => ({label: t.name, value: t.id})),
      error: err => console.error('Errore nel caricamento dei tipi utenza:', err),
    });
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

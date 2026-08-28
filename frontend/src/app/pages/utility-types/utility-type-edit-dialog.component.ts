import {Component, inject, OnInit, ChangeDetectionStrategy} from '@angular/core';
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
import {PurposeService} from '../purpose/purpose.service';
import {Purpose} from '../purpose/entity/purpose.entity';
import {UseType} from '../purpose/enum/use-type.enum';

@Component({
  selector: 'app-utility-type-edit-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, HasRoleDirective, ReadOnlyDirective],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './utility-type-edit-dialog.component.html'
})
export class UtilityTypeEditDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<UtilityTypeEditDialogComponent, UtilityType | undefined>);
  private authService = inject(AuthService);
  private purposeService = inject(PurposeService);
  protected data = inject<EditDialogData<UtilityType>>(MAT_DIALOG_DATA);

  hardTypeOptions = HardTypeOptions;
  isNew = this.data.mode === 'create';

  genericPurposes: Purpose[] = [];
  specificPurposes: Purpose[] = [];

  form = this.fb.group({
    name: [this.data.item.name ?? '', Validators.required],
    hard_type: [this.data.item.hard_type ?? null, Validators.required],
    description: [this.data.item.description ?? ''],
    generic_purpose_ids: [(this.data.item.purposes ?? []).filter(p => p.use_type === UseType.GENERIC).map(p => p.id)],
    specific_purpose_ids: [(this.data.item.purposes ?? []).filter(p => p.use_type === UseType.SPECIFIC).map(p => p.id)],
  });

  constructor() {
    const role = this.authService.getCurrentUser()?.role;
    if (!role || role === 'Lettore') {
      this.form.disable();
    }
  }

  ngOnInit(): void {
    this.purposeService.search({deleted: false}).subscribe(purposes => {
      this.genericPurposes = purposes.filter(p => p.use_type === UseType.GENERIC);
      this.specificPurposes = purposes.filter(p => p.use_type === UseType.SPECIFIC);
    });
  }

  save(): void {
    if (!this.form.valid) return;
    const {generic_purpose_ids, specific_purpose_ids, ...rest} = this.form.getRawValue();
    const allIds = [...(generic_purpose_ids ?? []), ...(specific_purpose_ids ?? [])];
    const purposes = allIds
      .map(id => [...this.genericPurposes, ...this.specificPurposes].find(p => p.id === id))
      .filter((p): p is Purpose => p != null);
    const result = plainToInstance(UtilityType, {
      id: this.data.item.id,
      ...rest,
      purposes
    });
    this.dialogRef.close(result);
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}

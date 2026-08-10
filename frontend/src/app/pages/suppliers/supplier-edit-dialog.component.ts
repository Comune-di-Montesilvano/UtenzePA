import {Component, inject, ChangeDetectionStrategy} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {plainToInstance} from 'class-transformer';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {Supplier} from './entity/supplier.entity';
import {AuthService} from '../../services/auth.service';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';
import {
  italianPostalCodeValidator,
  italianTaxCodeValidator,
  italianVatNumberValidator,
  taxCodeMatchesVatNumberValidator
} from '../../core/validators/italian.validators';

@Component({
  selector: 'app-supplier-edit-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, HasRoleDirective, ReadOnlyDirective],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './supplier-edit-dialog.component.html'
})
export class SupplierEditDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<SupplierEditDialogComponent, Supplier | undefined>);
  private authService = inject(AuthService);
  protected data = inject<EditDialogData<Supplier>>(MAT_DIALOG_DATA);

  isNew = this.data.mode === 'create';

  form = this.fb.group({
    supplier_id: [{value: this.data.item.supplier_id ?? '', disabled: !this.isNew}, Validators.required],
    company_name: [this.data.item.company_name ?? '', Validators.required],
    vat_number: [this.data.item.vat_number ?? '', [italianVatNumberValidator()]],
    tax_code: [this.data.item.tax_code ?? '', [italianTaxCodeValidator()]],
    address: [this.data.item.address ?? ''],
    city: [this.data.item.city ?? ''],
    postal_code: [this.data.item.postal_code ?? '', [italianPostalCodeValidator()]],
    email: [this.data.item.email ?? ''],
    pec: [this.data.item.pec ?? ''],
  }, {validators: taxCodeMatchesVatNumberValidator()});

  constructor() {
    const role = this.authService.getCurrentUser()?.role;
    if (!role || role === 'Lettore') {
      this.form.disable();
    }
  }

  save(): void {
    if (!this.form.valid) return;
    const result = plainToInstance(Supplier, {
      id: this.data.item.id,
      ...this.form.getRawValue()
    });
    this.dialogRef.close(result);
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}

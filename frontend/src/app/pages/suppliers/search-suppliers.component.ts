import {Component, Type, ChangeDetectionStrategy} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {AbstractSearchComponent} from '../../core/components/abstract-search.component';
import {SupplierFilterDialogComponent} from './supplier-filter-dialog.component';

@Component({
  selector: 'app-search-suppliers',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './search-suppliers.component.html',
})
export class SearchSuppliersComponent extends AbstractSearchComponent {

  constructor(private fb: FormBuilder) {
    super();
    this.qSearch = this.fb.group({
      qsearch: [''],
      supplier_id: [''],
      company_name: [''],
      vat_number: [''],
      tax_code: [''],
      address: [''],
      city: [''],
      postal_code: [''],
      email: [''],
      pec: [''],
    });
  }

  override filterDialogComponent(): Type<unknown> {
    return SupplierFilterDialogComponent;
  }

  override filterDialogWidth(): string {
    return '550px';
  }
}

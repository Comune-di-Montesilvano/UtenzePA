import {Component, Type, ChangeDetectionStrategy} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {AbstractSearchComponent} from '../../core/components/abstract-search.component';
import {ContractFilterDialogComponent} from './contract-filter-dialog.component';

@Component({
  selector: 'app-search-contracts',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './search-contracts.component.html',
})
export class SearchContractsComponent extends AbstractSearchComponent {

  constructor(private fb: FormBuilder) {
    super();
    this.qSearch = this.fb.group({
      qsearch: [''],
      cig_contract: [''],
      order_number: [''],
      supplier_id_fk: [null],
      supply_expiry_date_range: [null],
    });
  }

  override filterDialogComponent(): Type<unknown> {
    return ContractFilterDialogComponent;
  }
}

import {Component, Type} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {AbstractSearchComponent} from '../../core/components/abstract-search.component';
import {ConsipAgreementFilterDialogComponent} from './consip-agreement-filter-dialog.component';

@Component({
  selector: 'app-search-consip-agreement',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule
  ],
  templateUrl: './search-consip-agreement.component.html',
})
export class SearchConsipAgreementComponent extends AbstractSearchComponent {

  constructor(private fb: FormBuilder) {
    super();
    this.qSearch = this.fb.group({
      qsearch: [''],
      name: [''],
      supplier_id: [null],
      description: [''],
      cig_master: [''],
      expiration_date_range: [[null, null]],
      safeguard: [null],
    });
  }

  override filterDialogComponent(): Type<unknown> {
    return ConsipAgreementFilterDialogComponent;
  }

  override filterDialogWidth(): string {
    return '31vw';
  }
}

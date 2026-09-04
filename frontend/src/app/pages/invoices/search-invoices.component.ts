import {Component, Type, ChangeDetectionStrategy} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {AbstractSearchComponent} from '../../core/components/abstract-search.component';
import {InvoiceFilterDialogComponent} from './invoice-filter-dialog.component';

@Component({
  selector: 'app-search-invoices',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './search-invoices.component.html',
})
export class SearchInvoicesComponent extends AbstractSearchComponent {

  constructor(private fb: FormBuilder) {
    super();
    this.qSearch = this.fb.group({
      qsearch: [''],
      invoice_id: [''],
      protocol_number: [''],
      net_amount_excl_vat: [null],
      last_invoice_arrears: [null],
      contratto_id_fk: [null],
      budget_chapter_ids: [null],
      invoice_date_from: [null],
      invoice_date_to: [null],
      notes_on_invoices: [''],
    });
  }

  override filterDialogComponent(): Type<unknown> {
    return InvoiceFilterDialogComponent;
  }

  override filterDialogWidth(): string {
    return '1000px';
  }
}

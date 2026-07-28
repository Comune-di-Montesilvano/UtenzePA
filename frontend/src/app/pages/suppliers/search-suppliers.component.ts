import {Component, OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {ButtonModule} from 'primeng/button';
import {InputTextModule} from 'primeng/inputtext';
import {DialogModule} from 'primeng/dialog';
import {SelectModule} from 'primeng/select';
import {AbstractSearchComponent} from '../../core/components/abstract-search.component';

@Component({
             selector: 'app-search-suppliers',
             standalone: true,
             imports: [
               CommonModule,
               ReactiveFormsModule,
               ButtonModule,
               InputTextModule,
               DialogModule,
               SelectModule
             ],
             templateUrl: './search-suppliers.component.html',
           })
export class SearchSuppliersComponent extends AbstractSearchComponent implements OnInit {

  constructor(private fb: FormBuilder) {
    super();
    this.qSearch = this.fb.group(
      {
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
}

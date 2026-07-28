import {Component, OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {ButtonModule} from 'primeng/button';
import {InputTextModule} from 'primeng/inputtext';
import {DialogModule} from 'primeng/dialog';
import {SelectModule} from 'primeng/select';
import {RadioButtonModule} from 'primeng/radiobutton';
import {SuppliersService} from '../suppliers/suppliers.service';
import {DatePicker} from 'primeng/datepicker';
import {AbstractSearchComponent} from '../../core/components/abstract-search.component';
import {TOption} from '../../core/types/option.interface';

@Component({
             selector: 'app-search-consip-agreement',
             standalone: true,
             imports: [
               CommonModule,
               ReactiveFormsModule,
               ButtonModule,
               InputTextModule,
               DialogModule,
               SelectModule,
               RadioButtonModule,
               DatePicker
             ],
             templateUrl: './search-consip-agreement.component.html',
           })
export class SearchConsipAgreement extends AbstractSearchComponent implements OnInit {

  supplierOptions: TOption[] = [];
  minEndDate: Date | null = null;

  constructor(private fb: FormBuilder, private readonly supplierService: SuppliersService) {
    super();
    this.qSearch = this.fb.group(
      {
        qsearch: [''],
        name: [''],
        supplier_id: [null],
        description: [''],
        cig_master: [''],
        expiration_date_range: [''],
        safeguard: [null],
        deleted: [false],
      });
  }

  override ngOnInit() {
    super.ngOnInit();
    this.loadOptions(this.supplierService, 'id', 'supplier_id', {deleted: false})
        .subscribe({next: options => this.supplierOptions = options});
  }
}

import {Component, OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {ButtonModule} from 'primeng/button';
import {InputTextModule} from 'primeng/inputtext';
import {DialogModule} from 'primeng/dialog';
import {SelectModule} from 'primeng/select';
import {InputNumberModule} from 'primeng/inputnumber';
import {CheckboxModule} from 'primeng/checkbox';
import {DatePickerModule} from 'primeng/datepicker';
import {SuppliersService} from '../suppliers/suppliers.service';
import {BudgetChaptersService} from '../budget-chapters/budget-chapters.service';
import {UtilityService} from '../utilities/utility.service';
import {MultiSelectModule} from 'primeng/multiselect';
import {AbstractSearchComponent} from '../../core/components/abstract-search.component';
import {TOption} from '../../core/types/option.interface';

@Component({
             selector: 'app-search-invoices',
             standalone: true,
             imports: [
               CommonModule,
               ReactiveFormsModule,
               ButtonModule,
               InputTextModule,
               DialogModule,
               SelectModule,
               InputNumberModule,
               CheckboxModule,
               DatePickerModule,
               MultiSelectModule
             ],
             templateUrl: './search-invoices.component.html',
             styleUrls: ['./search-invoices.component.css']
           })
export class SearchInvoicesComponent extends AbstractSearchComponent implements OnInit {
  supplierOptions: TOption[] = [];
  utilityOptions: TOption[] = [];
  budgetChapterOptions: TOption[] = [];

  constructor(
    private fb: FormBuilder,
    private suppliersService: SuppliersService,
    private budgetChapterService: BudgetChaptersService,
    private utilitiesService: UtilityService
  ) {
    super();
    this.qSearch = this.fb.group({
                                   qsearch: [''],
                                   invoice_id: [''],
                                   protocol_number: [''],
                                   net_amount_excl_vat: [null],
                                   last_invoice_arrears: [null],
                                   utility_id_fk: [null],
                                   supplier_id_fk: [null],
                                   budget_chapter_ids: [null],
                                   deleted: [null],
                                   invoice_date_range: [null],
                                   create_date_range: [null],
                                   notes_on_invoices: ['']
                                 });
  }

  override ngOnInit() {
    super.ngOnInit();
    this.loadDependencies();
  }

  loadDependencies() {
    this.loadOptions(this.suppliersService, 'id', 'supplier_id', {deleted: false})
      .subscribe({ next: options => this.supplierOptions = options });

    this.loadOptions(
      this.utilitiesService,
      'id',
      u => `${u.utility_id} (${u.utility_code || 'N/D'})`,
      {deleted: false}
    ).subscribe({ next: options => this.utilityOptions = options });

    this.loadOptions(
      this.budgetChapterService,
      'id',
      b => `${b.chapter_code} - ${b.description}`,
      {deleted: false}
    ).subscribe({ next: options => this.budgetChapterOptions = options });
  }


  protected override onClear() {
    this.qSearch.reset();
    this.search.emit({});
    this.filterDialogVisible = false;
  }
}

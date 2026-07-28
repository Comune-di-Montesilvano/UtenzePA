import {Component, OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {ButtonModule} from 'primeng/button';
import {InputTextModule} from 'primeng/inputtext';
import {DialogModule} from 'primeng/dialog';
import {SelectModule} from 'primeng/select';
import {UseTypeOptions} from './enum/use-type.enum';
import {ISupplier} from '../suppliers/entity/supplier.interface';
import {AbstractSearchComponent} from '../../core/components/abstract-search.component';

@Component({
             selector: 'app-search-purpose',
             standalone: true,
             imports: [
               CommonModule,
               ReactiveFormsModule,
               ButtonModule,
               InputTextModule,
               DialogModule,
               SelectModule
             ],
             templateUrl: './search-purpose.component.html',
           })
export class SearchPurposeComponent extends AbstractSearchComponent implements OnInit {

  supplierOptions: ISupplier[] = [];
  useTypeOptions = [
    {label: 'Tutti', value: null},
    ...UseTypeOptions
  ];

  constructor(private fb: FormBuilder) {
    super();
    this.qSearch = this.fb.group(
      {
        qsearch: [''],
        name: [''],
        use_type: [null],
      });
  }

}

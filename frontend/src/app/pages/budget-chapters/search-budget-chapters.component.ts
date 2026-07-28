import {Component, OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {ButtonModule} from 'primeng/button';
import {InputTextModule} from 'primeng/inputtext';
import {DialogModule} from 'primeng/dialog';
import {SelectModule} from 'primeng/select';
import {SupplyTypeOptions} from './enum/supply-type.enum';
import {AbstractSearchComponent} from '../../core/components/abstract-search.component';

@Component({
             selector: 'app-search-budget-chapters',
             standalone: true,
             imports: [
               CommonModule,
               ReactiveFormsModule,
               ButtonModule,
               InputTextModule,
               DialogModule,
               SelectModule
             ],
             templateUrl: './search-budget-chapters.component.html',
           })
export class SearchBudgetChapters extends AbstractSearchComponent implements OnInit {

  supplyOptions = [
    {label: 'Tutti', value: null},
    ...SupplyTypeOptions
  ];

  constructor(private fb: FormBuilder) {
    super();
    this.qSearch = this.fb.group(
      {
        qsearch: [''],
        chapter_code: [''],
        article: [''],
        description: [''],
        pdc: [''],
        supply_type: [null],
        deleted: [null]
      });
  }
}

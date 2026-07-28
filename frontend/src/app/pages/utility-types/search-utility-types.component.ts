import {Component} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {ButtonModule} from 'primeng/button';
import {InputTextModule} from 'primeng/inputtext';
import {DialogModule} from 'primeng/dialog';
import {SelectModule} from 'primeng/select';
import {AbstractSearchComponent} from '../../core/components/abstract-search.component';
import {HardTypeOptions} from './enum/hard-type.enum';

@Component({
             selector: 'app-search-utility-type',
             standalone: true,
             imports: [
               CommonModule,
               ReactiveFormsModule,
               ButtonModule,
               InputTextModule,
               DialogModule,
               SelectModule
             ],
             templateUrl: './search-utility-types.component.html',
           })
export class SearchFormUtilityTypes extends AbstractSearchComponent {

  hardTypeOptions = HardTypeOptions;

  constructor(private fb: FormBuilder) {
    super();
    this.qSearch = this.fb.group(
      {
        qsearch: [''],
        name: [''],
        description: [''],
        hard_type: [null],
        createDateFrom: [null],
        createDateTo: [null],
        updateDateFrom: [null],
        updateDateTo: [null]
      });
  }
}

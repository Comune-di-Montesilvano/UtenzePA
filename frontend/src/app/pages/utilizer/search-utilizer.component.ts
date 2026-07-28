import {Component, OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {ButtonModule} from 'primeng/button';
import {InputTextModule} from 'primeng/inputtext';
import {DialogModule} from 'primeng/dialog';
import {SelectModule} from 'primeng/select';
import {InputNumberModule} from 'primeng/inputnumber';
import {RadioButtonModule} from 'primeng/radiobutton';
import {DatePickerModule} from 'primeng/datepicker';
import {AbstractSearchComponent} from '../../core/components/abstract-search.component';

@Component({
             selector: 'app-search-utilizer',
             standalone: true,
             imports: [
               CommonModule,
               ReactiveFormsModule,
               ButtonModule,
               InputTextModule,
               DialogModule,
               SelectModule,
               InputNumberModule,
               RadioButtonModule,
               DatePickerModule,
             ],
             templateUrl: './search-utilizer.component.html',
           })
export class SearchUtilizerComponent extends AbstractSearchComponent implements OnInit {

  constructor(
    private fb: FormBuilder,
  ) {
    super();
    this.qSearch = this.fb.group(
      {
        qsearch: [''],
        name: [''],
        description: [''],
        deleted: [null],
      });
  }

  override ngOnInit() {
    super.ngOnInit();
  }
}



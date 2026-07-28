import {Component, OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {ButtonModule} from 'primeng/button';
import {InputTextModule} from 'primeng/inputtext';
import {DialogModule} from 'primeng/dialog';
import {SelectModule} from 'primeng/select';
import {AbstractSearchComponent} from '../../core/components/abstract-search.component';

@Component({
             selector: 'app-search-maintenance-managers',
             standalone: true,
             imports: [
               CommonModule,
               ReactiveFormsModule,
               ButtonModule,
               InputTextModule,
               DialogModule,
               SelectModule
             ],
             templateUrl: './search-maintenance-managers.component.html',
           })
export class SearchFormMaintenanceManagers extends AbstractSearchComponent implements OnInit {

  constructor(private fb: FormBuilder) {
    super();
    this.qSearch = this.fb.group(
      {
        qsearch: [''],
        code: [''],
        description: [''],
      });
  }
}

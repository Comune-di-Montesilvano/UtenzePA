import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { DialogModule } from 'primeng/dialog';
import { AbstractSearchComponent } from '../../core/components/abstract-search.component';

@Component({
  selector: 'app-search-aggregators',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    DialogModule,
  ],
  templateUrl: './search-asset-aggregator.component.html',
})
export class SearchAggregators extends AbstractSearchComponent implements OnInit {

  constructor(private fb: FormBuilder) {
    super();
    this.qSearch = this.fb.group({
      qsearch: [''],
      description: [''],
      code: [''],
    });
  }
}

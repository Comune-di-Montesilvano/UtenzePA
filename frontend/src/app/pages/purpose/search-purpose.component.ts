import {Component, inject, OnInit} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatDialog} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {UseTypeOptions} from './enum/use-type.enum';
import {AbstractSearchComponent} from '../../core/components/abstract-search.component';
import {PurposeFilterDialogComponent} from './purpose-filter-dialog.component';

@Component({
  selector: 'app-search-purpose',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule
  ],
  templateUrl: './search-purpose.component.html',
})
export class SearchPurposeComponent extends AbstractSearchComponent implements OnInit {

  useTypeOptions = [
    {label: 'Tutti', value: null},
    ...UseTypeOptions
  ];

  private dialog = inject(MatDialog);

  constructor(private fb: FormBuilder) {
    super();
    this.qSearch = this.fb.group({
      qsearch: [''],
      name: [''],
      use_type: [null],
    });
  }

  openFilterDialog(): void {
    const ref = this.dialog.open(PurposeFilterDialogComponent, {
      width: '31vw',
      data: {form: this.qSearch, useTypeOptions: this.useTypeOptions}
    });
    ref.afterClosed().subscribe(applied => {
      if (applied) this.onSearch();
    });
  }
}

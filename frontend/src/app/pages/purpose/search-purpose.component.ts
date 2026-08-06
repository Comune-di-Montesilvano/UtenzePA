import {Component, Type} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
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
export class SearchPurposeComponent extends AbstractSearchComponent {

  constructor(private fb: FormBuilder) {
    super();
    this.qSearch = this.fb.group({
      qsearch: [''],
      name: [''],
      use_type: [null],
    });
  }

  override filterDialogComponent(): Type<unknown> {
    return PurposeFilterDialogComponent;
  }
}

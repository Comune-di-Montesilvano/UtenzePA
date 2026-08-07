import {Component, Type} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {AbstractSearchComponent} from '../../core/components/abstract-search.component';
import {UtilityTypeFilterDialogComponent} from './utility-type-filter-dialog.component';

@Component({
  selector: 'app-search-utility-type',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule],
  templateUrl: './search-utility-types.component.html',
})
export class SearchFormUtilityTypes extends AbstractSearchComponent {

  constructor(private fb: FormBuilder) {
    super();
    this.qSearch = this.fb.group({
      qsearch: [''],
      name: [''],
      description: [''],
      hard_type: [null],
    });
  }

  override filterDialogComponent(): Type<unknown> {
    return UtilityTypeFilterDialogComponent;
  }
}

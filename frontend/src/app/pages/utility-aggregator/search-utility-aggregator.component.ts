import {Component, Type, ChangeDetectionStrategy} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {AbstractSearchComponent} from '../../core/components/abstract-search.component';
import {UtilityAggregatorFilterDialogComponent} from './utility-aggregator-filter-dialog.component';

@Component({
  selector: 'app-search-utility-aggregators',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './search-utility-aggregator.component.html',
})
export class SearchUtilityAggregators extends AbstractSearchComponent {

  constructor(private fb: FormBuilder) {
    super();
    this.qSearch = this.fb.group({
      qsearch: [''],
      code: [''],
      description: [''],
    });
  }

  override filterDialogComponent(): Type<unknown> {
    return UtilityAggregatorFilterDialogComponent;
  }
}

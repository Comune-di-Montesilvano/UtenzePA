import {Component} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {Type} from '@angular/core';
import {AbstractSearchComponent} from '../../core/components/abstract-search.component';
import {AssetAggregatorFilterDialogComponent} from './asset-aggregator-filter-dialog.component';

@Component({
  selector: 'app-search-aggregators',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule],
  templateUrl: './search-asset-aggregator.component.html',
})
export class SearchAggregators extends AbstractSearchComponent {

  constructor(private fb: FormBuilder) {
    super();
    this.qSearch = this.fb.group({
      qsearch: [''],
      description: [''],
      code: [''],
    });
  }

  override filterDialogComponent(): Type<unknown> {
    return AssetAggregatorFilterDialogComponent;
  }
}

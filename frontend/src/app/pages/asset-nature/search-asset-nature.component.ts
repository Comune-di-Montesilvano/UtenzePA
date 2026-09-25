import {ChangeDetectionStrategy, Component, Type} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {AbstractSearchComponent} from '../../core/components/abstract-search.component';
import {AssetNatureFilterDialogComponent} from './asset-nature-filter-dialog.component';

@Component({
  selector: 'app-search-asset-nature',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: '../asset-aggregator/search-asset-aggregator.component.html',
})
export class SearchAssetNatureComponent extends AbstractSearchComponent {
  constructor(private fb: FormBuilder) {
    super();
    this.qSearch = this.fb.group({qsearch: [''], name: ['']});
  }

  override filterDialogComponent(): Type<unknown> {
    return AssetNatureFilterDialogComponent;
  }
}

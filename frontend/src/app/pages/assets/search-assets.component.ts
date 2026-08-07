import {Component, Type} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {AbstractSearchComponent} from '../../core/components/abstract-search.component';
import {AssetFilterDialogComponent} from './asset-filter-dialog.component';

@Component({
  selector: 'app-search-assets',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule],
  templateUrl: './search-assets.component.html',
})
export class SearchAssetsComponent extends AbstractSearchComponent {

  constructor(private fb: FormBuilder) {
    super();
    this.qSearch = this.fb.group({
      qsearch: [''],
      asset_name: [''],
      asset_type_id: [null],
      category: [null],
      ownership: [null],
      toponym: [null],
      address: [''],
      civic_number: [''],
      municipality: [''],
      zip_code: [''],
      latitude: [''],
      longitude: [''],
      services_and_artifacts: [''],
      cadastral_value: [null],
      area_sqm: [null],
      sheet: [''],
      parcel: [''],
      subordinate: [''],
      associated_building: [''],
      specific_details: [''],
      memo: [''],
    });
  }

  override filterDialogComponent(): Type<unknown> {
    return AssetFilterDialogComponent;
  }

  override filterDialogWidth(): string {
    return '1000px';
  }
}

import {Component, Type, ChangeDetectionStrategy} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {AbstractSearchComponent} from '../../core/components/abstract-search.component';
import {UtilizerGrantFilterDialogComponent} from './utilizer-grant-filter-dialog.component';

@Component({
  selector: 'app-search-utilizer-grant',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './search-utilizer-grant.component.html',
})
export class SearchUtilizerGrantComponent extends AbstractSearchComponent {

  constructor(private fb: FormBuilder) {
    super();
    this.qSearch = this.fb.group({
      qsearch: [''],
      alert: [null],
      computed_status: [null],
      direction: [null],
      kind: [null],
      asset_id: [null],
      party_id: [null],
      department: [''],
      concession_act: [''],
      utilities_to_be_taken_over: [null],
    });
  }

  override filterDialogComponent(): Type<unknown> {
    return UtilizerGrantFilterDialogComponent;
  }

  override filterDialogWidth(): string {
    return '700px';
  }
}

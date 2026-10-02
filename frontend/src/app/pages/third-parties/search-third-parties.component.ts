import {ChangeDetectionStrategy, Component, Type} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {AbstractSearchComponent} from '../../core/components/abstract-search.component';
import {ThirdPartyFilterDialogComponent} from './third-party-filter-dialog.component';

@Component({
  selector: 'app-search-third-parties',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './search-third-parties.component.html',
})
export class SearchThirdPartiesComponent extends AbstractSearchComponent {

  constructor(private fb: FormBuilder) {
    super();
    this.qSearch = this.fb.group({
      qsearch: [''],
      q: [''],
      type: [null],
      kind: [null],
    });
  }

  override filterDialogComponent(): Type<unknown> {
    return ThirdPartyFilterDialogComponent;
  }

  override filterDialogWidth(): string {
    return '600px';
  }
}

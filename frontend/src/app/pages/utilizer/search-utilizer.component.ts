import {Component, Type, ChangeDetectionStrategy} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {AbstractSearchComponent} from '../../core/components/abstract-search.component';
import {UtilizerFilterDialogComponent} from './utilizer-filter-dialog.component';

@Component({
  selector: 'app-search-utilizer',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './search-utilizer.component.html',
})
export class SearchUtilizerComponent extends AbstractSearchComponent {

  constructor(private fb: FormBuilder) {
    super();
    this.qSearch = this.fb.group({
      qsearch: [''],
      name: [''],
      description: [''],
    });
  }

  override filterDialogComponent(): Type<unknown> {
    return UtilizerFilterDialogComponent;
  }

  override filterDialogWidth(): string {
    return '700px';
  }
}

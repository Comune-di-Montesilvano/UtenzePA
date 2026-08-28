import {Component, Type, ChangeDetectionStrategy} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {AbstractSearchComponent} from '../../core/components/abstract-search.component';
import {SystemUserFilterDialogComponent} from './system-user-filter-dialog.component';

@Component({
  selector: 'app-search-users',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './search-users.component.html',
})
export class SearchUsersComponent extends AbstractSearchComponent {

  constructor(private fb: FormBuilder) {
    super();
    this.qSearch = this.fb.group({
      qsearch: [''],
      firstName: [''],
      lastName: [''],
      email: [''],
      role: [null],
      status: [null],
    });
  }

  override filterDialogComponent(): Type<unknown> {
    return SystemUserFilterDialogComponent;
  }
}

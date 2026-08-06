import {Component, Type} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {AbstractSearchComponent} from '../../core/components/abstract-search.component';
import {MaintenanceManagerFilterDialogComponent} from './maintenance-manager-filter-dialog.component';

@Component({
  selector: 'app-search-maintenance-managers',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule],
  templateUrl: './search-maintenance-managers.component.html',
})
export class SearchFormMaintenanceManagers extends AbstractSearchComponent {

  constructor(private fb: FormBuilder) {
    super();
    this.qSearch = this.fb.group({
      qsearch: [''],
      code: [''],
      description: [''],
    });
  }

  override filterDialogComponent(): Type<unknown> {
    return MaintenanceManagerFilterDialogComponent;
  }

  override filterDialogWidth(): string {
    return '500px';
  }
}

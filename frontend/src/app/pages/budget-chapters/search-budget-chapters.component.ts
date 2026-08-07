import {Component, Type} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {AbstractSearchComponent} from '../../core/components/abstract-search.component';
import {BudgetChapterFilterDialogComponent} from './budget-chapter-filter-dialog.component';

@Component({
  selector: 'app-search-budget-chapters',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule],
  templateUrl: './search-budget-chapters.component.html',
})
export class SearchBudgetChapters extends AbstractSearchComponent {

  constructor(private fb: FormBuilder) {
    super();
    this.qSearch = this.fb.group({
      qsearch: [''],
      chapter_code: [''],
      article: [''],
      description: [''],
      pdc: [''],
      supply_type: [null],
    });
  }

  override filterDialogComponent(): Type<unknown> {
    return BudgetChapterFilterDialogComponent;
  }
}

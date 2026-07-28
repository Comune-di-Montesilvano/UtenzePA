import {Component} from '@angular/core';
import {CommonModule} from '@angular/common';
import {TableModule} from 'primeng/table';
import {DialogModule} from 'primeng/dialog';
import {ButtonModule} from 'primeng/button';
import {ReactiveFormsModule, Validators} from '@angular/forms';
import {SelectModule} from 'primeng/select';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {InputTextModule} from 'primeng/inputtext';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';
import {OnlyNumbersDirective} from '../../core/directives/only-numbers.directive';
import {ScreenSizeService} from '../../services/screen-size.service';
import {Textarea} from 'primeng/textarea';
import {BudgetChapter} from './entity/budget-chapter.entity';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {SupplyType, SupplyTypeDescription, SupplyTypeOptions} from './enum/supply-type.enum';
import {SkeletonModule} from 'primeng/skeleton';

@Component({
             selector: 'app-data-table-budget-chapters',
             standalone: true,
             imports: [
               ReactiveFormsModule,
               CommonModule,
               TableModule,
               DialogModule,
               ButtonModule,
               SelectModule,
               HasRoleDirective,
               InputTextModule,
               ReadOnlyDirective,
               OnlyNumbersDirective,
               Textarea,
               SkeletonModule
             ],
             templateUrl: './data-table-budget-chapters.component.html'
           })
export class DataTableBudgetChaptersComponent extends AbstractDataTableComponent<BudgetChapter> {

  readonly skeletonRows = Array(10).fill({});
  readonly skeletonCols = Array.from({length: 7}, (_, i) => i);

  supplyTypeDescription = SupplyTypeDescription;
  supplyTypeOptions = SupplyTypeOptions;

  constructor(screen: ScreenSizeService) {
    super(screen);
  }

  override itemInstance(): BudgetChapter {
    return BudgetChapter.create();
  }

  protected override buildForm(data?: Partial<BudgetChapter>): void {
    this.form = this.fb.group({
      chapter_code: [{value: data?.chapter_code ?? '', disabled: !this.isNew}, Validators.required],
      article:      [data?.article      ?? '', Validators.required],
      pdc:          [data?.pdc          ?? ''],
      supply_type:  [data?.supply_type  ?? null, Validators.required],
      description:  [data?.description  ?? ''],
    });
  }

  getSupplyTypeDescription(value: any): string {
    return this.supplyTypeDescription[value as SupplyType] || value;
  }

  override isFormValid(): boolean {
    return this.form?.valid ?? false;
  }
}

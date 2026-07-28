import {Component} from '@angular/core';
import {CommonModule} from '@angular/common';
import {TableModule} from 'primeng/table';
import {DialogModule} from 'primeng/dialog';
import {ButtonModule} from 'primeng/button';
import {ReactiveFormsModule, Validators} from '@angular/forms';
import {SelectModule} from 'primeng/select';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {InputTextModule} from 'primeng/inputtext';
import {Textarea} from 'primeng/textarea';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';
import {ScreenSizeService} from '../../services/screen-size.service';
import {UtilityAggregator} from './entity/utility-aggregator.entity';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {SkeletonModule} from 'primeng/skeleton';

@Component({
             selector: 'app-data-table-utility-aggregators',
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
               Textarea,
               ReadOnlyDirective,
               SkeletonModule,
             ],
             templateUrl: './data-table-utility-aggregator.component.html'
           })
export class DataTableUtilityAggregatorsComponent extends AbstractDataTableComponent<UtilityAggregator> {

  readonly skeletonRows = Array(10).fill({});
  readonly skeletonCols = Array.from({length: 4}, (_, i) => i);

  constructor(screen: ScreenSizeService) {
    super(screen);
  }

  override itemInstance(): UtilityAggregator {
    return UtilityAggregator.create();
  }

  protected override buildForm(data?: Partial<UtilityAggregator>): void {
    this.form = this.fb.group(
      {
        code: [data?.code ?? '', Validators.required],
        description: [data?.description ?? ''],
      });
  }

  override isFormValid(): boolean {
    return this.form?.valid ?? false;
  }
}

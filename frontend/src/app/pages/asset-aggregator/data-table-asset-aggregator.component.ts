import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { ReactiveFormsModule, Validators } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { HasRoleDirective } from '../../core/directives/has-role.directive';
import { ReadOnlyDirective } from '../../core/directives/read-only.directive';
import { AssetAggregator } from './entity/asset-aggregator.entity';
import { ScreenSizeService } from '../../services/screen-size.service';
import { AbstractDataTableComponent } from '../../core/components/abstract-data-table.component';
import { InputText } from 'primeng/inputtext';
import { Textarea } from 'primeng/textarea';
import { SkeletonModule } from 'primeng/skeleton';

@Component({
  selector: 'app-data-table-aggregators',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    CommonModule,
    TableModule,
    DialogModule,
    ButtonModule,
    SelectModule,
    HasRoleDirective,
    ReadOnlyDirective,
    InputText,
    Textarea,
    SkeletonModule,
  ],
  templateUrl: './data-table-asset-aggregator.component.html'
})
export class DataTableAggregatorsComponent extends AbstractDataTableComponent<AssetAggregator> {

  readonly skeletonRows = Array(10).fill({});
  readonly skeletonCols = Array.from({length: 4}, (_, i) => i);

  constructor(screen: ScreenSizeService) {
    super(screen);
  }

  override itemInstance(): AssetAggregator {
    return AssetAggregator.create();
  }

  protected override buildForm(data?: Partial<AssetAggregator>): void {
    this.form = this.fb.group({
      code:        [data?.code        ?? '', Validators.required],
      description: [data?.description ?? '', Validators.required],
    });
  }

  override saveItem() {
    if (!this.form.valid || !this.selectedItem) return;
    Object.assign(this.selectedItem, this.form.value);
    super.saveItem();
  }

  override isFormValid(): boolean {
    return this.form?.valid ?? false;
  }
}

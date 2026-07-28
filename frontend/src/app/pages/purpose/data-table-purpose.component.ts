import {Component} from '@angular/core';
import {CommonModule} from '@angular/common';
import {TableModule} from 'primeng/table';
import {DialogModule} from 'primeng/dialog';
import {ButtonModule} from 'primeng/button';
import {ReactiveFormsModule, Validators} from '@angular/forms';
import {SelectModule} from 'primeng/select';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {TooltipModule} from 'primeng/tooltip';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';
import {ScreenSizeService} from '../../services/screen-size.service';
import {InputText} from 'primeng/inputtext';
import {Purpose} from './entity/purpose.entity';
import {UseType, UseTypeDescription, UseTypeOptions} from './enum/use-type.enum';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {SkeletonModule} from 'primeng/skeleton';

@Component({
             selector: 'app-data-table-purpose',
             standalone: true,
             imports: [
               ReactiveFormsModule,
               CommonModule,
               TableModule,
               DialogModule,
               ButtonModule,
               SelectModule,
               HasRoleDirective,
               TooltipModule,
               ReadOnlyDirective,
               InputText,
               SkeletonModule,
             ],
             templateUrl: './data-table-purpose.component.html'
           })
export class DataTablePurposeComponent extends AbstractDataTableComponent<Purpose> {

  readonly skeletonRows = Array(10).fill({});
  readonly skeletonCols = Array.from({length: 4}, (_, i) => i);

  useTypeDescription = UseTypeDescription;
  useTypeOptions = UseTypeOptions;

  constructor(screen: ScreenSizeService) {
    super(screen);
  }

  override itemInstance(): Purpose {
    return Purpose.create();
  }

  protected override buildForm(data?: Partial<Purpose>): void {
    this.form = this.fb.group({
      name:     [data?.name     ?? '', Validators.required],
      use_type: [data?.use_type ?? null, Validators.required],
    });
  }

  getUseTypeDescription(value: any): string {
    return this.useTypeDescription[value as UseType] || value;
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

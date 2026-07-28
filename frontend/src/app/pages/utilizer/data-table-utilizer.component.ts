import {Component} from '@angular/core';
import {CommonModule} from '@angular/common';
import {TableModule} from 'primeng/table';
import {DialogModule} from 'primeng/dialog';
import {ButtonModule} from 'primeng/button';
import {ReactiveFormsModule, Validators} from '@angular/forms';
import {SelectModule} from 'primeng/select';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {InputTextModule} from 'primeng/inputtext';
import {InputNumberModule} from 'primeng/inputnumber';
import {CheckboxModule} from 'primeng/checkbox';
import {DatePickerModule} from 'primeng/datepicker';
import {TooltipModule} from 'primeng/tooltip';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';
import {Textarea} from 'primeng/textarea';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {SkeletonModule} from 'primeng/skeleton';
import {Utilizer} from './entity/utilizer.entity';
import {ScreenSizeService} from '../../services/screen-size.service';

interface AssetOption {
  asset_id: number;
  asset_name: string;
}

@Component({
             selector: 'app-data-table-utilizer',
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
               InputNumberModule,
               CheckboxModule,
               DatePickerModule,
               TooltipModule,
               ReadOnlyDirective,
               Textarea,
               SkeletonModule,
             ],
             templateUrl: './data-table-utilizer.component.html',
           })
export class DataTableUtilizerComponent extends AbstractDataTableComponent<Utilizer> {

  readonly skeletonRows = Array(10).fill({});
  readonly skeletonCols = Array.from({length: 4}, (_, i) => i);

  constructor(
    screen: ScreenSizeService,
  ) {
    super(screen);
  }

  override ngOnInit() {
    super.ngOnInit();
  }

  override itemInstance(): Utilizer {
    return Utilizer.create();
  }

  protected override buildForm(data?: Partial<Utilizer>): void {
    this.form = this.fb.group(
      {
        name: [data?.name ?? '', Validators.required],
        description: [data?.description ?? null],
      });
  }

  override isFormValid(): boolean {
    return this.form?.valid ?? false;
  }
}

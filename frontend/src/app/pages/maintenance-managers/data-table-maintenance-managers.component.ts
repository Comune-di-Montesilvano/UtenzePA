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
import {ScreenSizeService} from '../../services/screen-size.service';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {MaintenanceManager} from './entity/maintenance-manager.entity';
import {Textarea} from 'primeng/textarea';
import {Skeleton} from 'primeng/skeleton';

@Component({
             selector: 'app-data-table-maintenance-managers',
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
               Textarea,
               Skeleton
             ],
             templateUrl: './data-table-maintenance-managers.component.html'
           })
export class DataTableMaintenanceManagersComponent extends AbstractDataTableComponent<MaintenanceManager> {

  readonly skeletonRows = Array(4).fill({});
  readonly skeletonCols = Array.from({length: 4}, (_, i) => i);

  constructor(screen: ScreenSizeService) {
    super(screen);
  }

  override itemInstance(): MaintenanceManager {
    return MaintenanceManager.create();
  }

  protected override buildForm(data?: Partial<MaintenanceManager>): void {
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

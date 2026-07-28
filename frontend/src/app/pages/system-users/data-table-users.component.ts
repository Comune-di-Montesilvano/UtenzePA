import {Component} from '@angular/core';
import {CommonModule, DatePipe} from '@angular/common';
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
import {SystemUser} from './entity/system-user.entity';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';

@Component({
  selector: 'app-data-table-users',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    CommonModule,
    TableModule,
    DatePipe,
    DialogModule,
    ButtonModule,
    SelectModule,
    HasRoleDirective,
    TooltipModule,
    ReadOnlyDirective,
    InputText,
  ],
  templateUrl: './data-table-users.component.html'
})
export class DataTableUsersComponent extends AbstractDataTableComponent<SystemUser> {

  statuses = [
    {label: 'Attivo',    value: 'Attivo'},
    {label: 'Disattivo', value: 'Disattivo'},
  ];

  roles = [
    {label: 'Admin',     value: 'Admin'},
    {label: 'Operatore', value: 'Operatore'},
    {label: 'Lettore',   value: 'Lettore'},
  ];

  constructor(screen: ScreenSizeService) {
    super(screen);
  }

  override itemInstance(): SystemUser {
    return SystemUser.create({role: 'Operatore', status: 'Attivo'});
  }

  protected override buildForm(data?: Partial<SystemUser>): void {
    this.form = this.fb.group({
      firstName: [data?.firstName ?? '', Validators.required],
      lastName:  [data?.lastName  ?? '', Validators.required],
      email:     [data?.email     ?? '', [Validators.required, Validators.email]],
      role:      [data?.role      ?? 'Operatore', Validators.required],
      status:    [data?.status    ?? 'Attivo',    Validators.required],
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

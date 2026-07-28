import {Component} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {InputTextModule} from 'primeng/inputtext';
import {ButtonModule} from 'primeng/button';
import {TableModule} from 'primeng/table';
import {SystemUsersService} from './system-users.service';
import {DataTableUsersComponent} from './data-table-users.component';
import {SearchUsersComponent} from './search-users.component';
import {MessageService} from 'primeng/api';
import {ToastModule} from 'primeng/toast';
import {SystemUser} from './entity/system-user.entity';
import {AbstractComponent} from '../../core/components/abstract.component';

@Component({
  selector: 'app-systemUsers',
  standalone: true,
  providers: [MessageService],
  imports: [
    CommonModule,
    FormsModule,
    InputTextModule,
    ButtonModule,
    TableModule,
    DataTableUsersComponent,
    SearchUsersComponent,
    ToastModule,
  ],
  templateUrl: './system-users.component.html'
})
export class SystemUsersComponent extends AbstractComponent<SystemUser> {
  creationResult?: { success: boolean; message?: string };

  constructor(protected override service: SystemUsersService) {
    super();
  }

  protected override getEntityIdentifier(entity: SystemUser): string {
    return `${entity.firstName} ${entity.lastName}`;
  }

  private generateRandomPassword(length = 6): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({length}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  override onCreate(entity: SystemUser) {
    const payload = {
      ...entity,
      password: this.generateRandomPassword(),
      created_by_user_id: this.userId,
    };
    this.service.create(payload).subscribe({
      next: (user) => {
        this.list.push(user);
        this.messageService.add({
          key: 'global',
          severity: 'success',
          summary: 'Utente creato',
          detail: `${user.firstName} ${user.lastName}`,
        });
        this.creationResult = {success: true};
        this.loadAll();
      },
      error: (err) => this.handleError(err, 'Errore generico nella creazione utente'),
    });
  }
}

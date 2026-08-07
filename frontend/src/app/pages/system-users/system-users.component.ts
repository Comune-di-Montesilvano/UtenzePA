import {Component} from '@angular/core';
import {SystemUsersService} from './system-users.service';
import {DataTableUsersComponent} from './data-table-users.component';
import {SearchUsersComponent} from './search-users.component';
import {SystemUser} from './entity/system-user.entity';
import {AbstractComponent} from '../../core/components/abstract.component';

@Component({
  selector: 'app-systemUsers',
  standalone: true,
  imports: [
    DataTableUsersComponent,
    SearchUsersComponent,
  ],
  templateUrl: './system-users.component.html'
})
export class SystemUsersComponent extends AbstractComponent<SystemUser> {

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
      next: (user: SystemUser) => {
        this.list.push(user);
        this.messageService.add({
          key: 'global',
          severity: 'success',
          summary: 'Utente creato',
          detail: `${user.firstName} ${user.lastName}`,
        });
        this.loadAll();
      },
      error: (err: any) => this.handleError(err, 'Errore generico nella creazione utente'),
    });
  }
}

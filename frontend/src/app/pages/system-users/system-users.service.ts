import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { SystemUser } from './entity/system-user.entity';
import { AbstractService } from '../../core/services/abstract.service';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { plainToInstance } from 'class-transformer';

@Injectable({
  providedIn: 'root'
})
export class SystemUsersService extends AbstractService<SystemUser> {
  protected override readonly BASE_URL = environment.apiUrl + '/system-users';
  protected override readonly entityClass = SystemUser;

  override create(user: Partial<SystemUser> & { password?: string }): Observable<SystemUser> {
    const payload = this.parseCreate(user);
    return this.http.post<any>(this.BASE_URL, payload, { headers: this.getAuthHeaders() }).pipe(
      map(data => plainToInstance(SystemUser, data))
    );
  }
}

import { SystemUser } from '../system-users/entity/system-user.entity';
import { UserStatus } from '../shared/enum/user.enums';

// Utente che può accedere o rinnovare la sessione: né cancellato né disattivato.
export function canSignIn(user: Pick<SystemUser, 'deleted' | 'status'>): boolean {
  return !user.deleted && user.status !== UserStatus.DISATTIVO;
}

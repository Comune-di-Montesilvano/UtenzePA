import { UserStatus } from '../shared/enum/user.enums';
import { canSignIn } from './can-sign-in';

describe('canSignIn', () => {
  it('solo utenti attivi e non cancellati', () => {
    expect(canSignIn({ deleted: false, status: UserStatus.ATTIVO })).toBe(true);
    expect(canSignIn({ deleted: true, status: UserStatus.ATTIVO })).toBe(false);
    expect(canSignIn({ deleted: false, status: UserStatus.DISATTIVO })).toBe(false);
  });
});

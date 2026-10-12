import { ROLES_KEY } from '@/core/auth/decorators/roles.decorator';
import { SystemUsersController } from './system-users.controller';

// L'elenco utenti (email, ruoli, stato) è riservato agli Admin come il resto
// della gestione utenti.
describe('SystemUsersController ruoli', () => {
  const rolesOf = (method: keyof SystemUsersController) =>
    Reflect.getMetadata(ROLES_KEY, SystemUsersController.prototype[method]);

  it.each(['getAll', 'create', 'update', 'remove'] as const)('%s solo Admin', (method) => {
    expect(rolesOf(method)).toEqual(['Admin']);
  });
});

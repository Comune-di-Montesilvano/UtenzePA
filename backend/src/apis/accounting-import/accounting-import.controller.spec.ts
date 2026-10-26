import { ROLES_KEY } from '@core/auth/decorators/roles.decorator';
import { AccountingImportController } from './accounting-import.controller';

describe('AccountingImportController', () => {
  it('active: stato dell import per ogni ruolo, senza i dettagli dell amministratore', async () => {
    const states = { isActive: jest.fn(async () => true) };
    const controller = new AccountingImportController({} as never, states as never);
    expect(await controller.active()).toEqual({ active: true });
    expect(Reflect.getMetadata(ROLES_KEY, AccountingImportController.prototype.active)).toEqual([
      'Admin',
      'Operatore',
      'Lettore',
    ]);
  });
});

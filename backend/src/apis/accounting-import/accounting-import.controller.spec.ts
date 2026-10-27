import { ROLES_KEY } from '@core/auth/decorators/roles.decorator';
import { AccountingImportController } from './accounting-import.controller';

describe('AccountingImportController', () => {
  it('active: stato dell import per ogni ruolo, senza i dettagli dell amministratore', async () => {
    const states = { isActive: jest.fn(async () => true) };
    const controller = new AccountingImportController({} as never, states as never, {} as never);
    expect(await controller.active()).toEqual({ active: true });
    expect(Reflect.getMetadata(ROLES_KEY, AccountingImportController.prototype.active)).toEqual([
      'Admin',
      'Operatore',
      'Lettore',
    ]);
  });

  describe('container/run', () => {
    const make = (present: boolean, state?: string, loading = false) => {
      const inbox = {
        present: jest.fn(() => present),
        readStatus: jest.fn(() => (state ? { state } : null)),
        requestRun: jest.fn(),
      };
      const service = {
        getStatus: jest.fn(async () => ({ enabled: true })),
        isRunning: jest.fn(() => loading),
      };
      const controller = new AccountingImportController(
        service as never,
        {} as never,
        inbox as never,
      );
      return { controller, inbox };
    };

    it('400 senza container', async () => {
      const { controller, inbox } = make(false);
      await expect(controller.runContainer()).rejects.toThrow(
        'Scaricamento automatico non installato.',
      );
      expect(inbox.requestRun).not.toHaveBeenCalled();
    });

    it('400 se già in corso', async () => {
      const { controller, inbox } = make(true, 'running');
      await expect(controller.runContainer()).rejects.toThrow('Scaricamento già in corso.');
      expect(inbox.requestRun).not.toHaveBeenCalled();
    });

    it('chiede il giro e risponde con lo stato', async () => {
      const { controller, inbox } = make(true, 'error');
      expect(await controller.runContainer()).toEqual({ enabled: true });
      expect(inbox.requestRun).toHaveBeenCalled();
      expect(Reflect.getMetadata(ROLES_KEY, AccountingImportController)).toEqual(['Admin']);
    });
  });

  it('400 durante un caricamento della contabilità', async () => {
    const inbox = {
      present: () => true,
      readStatus: () => ({ state: 'ok' }),
      requestRun: jest.fn(),
    };
    const service = { getStatus: jest.fn(), isRunning: () => true };
    const controller = new AccountingImportController(
      service as never,
      {} as never,
      inbox as never,
    );
    await expect(controller.runContainer()).rejects.toThrow(
      'Caricamento della contabilità in corso.',
    );
    expect(inbox.requestRun).not.toHaveBeenCalled();
  });
});

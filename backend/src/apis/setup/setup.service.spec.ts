import { SetupService } from './setup.service';
import { SystemUser } from '../system-users/entity/system-user.entity';
import { SettingsService } from '@apis/settings/settings.service';

describe('SetupService', () => {
  let service: SetupService;
  let userRepository: { count: jest.Mock; findOne: jest.Mock };
  let mailer: { sendMail: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let settings: { getBrandingSummary: jest.Mock };

  beforeEach(() => {
    userRepository = { count: jest.fn(), findOne: jest.fn() };
    mailer = { sendMail: jest.fn().mockResolvedValue(true) };
    dataSource = { transaction: jest.fn() };
    settings = {
      getBrandingSummary: jest.fn().mockResolvedValue({ entity_name: 'Comune di Montesilvano' }),
    };

    service = new SetupService(
      userRepository as never,
      mailer as never,
      dataSource as never,
      settings as never as SettingsService,
    );
  });

  describe('isAvailable', () => {
    it('restituisce true se non esiste nessun utente', async () => {
      userRepository.count.mockResolvedValue(0);

      const result = await service.isAvailable();

      expect(result).toBe(true);
    });

    it('restituisce false se esiste almeno un utente', async () => {
      userRepository.count.mockResolvedValue(1);

      const result = await service.isAvailable();

      expect(result).toBe(false);
    });
  });

  describe('requestOtp', () => {
    const originalBootstrapToken = process.env.SETUP_BOOTSTRAP_TOKEN;

    beforeEach(() => {
      process.env.SETUP_BOOTSTRAP_TOKEN = 'test-bootstrap-token';
    });

    afterEach(() => {
      process.env.SETUP_BOOTSTRAP_TOKEN = originalBootstrapToken;
    });

    it('genera un OTP a 6 cifre, hasha la password e invia l\'email se non esiste nessun admin', async () => {
      userRepository.count.mockResolvedValue(0);

      const result = await service.requestOtp({
        email: 'admin@comune.it',
        firstName: 'Mario',
        lastName: 'Rossi',
        password: 'PasswordForte123!',
        bootstrapToken: 'test-bootstrap-token',
      });

      expect(result).toBe(true);
      expect(mailer.sendMail).toHaveBeenCalledTimes(1);
      const [to, , text] = mailer.sendMail.mock.calls[0];
      expect(to).toBe('admin@comune.it');
      expect(text).toMatch(/\d{6}/);
    });

    it('rifiuta la richiesta se esiste già un utente', async () => {
      userRepository.count.mockResolvedValue(1);

      const result = await service.requestOtp({
        email: 'admin@comune.it',
        firstName: 'Mario',
        lastName: 'Rossi',
        password: 'PasswordForte123!',
        bootstrapToken: 'test-bootstrap-token',
      });

      expect(result).toBe(false);
      expect(mailer.sendMail).not.toHaveBeenCalled();
    });

    it('rifiuta la richiesta se il bootstrap token non combacia, anche a DB vuoto', async () => {
      userRepository.count.mockResolvedValue(0);

      const result = await service.requestOtp({
        email: 'admin@comune.it',
        firstName: 'Mario',
        lastName: 'Rossi',
        password: 'PasswordForte123!',
        bootstrapToken: 'token-sbagliato',
      });

      expect(result).toBe(false);
      expect(mailer.sendMail).not.toHaveBeenCalled();
    });
  });

  describe('verifyOtp', () => {
    const originalBootstrapToken = process.env.SETUP_BOOTSTRAP_TOKEN;

    beforeEach(() => {
      process.env.SETUP_BOOTSTRAP_TOKEN = 'test-bootstrap-token';
    });

    afterEach(() => {
      process.env.SETUP_BOOTSTRAP_TOKEN = originalBootstrapToken;
    });

    const requestValidPending = async (manager: {
      query: jest.Mock;
      insert: jest.Mock;
      update: jest.Mock;
    }) => {
      userRepository.count.mockResolvedValue(0);
      await service.requestOtp({
        email: 'admin@comune.it',
        firstName: 'Mario',
        lastName: 'Rossi',
        password: 'PasswordForte123!',
        bootstrapToken: 'test-bootstrap-token',
      });
      const otp = mailer.sendMail.mock.calls[0][2].match(/\d{6}/)[0];
      dataSource.transaction.mockImplementation((cb) => cb(manager));
      return otp;
    };

    it('crea l\'admin se OTP corretto e nessun utente esiste ancora', async () => {
      const manager = {
        query: jest.fn(),
        insert: jest.fn().mockResolvedValue({ identifiers: [{ id: 1 }] }),
        update: jest.fn(),
      };
      const otp = await requestValidPending(manager);
      userRepository.count.mockResolvedValue(0); // ricontrollo anti-race dentro verify

      const result = await service.verifyOtp('admin@comune.it', otp);

      expect(result).toBe(true);
      expect(manager.query).toHaveBeenCalledWith('SET FOREIGN_KEY_CHECKS=0');
      expect(manager.insert).toHaveBeenCalledWith(
        SystemUser,
        expect.objectContaining({ email: 'admin@comune.it', role: 'Admin' }),
      );
      expect(manager.update).toHaveBeenCalledWith(SystemUser, 1, {
        created_by_user_id: 1,
        updated_by_user_id: 1,
      });
      expect(manager.query).toHaveBeenCalledWith('SET FOREIGN_KEY_CHECKS=1');
    });

    it('rifiuta un OTP sbagliato', async () => {
      const manager = { query: jest.fn(), insert: jest.fn(), update: jest.fn() };
      await requestValidPending(manager);

      const result = await service.verifyOtp('admin@comune.it', '000000');

      expect(result).toBe(false);
      expect(manager.insert).not.toHaveBeenCalled();
    });

    it('rifiuta se nel frattempo esiste già un utente (anti-race)', async () => {
      const manager = { query: jest.fn(), insert: jest.fn(), update: jest.fn() };
      const otp = await requestValidPending(manager);
      userRepository.count.mockResolvedValue(1); // un'altra richiesta ha vinto la race

      const result = await service.verifyOtp('admin@comune.it', otp);

      expect(result).toBe(false);
      expect(manager.insert).not.toHaveBeenCalled();
    });

    it('rifiuta se non c\'è nessuna richiesta pendente', async () => {
      const result = await service.verifyOtp('nessuno@comune.it', '123456');

      expect(result).toBe(false);
    });

    it('riabilita FOREIGN_KEY_CHECKS anche se insert fallisce (es. race su email duplicata)', async () => {
      const manager = {
        query: jest.fn(),
        insert: jest.fn().mockRejectedValue(new Error('ER_DUP_ENTRY')),
        update: jest.fn(),
      };
      const otp = await requestValidPending(manager);
      userRepository.count.mockResolvedValue(0);

      await expect(service.verifyOtp('admin@comune.it', otp)).rejects.toThrow(
        'ER_DUP_ENTRY',
      );

      expect(manager.query).toHaveBeenCalledWith('SET FOREIGN_KEY_CHECKS=0');
      expect(manager.query).toHaveBeenCalledWith('SET FOREIGN_KEY_CHECKS=1');
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('rifiuta un OTP corretto ma scaduto', async () => {
      const manager = { query: jest.fn(), insert: jest.fn(), update: jest.fn() };
      const otp = await requestValidPending(manager);
      userRepository.count.mockResolvedValue(0);

      // Forza la scadenza dello stato pendente creato da requestValidPending.
      const pending = (service as unknown as { pending: { otpExpiry: Date } }).pending;
      pending.otpExpiry = new Date(Date.now() - 60 * 1000);

      const result = await service.verifyOtp('admin@comune.it', otp);

      expect(result).toBe(false);
      expect(manager.insert).not.toHaveBeenCalled();
    });

    it('invalida lo stato pendente dopo troppi tentativi falliti, rifiutando anche l\'OTP corretto', async () => {
      const manager = { query: jest.fn(), insert: jest.fn(), update: jest.fn() };
      const otp = await requestValidPending(manager);
      userRepository.count.mockResolvedValue(0);

      // 6 tentativi con OTP sbagliato superano il limite di 5.
      for (let i = 0; i < 6; i++) {
        await service.verifyOtp('admin@comune.it', '000000');
      }

      const result = await service.verifyOtp('admin@comune.it', otp);

      expect(result).toBe(false);
      expect(manager.insert).not.toHaveBeenCalled();
    });
  });
});

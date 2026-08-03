import { SetupService } from './setup.service';
import { SystemUser } from '../system-users/entity/system-user.entity';

describe('SetupService', () => {
  let service: SetupService;
  let userRepository: { count: jest.Mock; findOne: jest.Mock };
  let mailer: { sendMail: jest.Mock };
  let dataSource: { transaction: jest.Mock };

  beforeEach(() => {
    userRepository = { count: jest.fn(), findOne: jest.fn() };
    mailer = { sendMail: jest.fn().mockResolvedValue(true) };
    dataSource = { transaction: jest.fn() };

    service = new SetupService(
      userRepository as never,
      mailer as never,
      dataSource as never,
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
    it('genera un OTP a 6 cifre, hasha la password e invia l\'email se non esiste nessun admin', async () => {
      userRepository.count.mockResolvedValue(0);

      const result = await service.requestOtp({
        email: 'admin@comune.it',
        firstName: 'Mario',
        lastName: 'Rossi',
        password: 'PasswordForte123!',
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
      });

      expect(result).toBe(false);
      expect(mailer.sendMail).not.toHaveBeenCalled();
    });
  });

  describe('verifyOtp', () => {
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
  });
});

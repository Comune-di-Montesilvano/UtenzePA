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
});

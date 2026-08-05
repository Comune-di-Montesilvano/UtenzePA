import { HealthService } from './health.service';
import { TypeOrmHealthIndicator } from '@nestjs/terminus';

describe('HealthService', () => {
  let service: HealthService;
  let db: { pingCheck: jest.Mock };
  let originalDate: DateConstructor;

  beforeEach(() => {
    db = { pingCheck: jest.fn() };
    service = new HealthService(db as unknown as TypeOrmHealthIndicator);

    originalDate = global.Date;
    const mockDate = new Date('2024-01-01T00:00:00.000Z');
    global.Date = jest.fn(() => mockDate) as any;
    global.Date.now = jest.fn(() => mockDate.getTime());
  });

  afterEach(() => {
    global.Date = originalDate;
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('check', () => {
    it('should return health status with ok', () => {
      const result = service.check();

      expect(result).toHaveProperty('status', 'ok');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('uptime');
    });

    it('should return current timestamp', () => {
      const result = service.check();

      expect(result.timestamp).toBe('2024-01-01T00:00:00.000Z');
    });
  });

  describe('isReady', () => {
    it('should return ready status if the database ping succeeds', async () => {
      db.pingCheck.mockResolvedValue({ database: { status: 'up' } });

      const result = await service.isReady();

      expect(db.pingCheck).toHaveBeenCalledWith('database', { timeout: 1500 });
      expect(result).toEqual({ status: 'ready', timestamp: '2024-01-01T00:00:00.000Z' });
    });

    it('should return not_ready status if the database ping fails', async () => {
      // pingCheck non lancia mai: risolve con { database: { status: 'down' } }
      db.pingCheck.mockResolvedValue({ database: { status: 'down', message: 'timeout' } });

      const result = await service.isReady();

      expect(result).toEqual({ status: 'not_ready', timestamp: '2024-01-01T00:00:00.000Z' });
    });
  });
});

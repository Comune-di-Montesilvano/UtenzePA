import { Test, TestingModule } from '@nestjs/testing';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;
  let originalDate: DateConstructor;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HealthService],
    }).compile();

    service = module.get<HealthService>(HealthService);

    // Mock Date for consistent testing
    originalDate = global.Date;
    const mockDate = new Date('2024-01-01T00:00:00.000Z');
    global.Date = jest.fn(() => mockDate) as any;
    global.Date.now = jest.fn(() => mockDate.getTime());
  });

  afterEach(() => {
    // Restore original Date
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

    it('should calculate uptime correctly', () => {
      // Create a new service instance to reset start time
      const newService = new HealthService();

      // Mock Date.now to simulate time passing
      const startTime = Date.now();
      global.Date.now = jest.fn(() => startTime + 5000); // 5 seconds later

      const result = newService.check();

      expect(result.uptime).toBe(5000);
    });

    it('should always return ok status', () => {
      const results = [];
      for (let i = 0; i < 10; i++) {
        results.push(service.check());
      }

      results.forEach((result) => {
        expect(result.status).toBe('ok');
      });
    });
  });

  describe('isReady', () => {
    it('should return ready status', () => {
      const result = service.isReady();

      expect(result).toHaveProperty('status', 'ready');
      expect(result).toHaveProperty('timestamp');
    });

    it('should return current timestamp', () => {
      const result = service.isReady();

      expect(result.timestamp).toBe('2024-01-01T00:00:00.000Z');
    });

    it('should always return ready status', () => {
      const results = [];
      for (let i = 0; i < 10; i++) {
        results.push(service.isReady());
      }

      results.forEach((result) => {
        expect(result.status).toBe('ready');
      });
    });
  });

  describe('service lifecycle', () => {
    it('should maintain consistent start time', () => {
      // Create a new service with a known start time
      const startTime = new Date('2024-01-01T00:00:00.000Z').getTime();
      global.Date.now = jest.fn(() => startTime);

      const testService = new HealthService();

      // First check at start time
      const firstCheck = testService.check();

      // Simulate time passing (1 minute later)
      global.Date.now = jest.fn(() => startTime + 60000);

      const secondCheck = testService.check();

      // Both checks should have uptime based on the same start time
      expect(firstCheck.uptime).toBe(0);
      expect(secondCheck.uptime).toBe(60000);
      expect(secondCheck.uptime).toBeGreaterThan(firstCheck.uptime);
    });

    it('should handle multiple instances independently', () => {
      const service1 = new HealthService();
      const service2 = new HealthService();

      const result1 = service1.check();
      const result2 = service2.check();

      expect(result1.status).toBe('ok');
      expect(result2.status).toBe('ok');
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  let healthService: HealthService;

  const mockHealthService = {
    check: jest.fn(),
    isReady: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthService,
          useValue: mockHealthService,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    healthService = module.get<HealthService>(HealthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('check', () => {
    it('should return health status', () => {
      const mockResult = {
        status: 'ok',
        timestamp: '2024-01-01T00:00:00.000Z',
        uptime: 1000,
      };

      mockHealthService.check.mockReturnValue(mockResult);

      const result = controller.check();

      expect(result).toEqual(mockResult);
      expect(mockHealthService.check).toHaveBeenCalled();
    });
  });

  describe('liveness', () => {
    it('should return liveness status', () => {
      const result = controller.liveness();

      expect(result).toEqual({ status: 'ok' });
    });
  });

  describe('readiness', () => {
    it('should return readiness status', () => {
      const mockResult = {
        status: 'ready',
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      mockHealthService.isReady.mockReturnValue(mockResult);

      const result = controller.readiness();

      expect(result).toEqual(mockResult);
      expect(mockHealthService.isReady).toHaveBeenCalled();
    });
  });
});

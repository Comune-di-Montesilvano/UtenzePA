import { Test, TestingModule } from '@nestjs/testing';
import { CronjobsService } from './cronjobs.service';

describe('CronjobsService', () => {
  let service: CronjobsService;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CronjobsService],
    }).compile();

    service = module.get<CronjobsService>(CronjobsService);
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleCron', () => {
    it('should log when cron job executes', async () => {
      await service.handleCron();

      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleLogSpy.mock.calls[0][0]).toContain('[DEV-CRONJOB] started at:');
    });

    it('should log with current date', async () => {
      const beforeDate = new Date();
      await service.handleCron();
      const afterDate = new Date();

      expect(consoleLogSpy).toHaveBeenCalled();
      const loggedDate = consoleLogSpy.mock.calls[0][1];
      expect(loggedDate).toBeInstanceOf(Date);
      expect(loggedDate.getTime()).toBeGreaterThanOrEqual(beforeDate.getTime());
      expect(loggedDate.getTime()).toBeLessThanOrEqual(afterDate.getTime());
    });
  });
});

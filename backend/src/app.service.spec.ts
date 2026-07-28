import { Test, TestingModule } from '@nestjs/testing';
import { AppService } from './app.service';
import * as Sentry from '@sentry/nestjs';

jest.mock('@sentry/nestjs', () => ({
  logger: {
    info: jest.fn(),
  },
}));

describe('AppService', () => {
  let service: AppService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AppService],
    }).compile();

    service = module.get<AppService>(AppService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getHello', () => {
    it('should return a greeting with ISO date', () => {
      const result = service.getHello();
      expect(result).toContain('I am alive! Today is:');
      // Check that the string contains a date in ISO format
      expect(result).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
    });
  });

  describe('getError', () => {
    it('should log to Sentry and throw an error', () => {
      expect(() => service.getError()).toThrow('My first Sentry error!');
      expect(Sentry.logger.info).toHaveBeenCalledWith('User triggered test error', {
        action: 'test_error_endpoint',
      });
    });

    it('should throw error with current date', () => {
      try {
        service.getError();
      } catch (error) {
        expect(error.message).toContain('My first Sentry error! Date:');
        expect(error.message).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
      }
    });
  });
});

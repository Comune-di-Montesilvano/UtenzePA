import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

jest.mock('@sentry/nestjs', () => ({
  logger: {
    info: jest.fn(),
  },
}));

describe('AppController', () => {
  let appController: AppController;
  let appService: AppService;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
    appService = app.get<AppService>(AppService);
  });

  describe('root', () => {
    it('should return "I am alive, and today is:" + new Date', () => {
      const prefix = 'I am alive! Today is:';
      expect(appController.getHello().indexOf(prefix)).toBe(0);
    });

    it('should return a message with ISO date format', () => {
      const result = appController.getHello();
      expect(result).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
    });
  });

  describe('error endpoint', () => {
    it('should throw error when calling getError', () => {
      expect(() => appController.getError()).toThrow('My first Sentry error!');
    });

    it('should delegate to appService.getError', () => {
      const spy = jest.spyOn(appService, 'getError');
      try {
        appController.getError();
      } catch (error) {
        // Expected to throw
      }
      expect(spy).toHaveBeenCalled();
    });
  });
});

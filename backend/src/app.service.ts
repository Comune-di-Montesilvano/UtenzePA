import { HttpException, Injectable } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';

@Injectable()
export class AppService {
  getHello(): string {
    return 'I am alive! Today is: ' + new Date().toISOString();
  }

  getError(): HttpException {
    Sentry.logger.info('User triggered test error', {
      action: 'test_error_endpoint',
    });
    throw new Error('My first Sentry error! Date: ' + new Date().toISOString() + ';');
  }
}

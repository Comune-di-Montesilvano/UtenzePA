import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  private readonly startTime: Date;

  constructor() {
    this.startTime = new Date();
  }

  /**
   * Simple health check
   */
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime.getTime(),
    };
  }

  /**
   * Check if the application is ready
   */
  isReady() {
    return {
      status: 'ready',
      timestamp: new Date().toISOString(),
    };
  }
}

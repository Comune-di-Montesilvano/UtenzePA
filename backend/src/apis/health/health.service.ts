import { Injectable } from '@nestjs/common';
import { TypeOrmHealthIndicator } from '@nestjs/terminus';

@Injectable()
export class HealthService {
  private readonly startTime: Date;

  constructor(private readonly db: TypeOrmHealthIndicator) {
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
   * Check if the application is ready to serve traffic: verifica la
   * connessione al database, non solo che il processo Node sia in piedi.
   *
   * pingCheck non lancia mai in caso di fallimento: risolve sempre con
   * { database: { status: 'up' | 'down', ... } } (vedi TypeOrmHealthIndicator
   * in @nestjs/terminus). Va quindi ispezionato il risultato, non un catch.
   */
  async isReady() {
    const result = await this.db.pingCheck('database', { timeout: 1500 });
    const ready = result.database?.status === 'up';
    return {
      status: ready ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
    };
  }
}

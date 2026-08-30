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

  /**
   * Versione software da mostrare in UI (footer/sidebar). APP_VERSION è
   * valorizzata dalla CI solo per build da tag git (release.yml, es. "v1.0.1")
   * — vedi build-arg nel Dockerfile. VCS_REF è l'hash commit breve, passato
   * come build-arg separato per le build non taggate (es. verifica manuale
   * `docker build --target production` prima di taggare una release, vedi
   * CLAUDE.md): distingue "release" da "commit non ancora rilasciato" invece
   * di mostrare 'dev' in entrambi i casi.
   */
  getVersion() {
    const version = process.env['APP_VERSION'];
    if (version && version !== 'dev') return { version };
    const commit = process.env['VCS_REF'];
    if (commit) return { version: commit };
    return { version: 'dev' };
  }
}

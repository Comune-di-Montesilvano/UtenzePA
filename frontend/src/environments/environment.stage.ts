import { getRuntimeApiUrl, getRuntimeSentryDsn, getRuntimeSentryEnvironment, getRuntimeAppVersion } from './runtime-config';

export const environment = {
  production: true,
  apiUrl: getRuntimeApiUrl() || 'https://comune-montesilvano.goinfoteam.it/api/v1',
  // Nessun DSN statico di fallback: Sentry/GlitchTip è configurato solo via
  // runtime config (SENTRY_DSN in docker-compose), mai baked nel bundle —
  // permette di cambiare progetto/istanza senza rebuild.
  sentryDsn: getRuntimeSentryDsn() || '',
  sentryEnvironment: getRuntimeSentryEnvironment() || '',
  appVersion: getRuntimeAppVersion() || 'dev'
};

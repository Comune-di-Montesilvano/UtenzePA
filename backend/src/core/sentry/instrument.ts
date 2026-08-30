import * as Sentry from '@sentry/nestjs';
import 'dotenv/config';

// Compatibile Sentry SDK (nessuna configurazione dedicata GlitchTip: il DSN
// stesso indirizza al progetto giusto, SaaS o self-hosted). enabled deriva
// dalla presenza del DSN — niente gate su NODE_ENV, così l'invio a GlitchTip
// è testabile anche in sviluppo semplicemente valorizzando SENTRY_DSN.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  environment: process.env.SENTRY_ENVIRONMENT,
  // APP_VERSION: tag di release (build-arg da release.yml) o hash commit per
  // build non taggate — vedi backend/Dockerfile e health.service.ts.
  release: process.env.APP_VERSION,

  integrations: [
    Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] }),
    Sentry.httpIntegration({ breadcrumbs: true }),
  ],

  enableLogs: process.env.SENTRY_LOGS ? Boolean(process.env.SENTRY_LOGS) : false,
  tracesSampleRate: 0.1,
});

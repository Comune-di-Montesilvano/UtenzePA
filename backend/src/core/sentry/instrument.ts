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

  // Sentry 11: niente più opzione enableLogs, i log partono appena è attiva
  // un'integrazione di logging — quindi la si aggiunge solo con SENTRY_LOGS
  // valorizzata (stesso comportamento opt-in di prima).
  integrations: [
    ...(process.env.SENTRY_LOGS
      ? [Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] })]
      : []),
    Sentry.httpIntegration({ breadcrumbs: true }),
  ],

  // Sentry 11 sostituisce sendDefaultPii con dataCollection, con default
  // permissivi: per un ente pubblico niente IP/utente, cookie e body HTTP
  // (possono contenere dati personali).
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpBodies: [],
  },
  tracesSampleRate: 0.1,
});

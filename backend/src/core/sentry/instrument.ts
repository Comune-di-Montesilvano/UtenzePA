import { nodeProfilingIntegration } from '@sentry/profiling-node';
import * as Sentry from '@sentry/nestjs';
import 'dotenv/config';
import * as os from 'os';
import { EnvironmentEnum } from './enum/environment.enum';

const isDevelopment = process.env.NODE_ENV === EnvironmentEnum.Development;
const isProduction = process.env.NODE_ENV === EnvironmentEnum.Production;

const sentryConfig = {
  dsn: process.env.SENTRY_DNS,
  integrations: [
    nodeProfilingIntegration(),
    Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] }),
    Sentry.httpIntegration({ breadcrumbs: true }),
    Sentry.mongooseIntegration(),
  ],
  // Disable OpenTelemetry
  skipOpenTelemetrySetup: false,

  enableLogs: process.env.SENTRY_LOGS ? Boolean(process.env.SENTRY_LOGS) : false,
  tracesSampleRate: isProduction ? 0.1 : 0.1,
  profileSessionSampleRate: isProduction ? 0.1 : 0.1,
  sampleRate: isProduction ? 0.1 : 0.1,
  profileLifecycle: 'trace' as const,

  debug: isDevelopment,
  enabled: !isDevelopment,

  initialScope: {
    // Tags: filterable tags in the Sentry UI
    tags: {
      // Identificazione versione e deploy
      version: process.env.VERSION || 'unknown',

      // Ambiente e infrastruttura
      environment: process.env.NODE_ENV || 'development',
      server: os.hostname(),
      region: process.env.AWS_REGION || 'local',

      // Applicazione specifica
      service: process.env.PROJECT_NAME,
      component: process.env.TYPE,
    },

    contexts: {
      app: {
        name: process.env.PROJECT_NAME,
        type: process.env.TYPE,
        startTime: new Date().toISOString(),
        processId: process.pid,
      },

      runtime: {
        name: 'node',
        version: process.version,
        platform: process.platform,
        arch: process.arch,
        memory: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB',
        uptime: process.uptime(),
        cpuCount: os.cpus().length,
        cpuModel: os.cpus()[0].model,
        loadAverage: os.loadavg(),
      },

      deployment: {
        method: process.env.DEPLOYMENT_METHOD || 'manual',
        timestamp: new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' }),
        by: process.env.DEPLOYED_BY || 'unknown',
      },

      features: {
        sentryProfiling: true,
        mongooseIntegration: true,
        httpTracing: true,
        debugMode: isDevelopment,
      },
    },

    extra: {
      packageManager: 'npm',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale: process.env.LANG || 'en_US.UTF-8',

      maxMemory: process.env.NODE_OPTIONS?.includes('--max-old-space-size')
        ? process.env.NODE_OPTIONS.match(/--max-old-space-size=(\d+)/)?.[1] + 'MB'
        : Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB',

      ...(process.env.IMAGE_NAME && {
        dockerImage: process.env.IMAGE_NAME,
        dockerTag: process.env.TAG,
        softwareVersion: process.env.VERSION,
      }),
    },

    // User context per API calls autenticate
    user: {
      id: 'system',
      username: process.env.IMAGE_NAME || 'TEMPLATE-NEST-JS',
    },
  },
};

Sentry.init(sentryConfig);

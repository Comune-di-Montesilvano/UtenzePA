import 'reflect-metadata';
import {bootstrapApplication} from '@angular/platform-browser';
import {appConfig} from './app/app.config';
import {App} from './app/app';
import * as Sentry from "@sentry/angular";
import {environment} from './environments/environment';

Sentry.init({
              dsn: environment.sentryDsn,
              // Attivo solo se una DSN è configurata (runtime config, vedi
              // environment.prod.ts) — non più legato a "production".
              enabled: Boolean(environment.sentryDsn),
              environment: environment.sentryEnvironment,
              release: environment.appVersion,

              tracesSampleRate: 0.1,
              tracePropagationTargets: [environment.apiUrl],

              integrations: [
                Sentry.browserTracingIntegration(),
                Sentry.replayIntegration(
                  {
                    maskAllText: true,
                    blockAllMedia: true,
                  })
              ],

              sendDefaultPii: false,
            });

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));

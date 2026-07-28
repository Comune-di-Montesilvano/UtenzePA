import 'reflect-metadata';
import {bootstrapApplication} from '@angular/platform-browser';
import {appConfig} from './app/app.config';
import {App} from './app/app';
import * as Sentry from "@sentry/angular";
import {environment} from './environments/environment';

Sentry.init({
              dsn: environment.sentryDsn,
              enabled: environment.production,

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
              environment: environment.production ? 'production' : 'development',
            });

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));

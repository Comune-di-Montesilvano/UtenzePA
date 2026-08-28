import {
  ApplicationConfig,
  ErrorHandler,
  importProvidersFrom,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection
} from '@angular/core';
import {provideRouter, Router} from '@angular/router';
import {routes} from './app.routes';
import {NgIdleKeepaliveModule} from '@ng-idle/keepalive';
import {provideHttpClient, withInterceptors, withXhr} from '@angular/common/http';
import {provideAnimationsAsync} from '@angular/platform-browser/animations/async';
import {MatPaginatorIntl} from '@angular/material/paginator';
import {DateAdapter, MAT_DATE_LOCALE, provideNativeDateAdapter} from '@angular/material/core';
import * as Sentry from '@sentry/angular';
import {authErrorInterceptor} from './core/interceptors/auth-error.interceptor';
import {getItalianPaginatorIntl} from './core/services/it-paginator-intl';
import {ItDateAdapter} from './core/adapters/it-date-adapter';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({eventCoalescing: true}),
    provideRouter(routes),
    provideHttpClient(withXhr(), withInterceptors([authErrorInterceptor])),
    provideAnimationsAsync(),
    importProvidersFrom(NgIdleKeepaliveModule.forRoot()),
    provideNativeDateAdapter(),
    {
      provide: MAT_DATE_LOCALE,
      useValue: 'it-IT',
    },
    {
      provide: DateAdapter,
      useClass: ItDateAdapter,
    },
    {
      provide: ErrorHandler,
      useValue: Sentry.createErrorHandler(),
    },
    {
      provide: Sentry.TraceService,
      deps: [Router],
    },
    provideAppInitializer(() => {
      inject(Sentry.TraceService);
    }),
    {
      provide: MatPaginatorIntl,
      useFactory: getItalianPaginatorIntl,
    },
  ]
};

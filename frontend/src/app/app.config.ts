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
import { BrandingService } from './services/branding.service';
import { firstValueFrom } from 'rxjs';

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
    provideAppInitializer(async () => {
      const brandingService = inject(BrandingService);
      try {
        const branding = await firstValueFrom(brandingService.load());
        document.title = `UtenzePA - ${branding.entity_name}`;
        if (branding.favicon) {
          const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
          if (link) link.href = branding.favicon;
        }
        // favicon null -> resta il favicon.ico statico di index.html, nessun
        // fallback aggiuntivo necessario qui.
      } catch {
        // Backend down/CORS misconfigurato: non far fallire l'APP_INITIALIZER
        // (bloccherebbe il bootstrap dell'app con una pagina bianca, vedi
        // review branch "branding ente"). Applica i default del seed di
        // migrazione (CreateAppSettings) così current() non lancia mai dopo
        // il bootstrap, e lascia titolo/favicon statici di index.html.
        brandingService.applyFallback({
          entity_name: 'Comune di Montesilvano',
          entity_type: 'Comune',
          default_latitude: '42.5083',
          default_longitude: '14.15',
          logo: null,
          logo_mime: null,
          favicon: null,
          favicon_mime: null,
        });
        document.title = 'UtenzePA';
      }
    }),
    {
      provide: MatPaginatorIntl,
      useFactory: getItalianPaginatorIntl,
    },
  ]
};

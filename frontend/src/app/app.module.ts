import {registerLocaleData} from '@angular/common';
import {provideHttpClient} from '@angular/common/http';
import {ErrorHandler, NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';
import {ButtonModule} from 'primeng/button';
import localeIt from '@angular/common/locales/it';
import * as Sentry from "@sentry/angular";
import {Router} from '@angular/router';

registerLocaleData(localeIt, 'it');

@NgModule({
            imports: [
              BrowserModule,
              ButtonModule
            ],
            bootstrap: [],
            providers: [
              provideHttpClient(),
              {
                provide: ErrorHandler,
                useValue: Sentry.createErrorHandler(
                  {showDialog: false,}
                ),
              },
              {
                provide: Sentry.TraceService,
                deps: [Router],
              },
            ]
          })
export class AppModule {
}

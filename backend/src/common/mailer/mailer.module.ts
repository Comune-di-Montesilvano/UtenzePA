import {
  Module,
  Global,
  DynamicModule,
  InjectionToken,
  OptionalFactoryDependency,
} from '@nestjs/common';
import { MailerService } from './mailer.service';
import { MailerOptions, MAILER_OPTIONS } from './mailer.interface';

@Global()
@Module({})
export class MailerModule {
  static forRoot(options: MailerOptions): DynamicModule {
    return {
      module: MailerModule,
      providers: [
        {
          provide: MAILER_OPTIONS,
          useValue: options,
        },
        MailerService,
      ],
      exports: [MailerService],
    };
  }

  static forRootAsync(options: {
    imports?: DynamicModule['imports'];
    useFactory: (...args: unknown[]) => Promise<MailerOptions> | MailerOptions;
    inject?: Array<InjectionToken | OptionalFactoryDependency>;
  }): DynamicModule {
    return {
      module: MailerModule,
      imports: options.imports || [],
      providers: [
        {
          provide: MAILER_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject || [],
        },
        MailerService,
      ],
      exports: [MailerService],
    };
  }
}

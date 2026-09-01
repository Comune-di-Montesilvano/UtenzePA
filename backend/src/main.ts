import '@core/sentry/instrument';

import { NestFactory, Reflector } from '@nestjs/core';
import {
  ClassSerializerInterceptor,
  Logger,
  LogLevel,
  NestApplicationOptions,
  ValidationPipe,
} from '@nestjs/common';
import { AppModule } from '@/app.module';
import { EnvValidator } from '@utils/env-validator/env-validator';
import { InfisicalConfigService } from '@core/infisical/infisical-config.service';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import * as cookieParser from 'cookie-parser';
import { HttpExceptionFilter } from '@core/exceptions/http-exception.filter';
import { generateHttpOptions } from '@utils/httpOptionsNest/httpOptions';
import { configureCompression } from '@utils/compression';
import { assertProductionSecrets } from '@utils/production-guards/production-guards';

// Il default NestJS esclude 'debug'/'verbose': LOG_LEVEL=debug in .env abilita
// i log di dettaglio senza rebuild (analogo a LOG_LEVELS_BY_NAME in comunicaPA).
const LOG_LEVELS_BY_NAME: Record<string, LogLevel[]> = {
  error: ['error'],
  warn: ['error', 'warn'],
  info: ['error', 'warn', 'log'],
  log: ['error', 'warn', 'log'],
  debug: ['error', 'warn', 'log', 'debug'],
  verbose: ['error', 'warn', 'log', 'debug', 'verbose'],
};

const bootstrapLogger = new Logger('Bootstrap');

async function bootstrap() {
  assertProductionSecrets(process.env.NODE_ENV);

  EnvValidator.validate();
  EnvValidator.logConfiguration();

  const httpsOptions = generateHttpOptions();
  const logLevelName = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  const logLevels = LOG_LEVELS_BY_NAME[logLevelName] ?? LOG_LEVELS_BY_NAME.info;

  const corsOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:4300')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const options: NestApplicationOptions = {
    cors: { origin: corsOrigins },
    logger: logLevels,
    ...(httpsOptions.key && httpsOptions.cert && { httpsOptions }),
  };

  const app = await NestFactory.create(AppModule, options);

  // Default body-parser di Express/NestJS: 100kb. Il branding (logo/favicon,
  // vedi UpdateBrandingDto) accetta data URI base64 fino a MAX_DATA_URI_LENGTH
  // (~2.8MB) — senza alzare qui il limite del body JSON, qualsiasi immagine
  // oltre ~100kb falliva PRIMA della validazione DTO con "PayloadTooLargeError:
  // request entity too large" (mai raggiunto il controller/service, quindi
  // invisibile lato business logic). 3mb copre il data URI più il resto del
  // payload (entity_name, coordinate, ecc., trascurabile).
  app.use(json({ limit: '3mb' }));
  app.use(urlencoded({ extended: true, limit: '3mb' }));

  const infisicalConfig = app.get(InfisicalConfigService);

  const compressionMiddleware = configureCompression(infisicalConfig);
  if (compressionMiddleware) {
    app.use(compressionMiddleware);
  }

  app.useGlobalFilters(new HttpExceptionFilter());

  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  app.use(cookieParser(process.env.COOKIE_SECRET));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      forbidUnknownValues: true,
      validationError: { target: false },
      transformOptions: {
        enableImplicitConversion: false,
      },
    }),
  );

  app.setGlobalPrefix('api/v1');

  if (process.env.SWAGGER === 'true') {
    const { DocumentBuilder, SwaggerModule } = await import('@nestjs/swagger');
    const config = new DocumentBuilder()
      .setTitle('API documentation')
      .setDescription('REST API docs')
      .setVersion('1.0')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api-docs', app, document);
    bootstrapLogger.log('Swagger documentation enabled at /api-docs');
  }

  app.use(helmet());

  const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
  await app.listen(port);

  bootstrapLogger.log(`Bootstrap done. App ready on: ${port} (NODE_ENV=${process.env.NODE_ENV})`);
}

bootstrap().then(() => 1);

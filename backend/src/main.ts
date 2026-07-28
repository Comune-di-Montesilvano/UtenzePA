import '@core/sentry/instrument';

import { NestFactory, Reflector } from '@nestjs/core';
import { ClassSerializerInterceptor, NestApplicationOptions, ValidationPipe } from '@nestjs/common';
import { AppModule } from '@/app.module';
import { EnvValidator } from '@utils/env-validator/env-validator';
import { InfisicalConfigService } from '@core/infisical/infisical-config.service';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import { HttpExceptionFilter } from '@core/exceptions/http-exception.filter';
import { generateHttpOptions } from '@utils/httpOptionsNest/httpOptions';
import { configureCompression } from '@utils/compression';

async function bootstrap() {
  EnvValidator.validate();
  EnvValidator.logConfiguration();

  const httpsOptions = generateHttpOptions();

  const options: NestApplicationOptions = {
    cors: true,
    ...(httpsOptions.key && httpsOptions.cert && { httpsOptions }),
  };

  const app = await NestFactory.create(AppModule, options);

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
    console.info('Swagger documentation enabled at /api-docs');
  }

  app.use(helmet());

  const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
  await app.listen(port);

  console.log('================================');
  console.log('================================');
  console.log('================================');
  console.log('================================');
  console.log('Infisical Secret:', infisicalConfig.get('infisical_super_secret'));
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('================================');
  console.log('================================');
  console.log('================================');
  console.log('================================');

  console.info('Bootstrap done. App ready on: ', port);
}

bootstrap().then(() => 1);

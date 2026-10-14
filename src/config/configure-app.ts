import { RequestMethod } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { RequestContextMiddleware } from '../common/middleware/request-context.middleware.js';
import { createValidationPipe } from '../common/pipes/validation.pipe.js';

// Production, local development and API tests share the same HTTP boundary.
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(ConfigService);
  const requestContext = app.get(RequestContextMiddleware);
  app.use(requestContext.use.bind(requestContext));
  const bodyLimit = config.getOrThrow<number>('HTTP_BODY_LIMIT_BYTES');
  app.useBodyParser('json', { limit: bodyLimit });
  app.useBodyParser('urlencoded', { extended: false, limit: bodyLimit });
  app.enableShutdownHooks();
  app.use(helmet());
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'ready', method: RequestMethod.GET },
    ],
  });
  app.enableCors({
    origin: config
      .getOrThrow<string>('CORS_ORIGINS')
      .split(',')
      .map((origin) => origin.trim()),
    exposedHeaders: ['X-Request-Id'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-Id',
      'Idempotency-Key',
      'X-Support-Form-Token',
    ],
  });
  app.useGlobalPipes(createValidationPipe());

  if (config.getOrThrow<string>('NODE_ENV') !== 'production') {
    const documentConfig = new DocumentBuilder()
      .setTitle('Handled API')
      .setDescription('AI-powered support operations')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup(
      'docs',
      app,
      SwaggerModule.createDocument(app, documentConfig),
    );
  }
}

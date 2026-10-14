import { RequestMethod, ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { RequestContextMiddleware } from '../common/middleware/request-context.middleware.js';

// Production, local development and API tests share the same HTTP boundary.
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);
  const requestContext = app.get(RequestContextMiddleware);
  app.use(requestContext.use.bind(requestContext));
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
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

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

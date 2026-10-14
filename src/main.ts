import { NestFactory } from '@nestjs/core';
import { ConsoleLogger, Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { configureApp } from './config/configure-app.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: new ConsoleLogger({ json: true }),
  });
  const configService = app.get(ConfigService);

  try {
    configureApp(app);
    await app.listen(configService.getOrThrow<number>('PORT'));
  } catch (error) {
    await app.close();
    throw error;
  }
}

void bootstrap().catch(() => {
  // Startup/driver errors can contain credentials; keep the process log safe.
  new Logger('Bootstrap').error({
    event: 'application.start.failed',
    errorCode: 'INTERNAL_ERROR',
  });
  process.exitCode = 1;
});

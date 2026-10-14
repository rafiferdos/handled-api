import { NestFactory } from '@nestjs/core';
import { ConsoleLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { configureApp } from './config/configure-app.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new ConsoleLogger({ json: true }),
  });
  const configService = app.get(ConfigService);

  configureApp(app);
  await app.listen(configService.getOrThrow<number>('PORT'));
}

void bootstrap();

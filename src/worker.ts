import { ConsoleLogger, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { QueueRuntime } from './modules/queue/queue-runtime.js';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: new ConsoleLogger({ json: true }),
  });
  app.enableShutdownHooks();
  try {
    await app.get(QueueRuntime).start();
  } catch (error) {
    await app.close();
    throw error;
  }
}
void bootstrap().catch(() => {
  new Logger('Worker').error({
    event: 'worker.start.failed',
    errorCode: 'DEPENDENCY_UNAVAILABLE',
  });
  process.exitCode = 1;
});

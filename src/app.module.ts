import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { Module } from './modules/.module.js';

@Module({
  imports: [Module],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

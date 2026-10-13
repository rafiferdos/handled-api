import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { FeaturesModule } from './modules/features.module.js';

@Module({
  imports: [FeaturesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

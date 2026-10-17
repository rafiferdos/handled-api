import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ProfileService } from './profile.service.js';

@Module({
  imports: [PrismaModule],
  providers: [ProfileService],
  exports: [ProfileService],
})
export class ProfileModule {}

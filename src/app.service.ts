import { Injectable } from '@nestjs/common';
import type { AppInfoDto } from './app-info.dto.js';

@Injectable()
export class AppService {
  getInfo(): AppInfoDto {
    return { name: 'Handled API', apiVersion: 'v1', status: 'starter' };
  }
}

import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service.js';
import { Public } from './common/decorators/access.decorator.js';
import { ApiSuccessResponse } from './common/decorators/api-success-response.decorator.js';
import { AppInfoDto } from './app-info.dto.js';

@Controller()
@Public()
@ApiTags('Application')
export class AppController {
  constructor(@Inject(AppService) private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Starter API information' })
  @ApiSuccessResponse(AppInfoDto)
  getInfo(): AppInfoDto {
    return this.appService.getInfo();
  }
}

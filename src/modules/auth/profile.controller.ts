import { Body, Controller, Get, Inject, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentIdentity } from '../../common/decorators/actor.decorator.js';
import type { VerifiedIdentity } from '../../common/database/workspace-actor.js';
import { ApiSuccessResponse } from '../../common/decorators/api-success-response.decorator.js';
import { BootstrapProfileDto, ProfileResponseDto } from './profile.dto.js';
import { ProfileService } from './profile.service.js';

@ApiTags('Profile')
@ApiBearerAuth()
@Controller('me')
export class ProfileController {
  constructor(
    @Inject(ProfileService) private readonly profiles: ProfileService,
  ) {}
  @Get()
  @ApiSuccessResponse(ProfileResponseDto)
  read(@CurrentIdentity() identity: VerifiedIdentity) {
    return this.profiles.read(identity);
  }
  @Put()
  @ApiSuccessResponse(ProfileResponseDto)
  bootstrap(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Body() input: BootstrapProfileDto,
  ) {
    return this.profiles.bootstrap(identity, input);
  }
}

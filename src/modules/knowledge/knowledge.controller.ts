import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiParam, ApiTags } from '@nestjs/swagger';
import { WorkspaceScoped } from '../../common/decorators/access.decorator.js';
import { CurrentActor } from '../../common/decorators/actor.decorator.js';
import type { WorkspaceActor } from '../../common/database/workspace-actor.js';
import { ApiSuccessResponse } from '../../common/decorators/api-success-response.decorator.js';
import { uuidPipe } from '../../common/dto/input.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { KnowledgeService } from './knowledge.service.js';
import {
  CreateKnowledgeDto,
  UpdateKnowledgeDto,
  KnowledgeSearchDto,
  KnowledgeDocumentDto,
  KnowledgeSearchResponseDto,
  VersionDto,
} from './knowledge.dto.js';
@ApiTags('Knowledge')
@ApiBearerAuth()
@WorkspaceScoped()
@ApiParam({ name: 'workspaceId', format: 'uuid' })
@Controller('workspaces/:workspaceId/knowledge')
export class KnowledgeController {
  constructor(
    @Inject(KnowledgeService) private readonly service: KnowledgeService,
  ) {}
  @Post('documents')
  @ApiSuccessResponse(KnowledgeDocumentDto, { status: 201 })
  create(
    @CurrentActor() actor: WorkspaceActor,
    @Body() body: CreateKnowledgeDto,
  ) {
    return this.service.create(actor, body);
  }
  @Get('documents')
  @ApiSuccessResponse(KnowledgeDocumentDto, { paginated: true })
  list(@CurrentActor() actor: WorkspaceActor, @Query() q: PaginationQueryDto) {
    return this.service.list(actor, q);
  }
  @Get('documents/:documentId')
  @ApiSuccessResponse(KnowledgeDocumentDto)
  detail(
    @CurrentActor() actor: WorkspaceActor,
    @Param('documentId', uuidPipe) id: string,
  ) {
    return this.service.detail(actor, id);
  }
  @Patch('documents/:documentId')
  @ApiSuccessResponse(KnowledgeDocumentDto)
  update(
    @CurrentActor() actor: WorkspaceActor,
    @Param('documentId', uuidPipe) id: string,
    @Body() b: UpdateKnowledgeDto,
  ) {
    return this.service.update(actor, id, b);
  }
  @Post('documents/:documentId/publish')
  @HttpCode(202)
  @ApiSuccessResponse(KnowledgeDocumentDto, { status: 202 })
  publish(
    @CurrentActor() actor: WorkspaceActor,
    @Param('documentId', uuidPipe) id: string,
    @Body() b: VersionDto,
  ) {
    return this.service.publish(actor, id, b);
  }
  @Post('documents/:documentId/archive')
  @HttpCode(200)
  @ApiSuccessResponse(KnowledgeDocumentDto)
  archive(
    @CurrentActor() actor: WorkspaceActor,
    @Param('documentId', uuidPipe) id: string,
    @Body() b: VersionDto,
  ) {
    return this.service.archive(actor, id, b);
  }
  @Delete('documents/:documentId')
  @ApiSuccessResponse(KnowledgeDocumentDto)
  remove(
    @CurrentActor() actor: WorkspaceActor,
    @Param('documentId', uuidPipe) id: string,
    @Body() b: VersionDto,
  ) {
    return this.service.archive(actor, id, b);
  }
  @Post('documents/:documentId/reindex')
  @HttpCode(202)
  @ApiSuccessResponse(KnowledgeDocumentDto, { status: 202 })
  reindex(
    @CurrentActor() actor: WorkspaceActor,
    @Param('documentId', uuidPipe) id: string,
    @Body() b: VersionDto,
  ) {
    return this.service.reindex(actor, id, b);
  }
  @Post('search-preview')
  @HttpCode(200)
  @ApiSuccessResponse(KnowledgeSearchResponseDto)
  search(@CurrentActor() actor: WorkspaceActor, @Body() b: KnowledgeSearchDto) {
    return this.service
      .preview(actor, b.query, b.topK ?? 5)
      .then((sources) => ({ sources }));
  }
}

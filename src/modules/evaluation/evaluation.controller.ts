import { Controller, Get, Inject } from '@nestjs/common';
import { ApiBearerAuth, ApiParam, ApiProperty, ApiTags } from '@nestjs/swagger';
import { WorkspaceScoped } from '../../common/decorators/access.decorator.js';
import { CurrentActor } from '../../common/decorators/actor.decorator.js';
import type { WorkspaceActor } from '../../common/database/workspace-actor.js';
import { assertWorkspaceActor } from '../../common/database/workspace-actor.js';
import { WorkspaceRole } from '../../common/contracts/access-context.js';
import { UnitOfWork } from '../../common/database/unit-of-work.js';
import { ApiSuccessResponse } from '../../common/decorators/api-success-response.decorator.js';
import { evaluationCases, EVALUATION_VERSION } from './evaluation-cases.js';
class EvaluationCasesDto {
  @ApiProperty() version: string;
  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
  })
  cases: unknown[];
}
@ApiTags('Evaluation')
@ApiBearerAuth()
@WorkspaceScoped()
@ApiParam({ name: 'workspaceId', format: 'uuid' })
@Controller('workspaces/:workspaceId/evaluations')
export class EvaluationController {
  constructor(@Inject(UnitOfWork) private readonly uow: UnitOfWork) {}
  @Get('cases') @ApiSuccessResponse(EvaluationCasesDto) cases(
    @CurrentActor() actor: WorkspaceActor,
  ) {
    return this.uow.runAs(actor, async (tx) => {
      await assertWorkspaceActor(tx, actor, [WorkspaceRole.ADMIN]);
      return { version: EVALUATION_VERSION, cases: evaluationCases };
    });
  }
}

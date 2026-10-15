import { applyDecorators, Get, HttpCode, Post } from '@nestjs/common';
import type { Type } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { WorkspaceRole } from '../../../common/contracts/access-context.js';
import {
  Roles,
  WorkspaceScoped,
} from '../../../common/decorators/access.decorator.js';
import { ApiErrorResponses } from '../../../common/decorators/api-error-responses.decorator.js';
import { ApiSuccessResponse } from '../../../common/decorators/api-success-response.decorator.js';
import { RequireIdempotencyKey } from '../../../common/decorators/idempotency-key.decorator.js';
import { ErrorCode } from '../../../common/errors/error-codes.js';
import { emptyInvestigationBodySchema } from '../../investigation/dto/empty-investigation-body.pipe.js';
import {
  InvestigationAdmissionResponseDto,
  InvestigationDetailDto,
  InvestigationSummaryDto,
} from '../../investigation/dto/investigation-response.dto.js';
import {
  ApproveProposalRequestDto,
  EditProposalRequestDto,
  ReasonedProposalDecisionDto,
} from '../../proposal/dto/proposal-request.dto.js';
import {
  ActionAdmissionResponseDto,
  ProposalDecisionResponseDto,
  ProposalResponseDto,
} from '../../proposal/dto/proposal-response.dto.js';
import { openApiSchema } from './openapi-schema.js';
import { LeadReadRoles, LeadWriteRoles } from './workflow.contracts.js';

interface EndpointContract {
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly status: 200 | 201 | 202;
  readonly roles: readonly WorkspaceRole[];
  readonly response: Type<unknown>;
  readonly body?: Type<unknown>;
  readonly paginated?: boolean;
  readonly summary: string;
  readonly description?: string;
}

const read = { method: 'GET', status: 200, roles: LeadReadRoles } as const;
const write = { method: 'POST', roles: LeadWriteRoles } as const;
const investigations = 'workspaces/:workspaceId/investigations';
const proposals = 'workspaces/:workspaceId/proposals/:proposalId';

// CONTRACTS ONLY: applying a decorator in a future controller binds a route.
// No production controller imports this catalog in Step 1.
export const LeadEndpoints = {
  startInvestigation: {
    ...write,
    path: 'workspaces/:workspaceId/tickets/:ticketId/investigations',
    status: 202,
    response: InvestigationAdmissionResponseDto,
    summary: 'Start an investigation',
    description:
      'Empty body. Same idempotency key + same request replays the original admission. Another key while an active run exists returns 409 INVALID_STATE_TRANSITION. Durable admission is required before 202.',
  },
  listInvestigations: {
    ...read,
    path: investigations,
    response: InvestigationSummaryDto,
    paginated: true,
    summary: 'List scoped investigations',
  },
  getInvestigation: {
    ...read,
    path: investigations + '/:investigationId',
    response: InvestigationDetailDto,
    summary: 'Read investigation evidence and current state',
  },
  retryInvestigation: {
    ...write,
    path: investigations + '/:investigationId/retry',
    status: 202,
    response: InvestigationAdmissionResponseDto,
    summary: 'Create a new retry run',
    description:
      'Empty body. Retry a FAILED or NEEDS_REVIEW run by creating a new run; never mutate/reopen a terminal run. An active run conflicts with 409 INVALID_STATE_TRANSITION.',
  },
  getInvestigationProposal: {
    ...read,
    path: investigations + '/:investigationId/proposal',
    response: ProposalResponseDto,
    summary: 'Read the latest proposal and citations',
  },
  editProposal: {
    ...write,
    path: proposals + '/edit',
    status: 201,
    body: EditProposalRequestDto,
    response: ProposalResponseDto,
    summary: 'Create an immutable edited proposal version',
    description:
      'Replace editable content of the expected current version. The server retains/revalidates evidence and confidence. No in-place historical mutation.',
  },
  approveProposal: {
    ...write,
    path: proposals + '/approve',
    status: 202,
    body: ApproveProposalRequestDto,
    response: ActionAdmissionResponseDto,
    summary: 'Approve the exact current proposal version',
    description:
      'Requires verified membership, READY status, eligible confidence/evidence/current business state and atomic decision/action/outbox admission. Stale expectedVersion returns 409 PROPOSAL_VERSION_CONFLICT. Never means that the action already executed.',
  },
  rejectProposal: {
    ...write,
    path: proposals + '/reject',
    status: 200,
    body: ReasonedProposalDecisionDto,
    response: ProposalDecisionResponseDto,
    summary: 'Reject a proposal with a reason',
  },
  escalateProposal: {
    ...write,
    path: proposals + '/escalate',
    status: 200,
    body: ReasonedProposalDecisionDto,
    response: ProposalDecisionResponseDto,
    summary: 'Escalate a proposal for manual review',
  },
} as const satisfies Record<string, EndpointContract>;

export type LeadEndpointName = keyof typeof LeadEndpoints;
const readErrors = [
  ErrorCode.UNAUTHENTICATED,
  ErrorCode.FORBIDDEN,
  ErrorCode.RESOURCE_NOT_FOUND,
  ErrorCode.VALIDATION_ERROR,
  ErrorCode.RATE_LIMITED,
  ErrorCode.DEPENDENCY_UNAVAILABLE,
  ErrorCode.INTERNAL_ERROR,
] as const;
const writeErrors = [
  ...readErrors,
  ErrorCode.INVALID_STATE_TRANSITION,
  ErrorCode.PROPOSAL_VERSION_CONFLICT,
  ErrorCode.IDEMPOTENCY_CONFLICT,
  ErrorCode.BUSINESS_RULE_FAILED,
] as const;

// Use on a method in a root @Controller(); the app supplies /api/v1 globally.
// Parameter/body DTOs still belong on the handler to enforce runtime validation.
export function LeadEndpoint(name: LeadEndpointName): MethodDecorator {
  const contract: EndpointContract = LeadEndpoints[name];
  const mutation = contract.method === 'POST';
  return applyDecorators(
    mutation ? Post(contract.path) : Get(contract.path),
    HttpCode(contract.status),
    WorkspaceScoped(),
    Roles(...contract.roles),
    ApiBearerAuth(),
    ApiTags(
      contract.path.includes('/proposals/') ? 'Proposals' : 'Investigations',
    ),
    ApiOperation({
      operationId: name,
      summary: contract.summary,
      description: contract.description,
    }),
    ...Array.from(contract.path.matchAll(/:([a-zA-Z]+)/g), ([, parameter]) =>
      ApiParam({ name: parameter, format: 'uuid' }),
    ),
    ApiSuccessResponse(contract.response, {
      status: contract.status,
      paginated: contract.paginated,
    }),
    ApiErrorResponses(...(mutation ? writeErrors : readErrors)),
    ...(mutation
      ? [
          RequireIdempotencyKey(),
          ApiBody(
            contract.body
              ? { type: contract.body }
              : {
                  required: false,
                  schema: openApiSchema(emptyInvestigationBodySchema),
                },
          ),
        ]
      : []),
  );
}

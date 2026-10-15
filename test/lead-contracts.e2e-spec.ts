import { Body, Controller, Param, Query } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { SkipThrottle } from '@nestjs/throttler';
import type { OpenAPIObject } from '@nestjs/swagger';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import {
  AccessContextResolver,
  WorkspaceRole,
} from '../src/common/contracts/access-context.js';
import { PrismaService } from '../src/common/database/prisma.service.js';
import { IdempotencyKey } from '../src/common/decorators/idempotency-key.decorator.js';
import { paginated } from '../src/common/utils/pagination.js';
import { configureApp } from '../src/config/configure-app.js';
import { LeadEndpoint } from '../src/modules/ai/contracts/lead-endpoints.js';
import { EmptyInvestigationBodyPipe } from '../src/modules/investigation/dto/empty-investigation-body.pipe.js';
import {
  InvestigationListQueryDto,
  InvestigationParamsDto,
  TicketInvestigationParamsDto,
} from '../src/modules/investigation/dto/investigation-request.dto.js';
import {
  ApproveProposalRequestDto,
  EditProposalRequestDto,
  ProposalParamsDto,
  ReasonedProposalDecisionDto,
} from '../src/modules/proposal/dto/proposal-request.dto.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const resourceId = '22222222-2222-4222-8222-222222222222';
const otherWorkspaceId = '33333333-3333-4333-8333-333333333333';
const base = `/api/v1/workspaces/${workspaceId}`;

// Transport/schema fixtures ONLY. These are never imported by a production
// module and prove no DB membership, durable admission, AI or business effect.
@Controller()
@SkipThrottle()
class LeadContractFixtureController {
  @LeadEndpoint('startInvestigation')
  start(
    @Param() _params: TicketInvestigationParamsDto,
    @Body(new EmptyInvestigationBodyPipe()) _body: unknown,
    @IdempotencyKey() _key: string,
  ) {
    return { investigationId: resourceId, status: 'QUEUED' };
  }

  @LeadEndpoint('listInvestigations')
  list(@Query() query: InvestigationListQueryDto) {
    return paginated([], 0, query);
  }

  @LeadEndpoint('getInvestigation')
  detail(@Param() _params: InvestigationParamsDto) {
    return {};
  }

  @LeadEndpoint('retryInvestigation')
  retry(
    @Param() _params: InvestigationParamsDto,
    @Body(new EmptyInvestigationBodyPipe()) _body: unknown,
  ) {
    return { investigationId: resourceId, status: 'QUEUED' };
  }

  @LeadEndpoint('getInvestigationProposal')
  proposal(@Param() _params: InvestigationParamsDto) {
    return {};
  }

  @LeadEndpoint('editProposal')
  edit(
    @Param() _params: ProposalParamsDto,
    @Body() _body: EditProposalRequestDto,
  ) {
    return {};
  }

  @LeadEndpoint('approveProposal')
  approve(
    @Param() _params: ProposalParamsDto,
    @Body() _body: ApproveProposalRequestDto,
  ) {
    return { actionExecutionId: resourceId, status: 'QUEUED' };
  }

  @LeadEndpoint('rejectProposal')
  reject(
    @Param() _params: ProposalParamsDto,
    @Body() _body: ReasonedProposalDecisionDto,
  ) {
    return {};
  }

  @LeadEndpoint('escalateProposal')
  escalate(
    @Param() _params: ProposalParamsDto,
    @Body() _body: ReasonedProposalDecisionDto,
  ) {
    return {};
  }
}

async function testApp(withFixtures: boolean, role: () => WorkspaceRole) {
  const module = await Test.createTestingModule({
    imports: [AppModule],
    controllers: withFixtures ? [LeadContractFixtureController] : [],
  })
    .overrideProvider(PrismaService)
    .useValue({
      onModuleInit() {},
      onModuleDestroy() {},
      $queryRaw: () => Promise.resolve([1]),
    })
    .overrideProvider(AccessContextResolver)
    .useValue({
      authenticate: (req: { headers: { authorization?: string } }) =>
        Promise.resolve(
          req.headers.authorization === 'Bearer fixture-identity'
            ? { id: resourceId }
            : null,
        ),
      resolveMembership: (userId: string, requestedWorkspace: string) =>
        Promise.resolve(
          requestedWorkspace === workspaceId
            ? {
                id: resourceId,
                userId,
                workspaceId,
                role: role(),
                status: 'ACTIVE',
              }
            : null,
        ),
    })
    .compile();
  const app = module.createNestApplication<NestExpressApplication>({
    logger: false,
  });
  configureApp(app);
  await app.init();
  return app;
}

describe('Lead contract HTTP boundary (test doubles, not domain integration)', () => {
  let app: NestExpressApplication;
  let role: WorkspaceRole;
  beforeEach(async () => {
    role = WorkspaceRole.AGENT;
    app = await testApp(true, () => role);
  });
  afterEach(async () => {
    await app.close();
  });

  it('wraps a validated approval admission in the shared envelope and correlation header', async () => {
    const response = await request(app.getHttpServer())
      .post(`${base}/proposals/${resourceId}/approve`)
      .set('Authorization', 'Bearer fixture-identity')
      .set('Idempotency-Key', 'approve-1')
      .set('X-Request-Id', 'req_contract_1')
      .send({ expectedVersion: 1 })
      .expect(202);
    expect(response.body).toEqual({
      data: { actionExecutionId: resourceId, status: 'QUEUED' },
      requestId: 'req_contract_1',
    });
    expect(response.headers['x-request-id']).toBe('req_contract_1');
  });

  it('rejects missing idempotency and client authority fields with safe errors', async () => {
    await request(app.getHttpServer())
      .post(`${base}/proposals/${resourceId}/approve`)
      .set('Authorization', 'Bearer fixture-identity')
      .send({ expectedVersion: 1 })
      .expect(400);
    const response = await request(app.getHttpServer())
      .post(`${base}/proposals/${resourceId}/approve`)
      .set('Authorization', 'Bearer fixture-identity')
      .set('Idempotency-Key', 'approve-2')
      .send({ expectedVersion: 1, actorUserId: 'private-actor-value' })
      .expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(response.body)).not.toContain('private-actor-value');
  });

  it('does not coerce expectedVersion strings into numbers', async () => {
    await request(app.getHttpServer())
      .post(`${base}/proposals/${resourceId}/approve`)
      .set('Authorization', 'Bearer fixture-identity')
      .set('Idempotency-Key', 'approve-3')
      .send({ expectedVersion: '1' })
      .expect(400);
  });

  it('permits viewer reads with the shared pagination envelope and bounded query', async () => {
    role = WorkspaceRole.VIEWER;
    const response = await request(app.getHttpServer())
      .get(`${base}/investigations?page=2&limit=10`)
      .set('Authorization', 'Bearer fixture-identity')
      .expect(200);
    expect(response.body).toMatchObject({
      data: [],
      meta: { page: 2, limit: 10, total: 0, hasNext: false },
    });
    await request(app.getHttpServer())
      .get(`${base}/investigations?limit=101`)
      .set('Authorization', 'Bearer fixture-identity')
      .expect(400);
  });

  it('keeps anonymous, viewer-write and other-workspace checks on the common guard', async () => {
    await request(app.getHttpServer())
      .get(`${base}/investigations/${resourceId}`)
      .expect(401);
    role = WorkspaceRole.VIEWER;
    await request(app.getHttpServer())
      .post(`${base}/proposals/${resourceId}/approve`)
      .set('Authorization', 'Bearer fixture-identity')
      .set('Idempotency-Key', 'approve-4')
      .send({ expectedVersion: 1 })
      .expect(403);
    await request(app.getHttpServer())
      .get(
        `/api/v1/workspaces/${otherWorkspaceId}/investigations/${resourceId}`,
      )
      .set('Authorization', 'Bearer fixture-identity')
      .expect(404);
  });

  it('rejects model/body scope on an otherwise empty investigation trigger', async () => {
    await request(app.getHttpServer())
      .post(`${base}/tickets/${resourceId}/investigations`)
      .set('Authorization', 'Bearer fixture-identity')
      .set('Idempotency-Key', 'start-1')
      .send({})
      .expect(202);
    await request(app.getHttpServer())
      .post(`${base}/tickets/${resourceId}/investigations`)
      .set('Authorization', 'Bearer fixture-identity')
      .set('Idempotency-Key', 'start-2')
      .send({ workspaceId: otherWorkspaceId })
      .expect(400);
  });

  it('rejects nested action parameter expansion in a complete edited version', async () => {
    await request(app.getHttpServer())
      .post(`${base}/proposals/${resourceId}/edit`)
      .set('Authorization', 'Bearer fixture-identity')
      .set('Idempotency-Key', 'edit-1')
      .send({
        expectedVersion: 1,
        summary: 'Review cancellation',
        replyDraft: 'We will review your request.',
        recommendation: {
          type: 'CANCEL_AT_PERIOD_END',
          targetRef: 'SUB-1002',
          params: { currentPeriodEnd: '2099-01-01' },
        },
      })
      .expect(400);
  });

  it('documents routes, DTOs, nullable actions, envelopes and every conflict example together', async () => {
    const response = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);
    const document = response.body as OpenAPIObject;
    const approval =
      document.paths[
        '/api/v1/workspaces/{workspaceId}/proposals/{proposalId}/approve'
      ].post!;
    expect(approval.security).toEqual([{ bearer: [] }]);
    expect(approval.parameters).toContainEqual(
      expect.objectContaining({
        in: 'header',
        name: 'Idempotency-Key',
        required: true,
      }),
    );
    const conflict = approval.responses['409'];
    if (!conflict || !('content' in conflict))
      throw new Error('Missing conflict response');
    expect(
      Object.keys(conflict.content!['application/json'].examples!),
    ).toEqual(
      expect.arrayContaining([
        'PROPOSAL_VERSION_CONFLICT',
        'IDEMPOTENCY_CONFLICT',
        'INVALID_STATE_TRANSITION',
      ]),
    );
    const accepted = approval.responses['202'];
    if (!accepted || !('content' in accepted))
      throw new Error('Missing admission schema');
    expect(accepted.content!['application/json'].schema).toMatchObject({
      required: ['data', 'requestId'],
      properties: {
        data: { $ref: '#/components/schemas/ActionAdmissionResponseDto' },
      },
    });
    const edit = document.components?.schemas?.EditProposalRequestDto;
    if (!edit || !('properties' in edit))
      throw new Error('Missing edit schema');
    expect(edit.required).toContain('expectedVersion');
    const recommendation = edit.properties?.recommendation;
    expect(recommendation).toMatchObject({
      nullable: true,
      anyOf: expect.arrayContaining([
        { type: 'object', nullable: true, enum: [null] },
      ]),
    });
    expect(JSON.stringify(recommendation)).not.toContain('readOnly');
    expect(JSON.stringify(recommendation)).toContain('nullable');
    expect(JSON.stringify(recommendation)).toContain('amountMinor');
    expect(
      document.paths['/api/v1/workspaces/{workspaceId}/investigations'].get
        ?.responses['200'],
    ).toBeDefined();
  });
});

it('does not expose contract fixture routes in the shipped application', async () => {
  const app = await testApp(false, () => WorkspaceRole.AGENT);
  try {
    const response = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);
    expect(
      Object.keys(response.body.paths).some(
        (path) =>
          path.includes('/proposals/') || path.includes('/investigations'),
      ),
    ).toBe(false);
  } finally {
    await app.close();
  }
});

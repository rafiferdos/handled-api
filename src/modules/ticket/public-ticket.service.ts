import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { PrismaService } from '../../common/database/prisma.service.js';
import { UnitOfWork } from '../../common/database/unit-of-work.js';
import { IdempotencyService } from '../../common/database/idempotency.service.js';
import { assertWorkspaceActor } from '../../common/database/workspace-actor.js';
import type { WorkspaceActor } from '../../common/database/workspace-actor.js';
import { WorkspaceRole } from '../../common/contracts/access-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import { writeAudit, writeOutbox } from '../audit/audit-writer.js';
import {
  insertTicketWithMessage,
  ticketReceiptSchema,
} from './ticket-writer.js';
import type {
  PublicTicketDto,
  IssueFormTokenDto,
} from './public-ticket.dto.js';
export interface PublicFormContext {
  token: string | undefined;
  origin: string | undefined;
  ip: string;
  requestId: string;
}
@Injectable()
export class PublicTicketService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaClient,
    @Inject(UnitOfWork) private readonly uow: UnitOfWork,
    @Inject(IdempotencyService) private readonly replay: IdempotencyService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}
  private digest(value: string) {
    const pepper = this.config.get<string>('SUPPORT_FORM_TOKEN_PEPPER');
    if (!pepper || pepper.length < 32)
      throw new AppException('DEPENDENCY_UNAVAILABLE');
    return createHmac('sha256', pepper).update(value).digest('hex');
  }
  issueToken(actor: WorkspaceActor, input: IssueFormTokenDto) {
    const token = randomBytes(32).toString('base64url');
    const hash = this.digest(token);
    return this.uow.run(async (tx) => {
      await assertWorkspaceActor(tx, actor, [WorkspaceRole.ADMIN]);
      const expiresAt = new Date(Date.now() + input.expiresInHours * 3600000);
      await tx.workspace.update({
        where: { id: actor.workspaceId },
        data: {
          supportFormTokenHash: hash,
          supportFormTokenExpiresAt: expiresAt,
          version: { increment: 1 },
        },
      });
      await writeAudit(tx, actor, {
        entityType: 'workspace',
        entityId: actor.workspaceId,
        eventType: 'workspace.support_form_token_rotated',
      });
      return { token, expiresAt: expiresAt.toISOString() };
    });
  }
  async create(
    slug: string,
    context: PublicFormContext,
    key: string,
    input: PublicTicketDto,
  ) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { slug },
      select: { id: true, status: true },
    });
    if (!workspace || workspace.status !== 'ACTIVE')
      throw new AppException('RESOURCE_NOT_FOUND');
    const origins = (this.config.get<string>('PUBLIC_INTAKE_ORIGINS') || '')
      .split(',')
      .filter(Boolean);
    if (!origins.length) throw new AppException('DEPENDENCY_UNAVAILABLE');
    if (
      !context.origin ||
      !origins.includes(context.origin) ||
      !context.token ||
      !/^[A-Za-z0-9_-]{43}$/.test(context.token)
    )
      throw new AppException('FORBIDDEN');
    const tokenHash = this.digest(context.token);
    const actorScope = `public:${this.digest(`${context.ip}|${tokenHash}`)}`;
    return this.replay.run(
      {
        workspaceId: workspace.id,
        actorScope,
        operation: 'ticket.public.create',
        target: 'tickets',
        key,
      },
      {
        subject: input.subject,
        body: input.body,
        requesterEmail: input.requesterEmail.toLowerCase(),
        requesterCustomerRef: input.requesterCustomerRef ?? null,
      },
      ticketReceiptSchema,
      async (tx) => {
        const rows = await tx.$queryRaw<
          Array<{ hash: string | null; expiresAt: Date | null }>
        >`SELECT "supportFormTokenHash" AS hash,"supportFormTokenExpiresAt" AS "expiresAt" FROM handled."Workspace" WHERE id=${workspace.id}::uuid AND status='ACTIVE' FOR UPDATE`;
        const current = rows[0];
        if (!current) throw new AppException('RESOURCE_NOT_FOUND');
        if (
          !current.hash ||
          !current.expiresAt ||
          current.expiresAt.getTime() <= Date.now() ||
          !timingSafeEqual(
            Buffer.from(tokenHash, 'hex'),
            Buffer.from(current.hash, 'hex'),
          )
        )
          throw new AppException('FORBIDDEN');
      },
      async (tx) => {
        const recent = {
          workspaceId: workspace.id,
          operation: 'ticket.public.create',
          createdAt: { gte: new Date(Date.now() - 600000) },
        };
        if (
          (await tx.idempotencyRecord.count({
            where: { ...recent, actorScope },
          })) >= 5 ||
          (await tx.idempotencyRecord.count({ where: recent })) >= 100
        )
          throw new AppException('RATE_LIMITED');
        const ticket = await insertTicketWithMessage(tx, workspace.id, input, {
          source: 'PUBLIC_FORM',
          requesterEmail: input.requesterEmail.toLowerCase(),
          requesterCustomerRef: input.requesterCustomerRef,
        });
        await tx.auditEvent.create({
          data: {
            workspaceId: workspace.id,
            entityType: 'ticket',
            entityId: ticket.id,
            eventType: 'ticket.public_created',
            actorType: 'SYSTEM',
            requestId: context.requestId,
          },
        });
        await writeOutbox(tx, workspace.id, {
          type: 'ticket.created',
          aggregateId: ticket.id,
          payload: { ticketId: ticket.id },
        });
        return ticket;
      },
    );
  }
}

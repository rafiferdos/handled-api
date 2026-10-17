import { Inject, Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../common/database/unit-of-work.js';
import {
  assertIdentity,
  assertWorkspaceActor,
} from '../../common/database/workspace-actor.js';
import type {
  VerifiedIdentity,
  WorkspaceActor,
} from '../../common/database/workspace-actor.js';
import { WorkspaceRole } from '../../common/contracts/access-context.js';
import { rethrowDatabaseError } from '../../common/database/database-errors.js';
import type { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { paginationBounds, paginated } from '../../common/utils/pagination.js';
import { AppException } from '../../common/errors/app.exception.js';
import { writeAudit } from '../audit/audit-writer.js';
import type {
  CreateWorkspaceDto,
  UpdateWorkspaceDto,
} from './workspace.dto.js';

export const workspaceSelect = {
  id: true,
  slug: true,
  name: true,
  version: true,
} as const;

@Injectable()
export class WorkspaceService {
  constructor(@Inject(UnitOfWork) private readonly uow: UnitOfWork) {}
  async create(
    identity: VerifiedIdentity,
    input: CreateWorkspaceDto,
    requestId = 'workspace-create',
  ) {
    try {
      return await this.uow.run(async (tx) => {
        const user = await assertIdentity(tx, identity);
        if (
          !(await tx.profile.findUnique({
            where: { id: user.id },
            select: { id: true },
          }))
        )
          throw new AppException('BUSINESS_RULE_FAILED');
        const workspace = await tx.workspace.create({
          data: { name: input.name, slug: input.slug.trim().toLowerCase() },
          select: workspaceSelect,
        });
        await tx.membership.create({
          data: { workspaceId: workspace.id, userId: user.id, role: 'ADMIN' },
        });
        await writeAudit(
          tx,
          {
            ...identity,
            workspaceId: workspace.id,
            requestId,
          },
          {
            entityType: 'workspace',
            entityId: workspace.id,
            eventType: 'workspace.created',
          },
        );
        return workspace;
      });
    } catch (error) {
      rethrowDatabaseError(error);
    }
  }
  list(identity: VerifiedIdentity, query: PaginationQueryDto) {
    return this.uow.run(async (tx) => {
      await assertIdentity(tx, identity);
      const where = {
        status: 'ACTIVE' as const,
        memberships: {
          some: { userId: identity.userId, status: 'ACTIVE' as const },
        },
      };
      const data = await tx.workspace.findMany({
        where,
        select: workspaceSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        ...paginationBounds(query),
      });
      return paginated(data, await tx.workspace.count({ where }), query);
    });
  }
  detail(actor: WorkspaceActor) {
    return this.uow.run(async (tx) => {
      await assertWorkspaceActor(tx, actor);
      return tx.workspace.findUniqueOrThrow({
        where: { id: actor.workspaceId },
        select: workspaceSelect,
      });
    });
  }
  update(actor: WorkspaceActor, input: UpdateWorkspaceDto) {
    return this.uow.run(async (tx) => {
      await assertWorkspaceActor(tx, actor, [WorkspaceRole.ADMIN]);
      const result = await tx.workspace.updateMany({
        where: { id: actor.workspaceId, version: input.expectedVersion },
        data: { name: input.name, version: { increment: 1 } },
      });
      if (!result.count) throw new AppException('INVALID_STATE_TRANSITION');
      await writeAudit(tx, actor, {
        entityType: 'workspace',
        entityId: actor.workspaceId,
        eventType: 'workspace.updated',
      });
      return tx.workspace.findUniqueOrThrow({
        where: { id: actor.workspaceId },
        select: workspaceSelect,
      });
    });
  }
}

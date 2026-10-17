import { Inject, Injectable } from '@nestjs/common';
import { WorkspaceRole } from '../../common/contracts/access-context.js';
import { UnitOfWork } from '../../common/database/unit-of-work.js';
import { assertWorkspaceActor } from '../../common/database/workspace-actor.js';
import type { WorkspaceActor } from '../../common/database/workspace-actor.js';
import type { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { paginated, paginationBounds } from '../../common/utils/pagination.js';
import { AppException } from '../../common/errors/app.exception.js';
import { writeAudit } from '../audit/audit-writer.js';
import type { UpdateMemberDto } from './membership.dto.js';

const memberSelect = {
  id: true,
  userId: true,
  role: true,
  status: true,
  user: { select: { email: true, displayName: true } },
} as const;
const project = (member: {
  id: string;
  userId: string;
  role: string;
  status: string;
  user: { email: string; displayName: string | null };
}) => ({
  id: member.id,
  userId: member.userId,
  role: member.role,
  status: member.status,
  ...member.user,
});

@Injectable()
export class MembershipService {
  constructor(@Inject(UnitOfWork) private readonly uow: UnitOfWork) {}
  list(actor: WorkspaceActor, query: PaginationQueryDto) {
    return this.uow.runAs(actor, async (tx) => {
      await assertWorkspaceActor(tx, actor);
      const where = { workspaceId: actor.workspaceId };
      const data = await tx.membership.findMany({
        where,
        select: memberSelect,
        orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
        ...paginationBounds(query),
      });
      return paginated(
        data.map(project),
        await tx.membership.count({ where }),
        query,
      );
    });
  }
  update(actor: WorkspaceActor, id: string, input: UpdateMemberDto) {
    return this.uow.runAs(actor, async (tx) => {
      await assertWorkspaceActor(tx, actor, [WorkspaceRole.ADMIN]);
      if (input.role === undefined && input.status === undefined)
        throw new AppException('VALIDATION_ERROR');
      const current = await tx.membership.findUnique({
        where: { workspaceId_id: { workspaceId: actor.workspaceId, id } },
      });
      if (!current) throw new AppException('RESOURCE_NOT_FOUND');
      if (
        current.status === 'ACTIVE' &&
        current.role === 'ADMIN' &&
        ((input.role !== undefined && input.role !== 'ADMIN') ||
          input.status === 'DISABLED')
      ) {
        if (
          (await tx.membership.count({
            where: {
              workspaceId: actor.workspaceId,
              status: 'ACTIVE',
              role: 'ADMIN',
            },
          })) <= 1
        )
          throw new AppException('BUSINESS_RULE_FAILED');
      }
      const updated = await tx.membership.update({
        where: { id: current.id },
        data: { role: input.role, status: input.status },
        select: memberSelect,
      });
      await writeAudit(tx, actor, {
        entityType: 'membership',
        entityId: current.id,
        eventType: 'membership.updated',
        metadata: { role: updated.role, status: updated.status },
      });
      return project(updated);
    });
  }
}

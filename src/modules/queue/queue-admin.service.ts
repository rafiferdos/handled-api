import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { UnitOfWork } from '../../common/database/unit-of-work.js';
import { assertWorkspaceActor } from '../../common/database/workspace-actor.js';
import type { WorkspaceActor } from '../../common/database/workspace-actor.js';
import { WorkspaceRole } from '../../common/contracts/access-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import { parseContract } from '../../common/validation/parse-contract.js';
import { paginated, paginationBounds } from '../../common/utils/pagination.js';
import type { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { writeAudit } from '../audit/audit-writer.js';
const retrySchema = z.strictObject({
  expectedAttempts: z.number().int().min(0).max(2147483647),
});
const select = {
  id: true,
  type: true,
  aggregateId: true,
  status: true,
  attempts: true,
  availableAt: true,
  lockedUntil: true,
  createdAt: true,
  updatedAt: true,
} as const;
@Injectable()
export class QueueAdminService {
  constructor(@Inject(UnitOfWork) private readonly uow: UnitOfWork) {}
  list(actor: WorkspaceActor, q: PaginationQueryDto) {
    return this.uow.runAs(actor, async (tx) => {
      await assertWorkspaceActor(tx, actor, [WorkspaceRole.ADMIN]);
      const where = {
        workspaceId: actor.workspaceId,
        type: { startsWith: 'job.' },
      };
      return paginated(
        await tx.outboxEvent.findMany({
          where,
          select,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          ...paginationBounds(q),
        }),
        await tx.outboxEvent.count({ where }),
        q,
      );
    });
  }
  retry(actor: WorkspaceActor, id: string, input: z.input<typeof retrySchema>) {
    const body = parseContract(retrySchema, input);
    return this.uow.runAs(actor, async (tx) => {
      await assertWorkspaceActor(tx, actor, [WorkspaceRole.ADMIN]);
      const row = await tx.outboxEvent.findUnique({
        where: { workspaceId_id: { workspaceId: actor.workspaceId, id } },
      });
      if (!row) throw new AppException('RESOURCE_NOT_FOUND');
      if (
        row.status !== 'FAILED' ||
        row.attempts !== body.expectedAttempts ||
        !['job.investigation', 'job.action', 'job.knowledge-index'].includes(
          row.type,
        )
      )
        throw new AppException('INVALID_STATE_TRANSITION');
      const result = await tx.outboxEvent.update({
        where: { id },
        data: {
          status: 'PENDING',
          attempts: 0,
          availableAt: new Date(),
          lockedUntil: null,
          lockToken: null,
        },
        select,
      });
      await writeAudit(tx, actor, {
        entityType: 'outbox',
        entityId: id,
        eventType: 'job.recovery_requested',
        metadata: {
          previousAttempts: row.attempts,
          type: row.type,
          aggregateId: row.aggregateId,
        },
      });
      return result;
    });
  }
}

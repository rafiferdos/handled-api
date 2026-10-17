import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { UnitOfWork } from '../../common/database/unit-of-work.js';
import {
  assertWorkspaceActor,
  WRITERS,
} from '../../common/database/workspace-actor.js';
import type { WorkspaceActor } from '../../common/database/workspace-actor.js';
import { rethrowDatabaseError } from '../../common/database/database-errors.js';
import { AppException } from '../../common/errors/app.exception.js';
import { paginationBounds, paginated } from '../../common/utils/pagination.js';
import { writeAudit } from '../audit/audit-writer.js';
import type {
  CreateCustomerDto,
  UpdateCustomerDto,
  CustomerQueryDto,
} from './customer.dto.js';
export const customerSelect = {
  id: true,
  externalRef: true,
  name: true,
  email: true,
  status: true,
  version: true,
} as const;

export async function requireCustomer(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  id: string,
  active = false,
) {
  const customer = await tx.customer.findUnique({
    where: { workspaceId_id: { workspaceId, id } },
    select: customerSelect,
  });
  if (!customer) throw new AppException('RESOURCE_NOT_FOUND');
  if (active && customer.status !== 'ACTIVE')
    throw new AppException('BUSINESS_RULE_FAILED');
  return customer;
}
@Injectable()
export class CustomerService {
  constructor(@Inject(UnitOfWork) private readonly uow: UnitOfWork) {}
  async create(actor: WorkspaceActor, input: CreateCustomerDto) {
    try {
      return await this.uow.run(async (tx) => {
        await assertWorkspaceActor(tx, actor, WRITERS);
        const customer = await tx.customer.create({
          data: {
            workspaceId: actor.workspaceId,
            externalRef: input.externalRef,
            name: input.name,
            email: input.email.toLowerCase(),
          },
          select: customerSelect,
        });
        await writeAudit(tx, actor, {
          entityType: 'customer',
          entityId: customer.id,
          eventType: 'customer.created',
        });
        return customer;
      });
    } catch (error) {
      rethrowDatabaseError(error);
    }
  }
  list(actor: WorkspaceActor, query: CustomerQueryDto) {
    return this.uow.run(async (tx) => {
      await assertWorkspaceActor(tx, actor);
      const where: Prisma.CustomerWhereInput = {
        workspaceId: actor.workspaceId,
        status: query.status,
        ...(query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' } },
                { email: { contains: query.search, mode: 'insensitive' } },
                {
                  externalRef: { contains: query.search, mode: 'insensitive' },
                },
              ],
            }
          : {}),
      };
      return paginated(
        await tx.customer.findMany({
          where,
          select: customerSelect,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          ...paginationBounds(query),
        }),
        await tx.customer.count({ where }),
        query,
      );
    });
  }
  detail(actor: WorkspaceActor, id: string) {
    return this.uow.run(async (tx) => {
      await assertWorkspaceActor(tx, actor);
      return requireCustomer(tx, actor.workspaceId, id);
    });
  }
  update(actor: WorkspaceActor, id: string, input: UpdateCustomerDto) {
    return this.uow.run(async (tx) => {
      await assertWorkspaceActor(tx, actor, WRITERS);
      await requireCustomer(tx, actor.workspaceId, id);
      const result = await tx.customer.updateMany({
        where: {
          workspaceId: actor.workspaceId,
          id,
          version: input.expectedVersion,
        },
        data: {
          name: input.name,
          email: input.email?.toLowerCase(),
          status: input.status,
          version: { increment: 1 },
        },
      });
      if (!result.count) throw new AppException('INVALID_STATE_TRANSITION');
      await writeAudit(tx, actor, {
        entityType: 'customer',
        entityId: id,
        eventType: 'customer.updated',
      });
      return requireCustomer(tx, actor.workspaceId, id);
    });
  }
}

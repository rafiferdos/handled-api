import { Inject, Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../common/database/unit-of-work.js';
import { assertWorkspaceActor } from '../../common/database/workspace-actor.js';
import type { WorkspaceActor } from '../../common/database/workspace-actor.js';
import { requireCustomer } from '../customer/customer.service.js';
import {
  ACCOUNT_CONTEXT_LIMIT,
  paymentSelect,
  subscriptionSelect,
  accessSelect,
  paymentProjection,
  subscriptionProjection,
  accessProjection,
} from './account-projections.js';

@Injectable()
export class BillingReadService {
  constructor(@Inject(UnitOfWork) private readonly uow: UnitOfWork) {}
  context(actor: WorkspaceActor, customerId: string) {
    return this.uow.runAs(actor, async (tx) => {
      await assertWorkspaceActor(tx, actor);
      const customer = await requireCustomer(
        tx,
        actor.workspaceId,
        customerId,
        true,
      );
      const where = { workspaceId: actor.workspaceId, customerId };
      const payments = await tx.payment.findMany({
        where,
        select: paymentSelect,
        orderBy: [{ paidAt: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }],
        take: ACCOUNT_CONTEXT_LIMIT,
      });
      const subscriptions = await tx.subscription.findMany({
        where,
        select: subscriptionSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: ACCOUNT_CONTEXT_LIMIT,
      });
      const productAccess = await tx.productAccess.findMany({
        where,
        select: accessSelect,
        orderBy: [{ productCode: 'asc' }, { id: 'asc' }],
        take: ACCOUNT_CONTEXT_LIMIT,
      });
      return {
        customer,
        payments: payments.map(paymentProjection),
        subscriptions: subscriptions.map(subscriptionProjection),
        productAccess: productAccess.map(accessProjection),
        counts: {
          payments: await tx.payment.count({ where }),
          subscriptions: await tx.subscription.count({ where }),
          productAccess: await tx.productAccess.count({ where }),
        },
        limit: ACCOUNT_CONTEXT_LIMIT,
      };
    });
  }
}

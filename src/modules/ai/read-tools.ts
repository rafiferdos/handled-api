import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { UnitOfWork } from '../../common/database/unit-of-work.js';
import {
  assertWorkspaceActor,
  WRITERS,
} from '../../common/database/workspace-actor.js';
import type { WorkspaceActor } from '../../common/database/workspace-actor.js';
import { AppException } from '../../common/errors/app.exception.js';
import { canonicalJson, sha256 } from '../../common/database/json.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { BillingReadService } from '../billing/billing-read.service.js';
import {
  paymentProjectionSchema,
  subscriptionProjectionSchema,
  accessProjectionSchema,
} from '../billing/account-projections.js';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
import { requireTicket } from '../ticket/ticket.service.js';
import { readToolCallSchema } from './contracts/read-tool.contracts.js';
import type {
  ReadToolContext,
  ReadToolResult,
} from './contracts/read-tool.contracts.js';
import type { EvidenceSource } from '../proposal/contracts/evidence.schema.js';

export interface ToolContext extends ReadToolContext {
  readonly actor: WorkspaceActor;
  readonly signal?: AbortSignal;
}
export function toolSource(
  kind: 'customer' | 'payment' | 'subscription' | 'access',
  id: string,
  data: Prisma.InputJsonValue,
): EvidenceSource {
  const excerpt = canonicalJson(data);
  if (excerpt.length > 4000) throw new AppException('AI_PROVIDER_ERROR');
  return {
    sourceType: 'TOOL',
    sourceRefId: `${kind}-${id}`,
    title: `Verified ${kind} record`,
    excerpt,
    contentHash: sha256(excerpt),
    observedAt: new Date().toISOString(),
  };
}
@Injectable()
export class ReadTools {
  constructor(
    @Inject(UnitOfWork) private readonly uow: UnitOfWork,
    @Inject(BillingReadService) private readonly billing: BillingReadService,
    @Inject(KnowledgeService) private readonly knowledge: KnowledgeService,
  ) {}
  async authorize(context: ToolContext) {
    if (context.workspaceId !== context.actor.workspaceId)
      throw new AppException('RESOURCE_NOT_FOUND');
    await this.uow.runAs(context.actor, async (tx) => {
      await assertWorkspaceActor(tx, context.actor, WRITERS);
      const ticket = await requireTicket(
        tx,
        context.workspaceId,
        context.ticketId,
      );
      if (
        ticket.customerId !== context.customerId ||
        !ticket.customerVerifiedAt
      )
        throw new AppException('RESOURCE_NOT_FOUND');
      const customer = await tx.customer.findUnique({
        where: {
          workspaceId_id: {
            workspaceId: context.workspaceId,
            id: context.customerId,
          },
        },
      });
      if (customer?.status !== 'ACTIVE')
        throw new AppException('BUSINESS_RULE_FAILED');
    });
  }
  async execute(
    context: ToolContext,
    input: unknown,
  ): Promise<ReadToolResult<Prisma.InputJsonValue>> {
    const parsed = readToolCallSchema.safeParse(input);
    if (!parsed.success) throw new AppException('AI_PROVIDER_ERROR');
    const call = parsed.data;
    if (
      'customerId' in call.arguments &&
      call.arguments.customerId.toLowerCase() !== context.customerId
    )
      throw new AppException('RESOURCE_NOT_FOUND');
    await this.authorize(context);
    if (call.name === 'searchKnowledge') {
      const sources = await this.knowledge.search(
        context.workspaceId,
        call.arguments.query,
        call.arguments.topK,
        context.signal ?? AbortSignal.timeout(60000),
      );
      await this.authorize(context);
      return {
        data: sources.map((s) => ({
          sourceRefId: s.sourceRefId,
          title: s.title,
          excerpt: s.excerpt,
        })),
        sources,
        missingFacts: sources.length
          ? []
          : ['No eligible published knowledge found'],
      };
    }
    const account = await this.billing.context(
      context.actor,
      context.customerId,
    );
    const missingFacts: string[] = [];
    let data: Prisma.InputJsonValue | null, sources: EvidenceSource[];
    switch (call.name) {
      case 'getCustomerProfile':
        data = account.customer;
        sources = [
          toolSource('customer', account.customer.id, account.customer),
        ];
        break;
      case 'listCustomerPayments': {
        if (account.counts.payments > account.limit)
          missingFacts.push(
            'Payment history exceeds the bounded tool result; manual review required',
          );
        const from = call.arguments.from
            ? Date.parse(call.arguments.from)
            : -Infinity,
          to = call.arguments.to ? Date.parse(call.arguments.to) : Infinity;
        const rows = z
          .array(paymentProjectionSchema)
          .parse(account.payments)
          .filter(
            (p) =>
              p.paidAt !== null &&
              Date.parse(p.paidAt) >= from &&
              Date.parse(p.paidAt) <= to,
          );
        data = rows;
        sources = rows.map((p) => toolSource('payment', p.id, p));
        break;
      }
      case 'getActiveSubscription': {
        if (account.counts.subscriptions > account.limit)
          missingFacts.push(
            'Subscription history exceeds the bounded tool result',
          );
        const rows = z
          .array(subscriptionProjectionSchema)
          .parse(account.subscriptions)
          .filter(
            (s) =>
              s.status === 'ACTIVE' &&
              Date.parse(s.currentPeriodStart) <= Date.now() &&
              Date.parse(s.currentPeriodEnd) > Date.now(),
          );
        if (rows.length !== 1)
          missingFacts.push(
            rows.length
              ? 'Conflicting active subscriptions require manual review'
              : 'No current active subscription',
          );
        data = rows.length === 1 ? rows[0] : null;
        sources = rows.map((s) => toolSource('subscription', s.id, s));
        break;
      }
      case 'getProductAccess': {
        if (account.counts.productAccess > account.limit)
          missingFacts.push(
            'Product access history exceeds the bounded tool result',
          );
        const rows = z
          .array(accessProjectionSchema)
          .parse(account.productAccess);
        data = rows;
        sources = rows.map((s) => toolSource('access', s.id, s));
        break;
      }
    }
    await this.authorize(context);
    return { data, sources, missingFacts };
  }
}

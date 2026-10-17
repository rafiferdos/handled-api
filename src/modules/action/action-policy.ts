import { Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { Prisma } from '../../generated/prisma/client.js';
import { AppException } from '../../common/errors/app.exception.js';
import { recommendationSchema } from '../proposal/contracts/recommendation.schema.js';
import { sourceProjection } from '../proposal/proposal.repository.js';
import { verifySources } from '../proposal/source-verifier.js';
import { policyRulesSchema } from '../knowledge/policy-rules.js';
import {
  paymentProjection,
  paymentSelect,
  subscriptionProjection,
  subscriptionSelect,
  accessProjection,
  accessSelect,
} from '../billing/account-projections.js';
function deny(): never {
  throw new AppException('BUSINESS_RULE_FAILED');
}
@Injectable()
export class ActionPolicy {
  async validate(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    proposalId: string,
    phase: 'admit' | 'execute' = 'admit',
  ) {
    const proposal = await tx.proposal.findUnique({
      where: { workspaceId_id: { workspaceId, id: proposalId } },
      include: { sources: true },
    });
    if (!proposal) throw new AppException('RESOURCE_NOT_FOUND');
    if (
      proposal.confidence === 'LOW' ||
      proposal.status !== (phase === 'admit' ? 'READY' : 'APPROVED')
    )
      deny();
    const recommendation = recommendationSchema.safeParse(
      proposal.recommendationPayload,
    );
    if (!recommendation.success) deny();
    const rec = recommendation.data;
    const expectedCategory =
      rec.type === 'REFUND_DUPLICATE_PAYMENT'
        ? 'BILLING_DUPLICATE_CHARGE'
        : rec.type === 'CANCEL_AT_PERIOD_END'
          ? 'SUBSCRIPTION_CANCELLATION'
          : 'PRODUCT_ACCESS_ISSUE';
    if (proposal.category !== expectedCategory) deny();
    const ticket = await tx.ticket.findUniqueOrThrow({
      where: { workspaceId_id: { workspaceId, id: proposal.ticketId } },
    });
    const run = await tx.investigationRun.findUniqueOrThrow({
      where: { workspaceId_id: { workspaceId, id: proposal.investigationId } },
    });
    if (
      ticket.status !==
        (phase === 'admit' ? 'AWAITING_APPROVAL' : 'EXECUTING') ||
      !ticket.customerId ||
      !ticket.customerVerifiedAt ||
      run.status !== 'COMPLETED'
    )
      deny();
    if (phase === 'admit' && ticket.version !== run.ticketVersion + 1) deny();
    const newer = await tx.investigationRun.findFirst({
      where: {
        workspaceId,
        ticketId: ticket.id,
        id: { not: run.id },
        createdAt: { gte: run.createdAt },
      },
    });
    if (newer) deny();
    const latest = await tx.proposal.findFirst({
      where: { workspaceId, investigationId: run.id },
      orderBy: { version: 'desc' },
    });
    if (latest?.id !== proposalId)
      throw new AppException('PROPOSAL_VERSION_CONFLICT');
    const customer = await tx.customer.findUnique({
      where: { workspaceId_id: { workspaceId, id: ticket.customerId } },
    });
    if (customer?.status !== 'ACTIVE') deny();
    const sources = proposal.sources.map(sourceProjection);
    await verifySources(tx, workspaceId, customer.id, sources);
    const refs = new Set(sources.map((s) => s.sourceRefId));
    if (!refs.has(`customer-${customer.id}`)) deny();
    const policySources = sources.filter(
      (s) => s.sourceType === 'KNOWLEDGE' && s.score !== null && s.score >= 0.5,
    );
    if (!policySources.length) deny();
    const policies = await tx.$queryRaw<
      Array<{
        documentId: string;
        version: number;
        policyRules: Prisma.JsonValue;
      }>
    >`
   SELECT r."documentId",r.version,r."policyRules" FROM handled."KnowledgeRevision" r JOIN handled."KnowledgeDocument" d ON d.id=r."documentId" AND d."workspaceId"=r."workspaceId"
   WHERE d."workspaceId"=${workspaceId}::uuid AND d.status='PUBLISHED' AND d."publishedVersion"=r.version ORDER BY r.id LIMIT 101`;
    if (policies.length > 100) deny();
    let permitted = false,
      refundLimit = 2147483647;
    for (const policy of policies) {
      const rules = policyRulesSchema.safeParse(policy.policyRules);
      if (!rules.success) deny();
      if (rules.data.deniedActions?.includes(rec.type)) deny();
      if (rules.data.allowedActions.includes(rec.type)) {
        if (
          policySources.some(
            (s) =>
              s.sourceType === 'KNOWLEDGE' &&
              s.documentId === policy.documentId &&
              s.documentVersion === policy.version,
          )
        )
          permitted = true;
        if (rules.data.maxRefundMinor !== undefined)
          refundLimit = Math.min(refundLimit, rules.data.maxRefundMinor);
      }
    }
    if (!permitted) deny();
    const scope = { workspaceId, customerId: customer.id };
    if (rec.type === 'REFUND_DUPLICATE_PAYMENT') {
      const payment = await tx.payment.findFirst({
        where: { ...scope, externalRef: rec.targetRef },
        select: paymentSelect,
      });
      if (
        !payment ||
        !payment.subscriptionId ||
        payment.status !== 'SETTLED' ||
        !payment.paidAt ||
        payment.amountMinor <= 0 ||
        payment.amountMinor !== rec.params.amountMinor ||
        payment.currency !== rec.params.currency ||
        payment.amountMinor > refundLimit
      )
        deny();
      const other = await tx.payment.findFirst({
        where: {
          ...scope,
          id: { not: payment.id },
          subscriptionId: payment.subscriptionId,
          status: 'SETTLED',
          billingPeriodKey: payment.billingPeriodKey,
          amountMinor: payment.amountMinor,
          currency: payment.currency,
          paidAt: { not: null },
        },
        select: paymentSelect,
        orderBy: [{ paidAt: 'asc' }, { id: 'asc' }],
      });
      if (
        !other ||
        !refs.has(`payment-${payment.id}`) ||
        !refs.has(`payment-${other.id}`)
      )
        deny();
      return {
        type: rec.type,
        targetId: payment.id,
        targetRef: rec.targetRef,
        target: payment,
        beforeState: paymentProjection(payment),
        proposal,
        ticket,
      };
    }
    if (rec.type === 'CANCEL_AT_PERIOD_END') {
      const subscription = await tx.subscription.findFirst({
        where: { ...scope, externalRef: rec.targetRef },
        select: subscriptionSelect,
      });
      if (
        !subscription ||
        subscription.status !== 'ACTIVE' ||
        subscription.cancelAtPeriodEnd ||
        subscription.currentPeriodStart > new Date() ||
        subscription.currentPeriodEnd <= new Date() ||
        !refs.has(`subscription-${subscription.id}`)
      )
        deny();
      return {
        type: rec.type,
        targetId: subscription.id,
        targetRef: rec.targetRef,
        target: subscription,
        beforeState: subscriptionProjection(subscription),
        proposal,
        ticket,
      };
    }
    if (!isUUID(rec.targetRef)) deny();
    const access = await tx.productAccess.findFirst({
      where: { ...scope, id: rec.targetRef },
      select: accessSelect,
    });
    if (
      !access ||
      access.status === 'ACTIVE' ||
      !refs.has(`access-${access.id}`)
    )
      deny();
    const subscriptions = await tx.subscription.findMany({
      where: {
        ...scope,
        productCode: access.productCode,
        status: 'ACTIVE',
        currentPeriodStart: { lte: new Date() },
        currentPeriodEnd: { gt: new Date() },
      },
      take: 2,
    });
    if (subscriptions.length !== 1) deny();
    const subscription = subscriptions[0];
    const payment = await tx.payment.findFirst({
      where: {
        ...scope,
        subscriptionId: subscription.id,
        status: 'SETTLED',
        amountMinor: { gt: 0 },
        paidAt: { gte: subscription.currentPeriodStart, lte: new Date() },
      },
      orderBy: [{ paidAt: 'desc' }, { id: 'asc' }],
    });
    if (
      !payment ||
      !refs.has(`subscription-${subscription.id}`) ||
      !refs.has(`payment-${payment.id}`)
    )
      deny();
    return {
      type: rec.type,
      targetId: access.id,
      targetRef: rec.targetRef,
      target: access,
      beforeState: accessProjection(access),
      proposal,
      ticket,
    };
  }
}

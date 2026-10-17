import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { WorkspaceRole } from '../../common/contracts/access-context.js';
import { UnitOfWork } from '../../common/database/unit-of-work.js';
import {
  assertIdentity,
  assertWorkspaceActor,
} from '../../common/database/workspace-actor.js';
import type {
  WorkspaceActor,
  VerifiedIdentity,
} from '../../common/database/workspace-actor.js';
import { sha256 } from '../../common/database/json.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { paginated, paginationBounds } from '../../common/utils/pagination.js';
import { writeAudit } from '../audit/audit-writer.js';
import type { CreateInviteDto } from './membership.dto.js';

const inviteSelect = {
  id: true,
  email: true,
  role: true,
  expiresAt: true,
  acceptedAt: true,
  revokedAt: true,
} as const;
@Injectable()
export class InvitationService {
  constructor(@Inject(UnitOfWork) private readonly uow: UnitOfWork) {}
  create(actor: WorkspaceActor, input: CreateInviteDto) {
    const token = randomBytes(32).toString('base64url');
    return this.uow.run(async (tx) => {
      const member = await assertWorkspaceActor(tx, actor, [
        WorkspaceRole.ADMIN,
      ]);
      const email = input.email.trim().toLowerCase();
      if (
        await tx.membership.findFirst({
          where: {
            workspaceId: actor.workspaceId,
            user: { email: { equals: email, mode: 'insensitive' } },
          },
          select: { id: true },
        })
      )
        throw new AppException('BUSINESS_RULE_FAILED');
      await tx.invite.updateMany({
        where: {
          workspaceId: actor.workspaceId,
          email,
          acceptedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      const invite = await tx.invite.create({
        data: {
          workspaceId: actor.workspaceId,
          email,
          role: input.role,
          tokenHash: sha256(token),
          expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
          createdByUserId: actor.userId,
          createdByMembershipId: member.id,
        },
        select: inviteSelect,
      });
      await writeAudit(tx, actor, {
        entityType: 'invite',
        entityId: invite.id,
        eventType: 'invite.created',
        metadata: { role: invite.role },
      });
      return { ...invite, token };
    });
  }
  list(actor: WorkspaceActor, query: PaginationQueryDto) {
    return this.uow.run(async (tx) => {
      await assertWorkspaceActor(tx, actor, [WorkspaceRole.ADMIN]);
      const where = { workspaceId: actor.workspaceId };
      return paginated(
        await tx.invite.findMany({
          where,
          select: inviteSelect,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          ...paginationBounds(query),
        }),
        await tx.invite.count({ where }),
        query,
      );
    });
  }
  revoke(actor: WorkspaceActor, id: string) {
    return this.uow.run(async (tx) => {
      await assertWorkspaceActor(tx, actor, [WorkspaceRole.ADMIN]);
      const invite = await tx.invite.findUnique({
        where: { workspaceId_id: { workspaceId: actor.workspaceId, id } },
        select: inviteSelect,
      });
      if (!invite) throw new AppException('RESOURCE_NOT_FOUND');
      if (invite.acceptedAt) throw new AppException('INVALID_STATE_TRANSITION');
      if (invite.revokedAt) return invite;
      const result = await tx.invite.update({
        where: { id: invite.id },
        data: { revokedAt: new Date() },
        select: inviteSelect,
      });
      await writeAudit(tx, actor, {
        entityType: 'invite',
        entityId: id,
        eventType: 'invite.revoked',
      });
      return result;
    });
  }
  accept(identity: VerifiedIdentity, token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new AppException('VALIDATION_ERROR');
    return this.uow.run(async (tx) => {
      const user = await assertIdentity(tx, identity);
      const invite = await tx.invite.findUnique({
        where: { tokenHash: sha256(token) },
      });
      if (!invite) throw new AppException('RESOURCE_NOT_FOUND');
      const ws = await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM handled."Workspace" WHERE id=${invite.workspaceId}::uuid AND status='ACTIVE' FOR UPDATE`;
      if (!ws[0]) throw new AppException('RESOURCE_NOT_FOUND');
      if (
        invite.acceptedAt ||
        invite.revokedAt ||
        invite.expiresAt.getTime() <= Date.now()
      )
        throw new AppException('INVALID_STATE_TRANSITION');
      if (user.email.trim().toLowerCase() !== invite.email)
        throw new AppException('FORBIDDEN');
      const creator = await tx.membership.findUnique({
        where: { id: invite.createdByMembershipId },
      });
      if (!creator || creator.status !== 'ACTIVE' || creator.role !== 'ADMIN')
        throw new AppException('INVALID_STATE_TRANSITION');
      if (
        await tx.membership.findUnique({
          where: {
            workspaceId_userId: {
              workspaceId: invite.workspaceId,
              userId: user.id,
            },
          },
        })
      )
        throw new AppException('BUSINESS_RULE_FAILED');
      await tx.profile.upsert({
        where: { id: user.id },
        create: { id: user.id, email: user.email },
        update: { email: user.email },
      });
      const member = await tx.membership.create({
        data: {
          workspaceId: invite.workspaceId,
          userId: user.id,
          role: invite.role,
        },
        select: { id: true, workspaceId: true, role: true, status: true },
      });
      await tx.invite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });
      await writeAudit(
        tx,
        {
          ...identity,
          workspaceId: invite.workspaceId,
          requestId: 'invite-accept',
        },
        {
          entityType: 'membership',
          entityId: member.id,
          eventType: 'invite.accepted',
          metadata: { inviteId: invite.id, role: member.role },
        },
      );
      return member;
    });
  }
}

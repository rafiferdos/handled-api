import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { PrismaClient } from '../../generated/prisma/client.js';
import {
  AccessContextResolver,
  WorkspaceRole,
} from '../../common/contracts/access-context.js';
import { PrismaService } from '../../common/database/prisma.service.js';
import { UnitOfWork } from '../../common/database/unit-of-work.js';
import { assertIdentity } from '../../common/database/workspace-actor.js';
import { AppException } from '../../common/errors/app.exception.js';
import { JwtVerifier } from './jwt-verifier.js';

@Injectable()
export class SupabaseAccessContextResolver extends AccessContextResolver {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaClient,
    @Inject(UnitOfWork) private readonly uow: UnitOfWork,
    @Inject(JwtVerifier) private readonly verifier: JwtVerifier,
  ) {
    super();
  }

  async authenticate(request: Request) {
    const identity = await this.verifier.verify(request.headers.authorization);
    if (!identity) return null;
    try {
      const user = await this.uow.run((tx) => assertIdentity(tx, identity));
      return {
        id: user.id,
        email: user.email,
        sessionId: identity.sessionId,
        expiresAt: identity.expiresAt,
      };
    } catch (error) {
      if (error instanceof AppException && error.code === 'UNAUTHENTICATED')
        return null;
      throw new AppException('DEPENDENCY_UNAVAILABLE');
    }
  }

  async resolveMembership(userId: string, workspaceId: string) {
    try {
      const member = await this.prisma.membership.findFirst({
        where: {
          userId,
          workspaceId,
          status: 'ACTIVE',
          workspace: { status: 'ACTIVE' },
        },
      });
      if (!member) return null;
      return {
        id: member.id,
        userId: member.userId,
        workspaceId: member.workspaceId,
        role: WorkspaceRole[member.role],
        status: 'ACTIVE' as const,
      };
    } catch {
      throw new AppException('DEPENDENCY_UNAVAILABLE');
    }
  }
}

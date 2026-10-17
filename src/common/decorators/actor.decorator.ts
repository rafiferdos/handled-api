import { randomUUID } from 'node:crypto';
import { createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from '../contracts/access-context.js';
import type {
  VerifiedIdentity,
  WorkspaceActor,
} from '../database/workspace-actor.js';
import { AppException } from '../errors/app.exception.js';

function identity(request: AuthenticatedRequest): VerifiedIdentity {
  if (!request.user?.sessionId || !request.user.expiresAt)
    throw new AppException('UNAUTHENTICATED');
  return {
    userId: request.user.id,
    sessionId: request.user.sessionId,
    expiresAt: request.user.expiresAt,
  };
}

export const CurrentIdentity = createParamDecorator(
  (_data: unknown, context: ExecutionContext): VerifiedIdentity =>
    identity(context.switchToHttp().getRequest<AuthenticatedRequest>()),
);

export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): WorkspaceActor => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.membership) throw new AppException('RESOURCE_NOT_FOUND');
    return {
      ...identity(request),
      workspaceId: request.membership.workspaceId,
      requestId: request.requestId || randomUUID(),
    };
  },
);

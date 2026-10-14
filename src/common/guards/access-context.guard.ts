import { Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isUUID } from 'class-validator';
import { AccessContextResolver, WorkspaceRole } from '../contracts/access-context.js';
import type { AuthenticatedRequest } from '../contracts/access-context.js';
import { RequestContextService } from '../context/request-context.service.js';
import { PUBLIC_ROUTE, REQUIRED_ROLES, WORKSPACE_SCOPED } from '../decorators/access.decorator.js';
import { AppException } from '../errors/app.exception.js';
import { ErrorCode } from '../errors/error-codes.js';

@Injectable()
export class AccessContextGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AccessContextResolver) private readonly resolver: AccessContextResolver,
    @Inject(RequestContextService) private readonly context: RequestContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.user = undefined;
    request.membership = undefined;
    const roles = this.reflector.getAllAndOverride<WorkspaceRole[]>(REQUIRED_ROLES, targets);
    const scoped = this.reflector.getAllAndOverride<boolean>(WORKSPACE_SCOPED, targets);
    const workspaceId = request.params.workspaceId;

    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, targets)) {
      // A public workspaceSlug intake route needs its own abuse protection.
      if (scoped || roles || workspaceId) throw new AppException(ErrorCode.INTERNAL_ERROR);
      return true;
    }

    const user = await this.resolver.authenticate(request);
    if (!user?.id) throw new AppException(ErrorCode.UNAUTHENTICATED);
    request.user = user;
    this.context.setIdentity(user.id);

    if (workspaceId !== undefined || scoped || roles) {
      if (typeof workspaceId !== 'string' || !isUUID(workspaceId)) {
        throw new AppException(ErrorCode.VALIDATION_ERROR);
      }
      const membership = await this.resolver.resolveMembership(user.id, workspaceId);
      if (
        !membership || membership.status !== 'ACTIVE' ||
        membership.workspaceId !== workspaceId || membership.userId !== user.id ||
        !Object.values(WorkspaceRole).includes(membership.role)
      ) {
        throw new AppException(ErrorCode.RESOURCE_NOT_FOUND);
      }
      if (roles && !roles.includes(membership.role)) {
        throw new AppException(ErrorCode.FORBIDDEN);
      }
      request.membership = membership;
      this.context.setIdentity(user.id, workspaceId);
    }
    return true;
  }
}

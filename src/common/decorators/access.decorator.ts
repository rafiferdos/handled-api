import { createParamDecorator, SetMetadata } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest, WorkspaceRole } from '../contracts/access-context.js';
import { AppException } from '../errors/app.exception.js';
import { ErrorCode } from '../errors/error-codes.js';

export const PUBLIC_ROUTE = 'handled:public';
export const REQUIRED_ROLES = 'handled:roles';
export const WORKSPACE_SCOPED = 'handled:workspace-scoped';

export const Public = () => SetMetadata(PUBLIC_ROUTE, true);
export const Roles = (...roles: WorkspaceRole[]) => SetMetadata(REQUIRED_ROLES, roles);
export const WorkspaceScoped = () => SetMetadata(WORKSPACE_SCOPED, true);

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user) throw new AppException(ErrorCode.UNAUTHENTICATED);
    return user;
  },
);

export const CurrentWorkspace = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const membership = context.switchToHttp().getRequest<AuthenticatedRequest>().membership;
    if (!membership) throw new AppException(ErrorCode.RESOURCE_NOT_FOUND);
    return membership;
  },
);

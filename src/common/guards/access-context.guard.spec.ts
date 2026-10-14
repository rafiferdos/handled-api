import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  AccessContextResolver,
  WorkspaceRole,
} from '../contracts/access-context.js';
import type {
  AuthenticatedRequest,
  WorkspaceMembership,
} from '../contracts/access-context.js';
import { RequestContextService } from '../context/request-context.service.js';
import {
  Public,
  Roles,
  WorkspaceScoped,
} from '../decorators/access.decorator.js';
import { AccessContextGuard } from './access-context.guard.js';
import { DenyAccessContextResolver } from '../../modules/auth/deny-access-context.resolver.js';

class Routes {
  @Public() publicRoute() {}
  privateRoute() {}
  @WorkspaceScoped() scopedRoute() {}
  @Roles(WorkspaceRole.ADMIN) adminRoute() {}
}

describe('AccessContextGuard', () => {
  const workspaceId = 'a62c1b46-3429-4e12-b7d2-4a01be581a01';
  let request: AuthenticatedRequest;
  let resolver: AccessContextResolver;
  let authenticate = vi.fn();
  let resolveMembership = vi.fn();
  let membership: WorkspaceMembership;

  beforeEach(() => {
    request = { params: {}, headers: {} } as AuthenticatedRequest;
    membership = {
      id: 'membership',
      userId: 'user',
      workspaceId,
      role: WorkspaceRole.VIEWER,
      status: 'ACTIVE',
    };
    authenticate = vi.fn().mockResolvedValue({ id: 'user' });
    resolveMembership = vi
      .fn()
      .mockImplementation(() => Promise.resolve(membership));
    resolver = { authenticate, resolveMembership };
  });

  function activate(route: keyof Routes, activeResolver = resolver) {
    const context = {
      getClass: () => Routes,
      getHandler: () => Routes.prototype[route],
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return new AccessContextGuard(
      new Reflector(),
      activeResolver,
      new RequestContextService(),
    ).canActivate(context);
  }

  it('denies private routes until a verified identity resolver exists', async () => {
    request.user = { id: 'client-injected' };
    await expect(
      activate('privateRoute', new DenyAccessContextResolver()),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(request.user).toBeUndefined();
  });

  it('allows explicitly public endpoints without treating headers as identity', async () => {
    expect(await activate('publicRoute')).toBe(true);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('resolves membership from the authenticated user and exact route workspace', async () => {
    request.params.workspaceId = workspaceId;
    expect(await activate('scopedRoute')).toBe(true);
    expect(resolveMembership).toHaveBeenCalledWith('user', workspaceId);
    expect(request.membership?.role).toBe(WorkspaceRole.VIEWER);
  });

  it.each([WorkspaceRole.VIEWER, WorkspaceRole.AGENT])(
    'blocks %s on ADMIN routes',
    async (role) => {
      request.params.workspaceId = workspaceId;
      membership.role = role;
      await expect(activate('adminRoute')).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    },
  );

  it('allows ADMIN only with an active same-user, same-workspace membership', async () => {
    request.params.workspaceId = workspaceId;
    membership.role = WorkspaceRole.ADMIN;
    expect(await activate('adminRoute')).toBe(true);
    membership.workspaceId = 'another-workspace';
    await expect(activate('adminRoute')).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    });
    membership.workspaceId = workspaceId;
    membership.userId = 'another-user';
    await expect(activate('adminRoute')).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    });
  });

  it('rejects a missing workspace on role-scoped routes', async () => {
    await expect(activate('adminRoute')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
});

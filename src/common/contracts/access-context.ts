import type { Request } from 'express';

export enum WorkspaceRole {
  ADMIN = 'ADMIN',
  AGENT = 'AGENT',
  VIEWER = 'VIEWER',
}

export interface AuthenticatedUser {
  id: string;
  // Identity only. Roles always come from an active database membership.
  email?: string;
}

export interface WorkspaceMembership {
  id: string;
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
  status: 'ACTIVE';
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  membership?: WorkspaceMembership;
}

// Person A owns the implementation (JWKS verification + scoped DB membership).
export abstract class AccessContextResolver {
  abstract authenticate(request: Request): Promise<AuthenticatedUser | null>;
  abstract resolveMembership(
    userId: string,
    workspaceId: string,
  ): Promise<WorkspaceMembership | null>;
}
